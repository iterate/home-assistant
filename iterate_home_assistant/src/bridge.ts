import {
  getStates,
  type HassEntity,
  type HassEvent,
} from "home-assistant-js-websocket";
import {
  connectItxReady,
  type CapabilityProvision,
  type Stream,
  type StreamEventInput,
} from "iterate/node";
import {
  CAPABILITY_TYPES,
  capabilityInstructions,
  createHomeAssistantCapability,
} from "./capability.js";
import type { BridgeConfig } from "./config.js";
import { EventQueue } from "./event-queue.js";
import { connectHomeAssistant, subscribeAllEvents } from "./home-assistant.js";
import type { BridgeJournal, GapRecord } from "./journal.js";
import { log } from "./log.js";
import { abortPromise, sleep, withTimeout } from "./timeout.js";

const APPEND_BATCH_SIZE = 50;
const HEALTH_CHECK_INTERVAL_MS = 10_000;
const RPC_TIMEOUT_MS = 25_000;
const SNAPSHOT_CHUNK_SIZE = 200;

type DisposableRpc = {
  [Symbol.dispose]?(): void;
};

export async function runBridgeForever(input: {
  bridgeVersion: string;
  config: BridgeConfig;
  journal: BridgeJournal;
  signal: AbortSignal;
  supervisorToken: string;
}): Promise<void> {
  let attempt = 0;
  while (!input.signal.aborted) {
    let activeSessionId: string | undefined;
    try {
      activeSessionId = await runBridgeSession(input);
      throw new Error("bridge session ended without an error");
    } catch (error) {
      if (input.signal.aborted) {
        if (activeSessionId) {
          await input.journal.failActiveSession("bridge stopped");
        }
        return;
      }

      const failure = asError(error);
      await input.journal.failActiveSession(failure.message);
      if (isConfigurationFailure(failure)) throw failure;

      attempt += 1;
      const retryDelayMs = Math.min(
        30_000,
        1_000 * 2 ** Math.min(attempt - 1, 5),
      );
      log.error("bridge session failed", {
        error: failure.message,
        retryDelayMs,
        sessionId: activeSessionId,
      });
      await sleep(retryDelayMs, input.signal);
    }
  }
}

async function runBridgeSession(input: {
  bridgeVersion: string;
  config: BridgeConfig;
  journal: BridgeJournal;
  signal: AbortSignal;
  supervisorToken: string;
}): Promise<string> {
  log.info("connecting to Iterate", {
    itxPath: `itx.${input.config.itxPath.join(".")}`,
    projectSlug: input.config.projectSlug,
    streamPath: input.config.streamPath,
    url: input.config.iterateUrl,
  });

  const project = await connectItxReady(
    {
      auth: {
        type: "project-secret",
        projectSlug: input.config.projectSlug,
        secret: input.config.projectSecret,
      },
      baseUrl: input.config.iterateUrl,
      projectId: input.config.projectSlug,
    },
    {
      retryInitialConnection: {
        onRetry: ({ error }) =>
          log.warn("retrying initial Iterate connection", {
            error: error.message,
          }),
      },
    },
  );

  let homeAssistant:
    | Awaited<ReturnType<typeof connectHomeAssistant>>
    | undefined;
  let provision: CapabilityProvision | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;
  const sessionAbort = new AbortController();
  const relayAbort = () => sessionAbort.abort(input.signal.reason);
  input.signal.addEventListener("abort", relayAbort, { once: true });

  try {
    await withTimeout(
      project.__describe(),
      RPC_TIMEOUT_MS,
      "Iterate authentication",
    );
    const stream = project.streams.get(input.config.streamPath);
    await appendPendingGap(stream, input.journal.pendingGap);
    if (input.journal.pendingGap) await input.journal.clearPendingGap();

    homeAssistant = await withTimeout(
      connectHomeAssistant({ token: input.supervisorToken }),
      RPC_TIMEOUT_MS,
      "Home Assistant connection",
    );

    const sessionId = crypto.randomUUID();
    const connectedAt = new Date().toISOString();
    const queue = new EventQueue();
    const failSession = (error: Error) => sessionAbort.abort(error);
    const onEvent = (event: HassEvent) => {
      try {
        queue.push(event);
      } catch (error) {
        failSession(asError(error));
      }
    };

    unsubscribe = await withTimeout(
      subscribeAllEvents(homeAssistant.connection, onEvent),
      RPC_TIMEOUT_MS,
      "Home Assistant event subscription",
    );
    await input.journal.startSession(sessionId, connectedAt);

    const states = await withTimeout(
      getStates(homeAssistant.connection),
      RPC_TIMEOUT_MS,
      "Home Assistant state snapshot",
    );
    const snapshotBoundary = queue.lastSequence;

    const capability = createHomeAssistantCapability({
      bridgeVersion: input.bridgeVersion,
      config: input.config,
      connectedAt,
      connection: homeAssistant.connection,
      sessionId,
    });
    provision = await withTimeout(
      project.capabilityHosts.get("/").provideCapability({
        capability,
        instructions: capabilityInstructions(input.config),
        path: input.config.itxPath,
        type: "live",
        types: CAPABILITY_TYPES,
      }),
      RPC_TIMEOUT_MS,
      "Iterate capability mount",
    );

    await appendSessionStarted(stream, {
      bridgeVersion: input.bridgeVersion,
      config: input.config,
      connectedAt,
      homeAssistantVersion: homeAssistant.connection.haVersion,
      sessionId,
    });
    await drainThroughBoundary(stream, queue, sessionId, snapshotBoundary);
    await appendSnapshot(stream, sessionId, states);

    log.info("bridge session ready", {
      homeAssistantVersion: homeAssistant.connection.haVersion,
      sessionId,
      snapshotEntities: states.length,
    });

    await Promise.race([
      writeEvents(stream, queue, sessionId, sessionAbort.signal),
      healthCheck(project, sessionAbort.signal),
      homeAssistant.disconnected,
      abortPromise(sessionAbort.signal),
      abortPromise(input.signal),
    ]);
    return sessionId;
  } finally {
    input.signal.removeEventListener("abort", relayAbort);
    sessionAbort.abort(new Error("bridge session closing"));
    if (unsubscribe) {
      await withTimeout(
        unsubscribe(),
        5_000,
        "Home Assistant unsubscribe",
      ).catch(() => {});
    }
    homeAssistant?.close();
    if (provision) {
      await withTimeout(
        provision.revoke(),
        5_000,
        "Iterate capability revoke",
      ).catch(() => {});
    }
    disposeRpc(provision);
    disposeRpc(project);
  }
}

async function appendPendingGap(
  stream: Stream,
  gap: GapRecord | undefined,
): Promise<void> {
  if (!gap) return;
  await withTimeout(
    stream.append({
      type: "home-assistant/gap",
      idempotencyKey: `ha:${gap.sessionId}:gap`,
      payload: {
        endedAt: gap.endedAt,
        reason: gap.reason,
        sessionId: gap.sessionId,
        startedAt: gap.startedAt,
      },
    }),
    RPC_TIMEOUT_MS,
    "append Home Assistant gap",
  );
}

async function appendSessionStarted(
  stream: Stream,
  input: {
    bridgeVersion: string;
    config: BridgeConfig;
    connectedAt: string;
    homeAssistantVersion: string;
    sessionId: string;
  },
): Promise<void> {
  await withTimeout(
    stream.append({
      type: "home-assistant/bridge-session-started",
      idempotencyKey: `ha:${input.sessionId}:started`,
      payload: {
        bridgeVersion: input.bridgeVersion,
        connectedAt: input.connectedAt,
        homeAssistantVersion: input.homeAssistantVersion,
        itxPath: `itx.${input.config.itxPath.join(".")}`,
        sessionId: input.sessionId,
        streamPath: input.config.streamPath,
      },
    }),
    RPC_TIMEOUT_MS,
    "append Home Assistant session",
  );
}

async function appendSnapshot(
  stream: Stream,
  sessionId: string,
  states: HassEntity[],
): Promise<void> {
  const snapshotId = crypto.randomUUID();
  const capturedAt = new Date().toISOString();
  const chunks = chunk(states, SNAPSHOT_CHUNK_SIZE);
  if (chunks.length === 0) chunks.push([]);

  for (const [chunkIndex, snapshotStates] of chunks.entries()) {
    await withTimeout(
      stream.append({
        type: "home-assistant/state-snapshot",
        idempotencyKey: `ha:${sessionId}:snapshot:${snapshotId}:${chunkIndex}`,
        payload: {
          capturedAt,
          chunkCount: chunks.length,
          chunkIndex,
          sessionId,
          snapshotId,
          states: snapshotStates,
          totalEntities: states.length,
        },
      }),
      RPC_TIMEOUT_MS,
      "append Home Assistant state snapshot",
    );
  }
}

async function drainThroughBoundary(
  stream: Stream,
  queue: EventQueue,
  sessionId: string,
  boundary: number,
): Promise<void> {
  for (;;) {
    const batch = queue.take(APPEND_BATCH_SIZE, boundary);
    if (batch.length === 0) return;
    await appendEventBatch(stream, sessionId, batch);
  }
}

async function writeEvents(
  stream: Stream,
  queue: EventQueue,
  sessionId: string,
  signal: AbortSignal,
): Promise<never> {
  for (;;) {
    const batch = queue.take(APPEND_BATCH_SIZE);
    if (batch.length === 0) {
      await queue.waitForItems(signal);
      continue;
    }
    await appendEventBatch(stream, sessionId, batch);
  }
}

async function appendEventBatch(
  stream: Stream,
  sessionId: string,
  batch: ReturnType<EventQueue["take"]>,
): Promise<void> {
  const events: StreamEventInput[] = batch.map((item) => ({
    type: "home-assistant/event",
    idempotencyKey: `ha:${sessionId}:event:${item.sequence}`,
    metadata: {
      homeAssistantEventType: item.event.event_type,
    },
    payload: {
      event: item.event,
      receivedAt: item.receivedAt,
      sequence: item.sequence,
      sessionId,
    },
  }));
  await withTimeout(
    stream.append(...events),
    RPC_TIMEOUT_MS,
    "append Home Assistant events",
  );
}

async function healthCheck(
  project: { __describe(): Promise<unknown> },
  signal: AbortSignal,
): Promise<never> {
  for (;;) {
    await sleep(HEALTH_CHECK_INTERVAL_MS, signal);
    await withTimeout(
      project.__describe(),
      RPC_TIMEOUT_MS,
      "Iterate health check",
    );
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function disposeRpc(value: DisposableRpc | undefined): void {
  try {
    value?.[Symbol.dispose]?.();
  } catch (error) {
    log.warn("RPC disposal failed", { error: asError(error).message });
  }
}

function isConfigurationFailure(error: Error): boolean {
  return /authentication failed|credential|forbidden|invalid auth|invalid project|invalid token|project secret|unauthorized|\b40[13]\b/i.test(
    error.message,
  );
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
