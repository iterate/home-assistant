import { setTimeout as delay } from "node:timers/promises";
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
import {
  connectHomeAssistant,
  type HomeAssistantSession,
} from "./home-assistant.js";
import { log } from "./log.js";

const APPEND_BATCH_SIZE = 50;
const HEALTH_CHECK_INTERVAL_MS = 15_000;
const RETRY_DELAY_MS = 5_000;
const SNAPSHOT_CHUNK_SIZE = 200;

type DisposableRpc = {
  [Symbol.dispose]?(): void;
};

type BridgeInput = {
  bridgeVersion: string;
  config: BridgeConfig;
  signal: AbortSignal;
  supervisorToken: string;
};

export async function runBridgeForever(input: BridgeInput): Promise<void> {
  while (!input.signal.aborted) {
    try {
      await runBridgeSession(input);
      throw new Error("bridge session ended unexpectedly");
    } catch (error) {
      if (input.signal.aborted) return;
      log.error("bridge session failed", {
        error: asError(error).message,
        retryDelayMs: RETRY_DELAY_MS,
      });
      try {
        await delay(RETRY_DELAY_MS, undefined, { signal: input.signal });
      } catch (delayError) {
        if (input.signal.aborted) return;
        throw delayError;
      }
    }
  }
}

async function runBridgeSession(input: BridgeInput): Promise<never> {
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

  let homeAssistant: HomeAssistantSession | undefined;
  let provision: CapabilityProvision | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;
  const sessionAbort = new AbortController();
  const stopSession = () => sessionAbort.abort(input.signal.reason);
  input.signal.addEventListener("abort", stopSession, { once: true });

  try {
    await project.__describe();
    const stream = project.streams.get(input.config.streamPath);
    homeAssistant = await connectHomeAssistant({
      token: input.supervisorToken,
    });

    const sessionId = crypto.randomUUID();
    const connectedAt = new Date().toISOString();
    const queue = new EventQueue();
    const onEvent = (event: HassEvent) => {
      try {
        queue.push(event);
      } catch (error) {
        sessionAbort.abort(error);
      }
    };

    // Subscribe before taking the snapshot. Events arriving while the snapshot
    // is read or mounted remain in the bounded queue and are appended after it.
    unsubscribe = await homeAssistant.connection.subscribeEvents(onEvent);
    const states = await getStates(homeAssistant.connection);
    const capturedAt = new Date().toISOString();
    sessionAbort.signal.throwIfAborted();

    provision = await project.capabilityHosts.get("/").provideCapability({
      capability: createHomeAssistantCapability({
        bridgeVersion: input.bridgeVersion,
        config: input.config,
        connectedAt,
        connection: homeAssistant.connection,
        sessionId,
      }),
      instructions: capabilityInstructions(input.config),
      path: input.config.itxPath,
      type: "live",
      types: CAPABILITY_TYPES,
    });

    await appendSessionStarted(stream, input, {
      connectedAt,
      homeAssistantVersion: homeAssistant.connection.haVersion,
      sessionId,
    });
    await appendSnapshot(stream, sessionId, capturedAt, states);

    log.info("bridge session ready", {
      homeAssistantVersion: homeAssistant.connection.haVersion,
      sessionId,
      snapshotEntities: states.length,
    });

    return await Promise.race([
      writeEvents(stream, queue, sessionId, sessionAbort.signal),
      monitorIterate(project, sessionAbort.signal),
      homeAssistant.disconnected,
      aborted(sessionAbort.signal),
    ]);
  } finally {
    input.signal.removeEventListener("abort", stopSession);
    sessionAbort.abort(new Error("bridge session closing"));
    if (unsubscribe) {
      try {
        await unsubscribe();
      } catch (error) {
        log.warn("Home Assistant unsubscribe failed", {
          error: asError(error).message,
        });
      }
    }
    homeAssistant?.close();
    disposeRpc(provision);
    disposeRpc(project);
  }
}

async function appendSessionStarted(
  stream: Stream,
  input: BridgeInput,
  session: {
    connectedAt: string;
    homeAssistantVersion: string;
    sessionId: string;
  },
): Promise<void> {
  await stream.append({
    type: "home-assistant/bridge-session-started",
    idempotencyKey: `ha:${session.sessionId}:started`,
    payload: {
      bridgeVersion: input.bridgeVersion,
      connectedAt: session.connectedAt,
      homeAssistantVersion: session.homeAssistantVersion,
      itxPath: `itx.${input.config.itxPath.join(".")}`,
      sessionId: session.sessionId,
      streamPath: input.config.streamPath,
    },
  });
}

async function appendSnapshot(
  stream: Stream,
  sessionId: string,
  capturedAt: string,
  states: HassEntity[],
): Promise<void> {
  const snapshotId = crypto.randomUUID();
  const chunks = chunk(states, SNAPSHOT_CHUNK_SIZE);
  if (chunks.length === 0) chunks.push([]);

  for (const [chunkIndex, snapshotStates] of chunks.entries()) {
    await stream.append({
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
    });
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
    await stream.append(...events);
  }
}

async function monitorIterate(
  project: { __describe(): Promise<unknown> },
  signal: AbortSignal,
): Promise<never> {
  for (;;) {
    await delay(HEALTH_CHECK_INTERVAL_MS, undefined, { signal });
    await project.__describe();
  }
}

function aborted(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(asError(signal.reason));
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(asError(signal.reason)), {
      once: true,
    });
  });
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
