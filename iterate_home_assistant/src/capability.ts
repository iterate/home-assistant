import {
  callService,
  getConfig,
  getServices,
  getStates,
  getUser,
  type Connection,
  type HassServiceTarget,
  type MessageBase,
} from "home-assistant-js-websocket";
import type { BridgeConfig } from "./config.js";
import { withTimeout } from "./timeout.js";

const COMMAND_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_COMMANDS = 32;

export const CAPABILITY_TYPES = `export interface HomeAssistantCapability {
  /** Bridge and Home Assistant connection health. */
  status(): Promise<BridgeStatus>;
  /** Current state of every Home Assistant entity. */
  getStates(): Promise<HassEntity[]>;
  /** Current Home Assistant service/action catalog. */
  getServices(): Promise<HassServices>;
  /** Non-secret Home Assistant Core configuration. */
  getConfig(): Promise<HassConfig>;
  /** Supervisor-token Home Assistant user represented by this app. */
  getUser(): Promise<HassUser>;
  /** Invoke a Home Assistant service/action, including light.turn_on and light.turn_off. */
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: HassServiceTarget,
    returnResponse?: boolean,
  ): Promise<unknown>;
  /** Send one non-subscription Home Assistant WebSocket command. */
  sendMessage<Result = unknown>(message: HassMessage): Promise<Result>;
}

export type BridgeStatus = {
  bridgeVersion: string;
  connected: boolean;
  connectedAt: string;
  homeAssistantVersion: string;
  itxPath: string;
  sessionId: string;
  streamPath: string;
};
export type HassMessage = import("home-assistant-js-websocket").MessageBase;
export type HassEvent = import("home-assistant-js-websocket").HassEvent;
export type HassEntity = import("home-assistant-js-websocket").HassEntity;
export type HassServices = import("home-assistant-js-websocket").HassServices;
export type HassConfig = import("home-assistant-js-websocket").HassConfig;
export type HassUser = import("home-assistant-js-websocket").HassUser;
export type HassServiceTarget = import("home-assistant-js-websocket").HassServiceTarget;
`;

export function capabilityInstructions(config: BridgeConfig): string {
  const mount = `itx.${config.itxPath.join(".")}`;
  return [
    `Live Home Assistant connection mounted at ${mount}.`,
    `Raw Home Assistant events and state snapshots are in stream ${config.streamPath}.`,
    `Read entities with ${mount}.getStates() and available actions with ${mount}.getServices().`,
    `Control an entity with ${mount}.callService(domain, service, serviceData, target).`,
    `Example: ${mount}.callService("light", "turn_on", { rgb_color: [255, 0, 255], brightness_pct: 15 }, { entity_id: "light.example" }).`,
    "This capability is session-bound and unavailable while the Home Assistant app is disconnected.",
    "Types come from home-assistant-js-websocket 9.6.0: https://github.com/home-assistant/home-assistant-js-websocket.",
    `Home Assistant WebSocket API: https://developers.home-assistant.io/docs/api/websocket/.`,
    `The event stream excludes state_reported because Home Assistant omits it from unfiltered subscriptions.`,
  ].join("\n");
}

export function createHomeAssistantCapability(input: {
  bridgeVersion: string;
  config: BridgeConfig;
  connectedAt: string;
  connection: Connection;
  sessionId: string;
}) {
  const limit = createConcurrencyLimit(MAX_CONCURRENT_COMMANDS);
  const run = <T>(label: string, operation: () => Promise<T>) =>
    limit(() => withTimeout(operation(), COMMAND_TIMEOUT_MS, label));

  return {
    status: async () => ({
      bridgeVersion: input.bridgeVersion,
      connected: input.connection.connected,
      connectedAt: input.connectedAt,
      homeAssistantVersion: input.connection.haVersion,
      itxPath: `itx.${input.config.itxPath.join(".")}`,
      sessionId: input.sessionId,
      streamPath: input.config.streamPath,
    }),
    getStates: () => run("getStates", () => getStates(input.connection)),
    getServices: () => run("getServices", () => getServices(input.connection)),
    getConfig: () => run("getConfig", () => getConfig(input.connection)),
    getUser: () => run("getUser", () => getUser(input.connection)),
    callService: (
      domain: string,
      service: string,
      serviceData?: Record<string, unknown>,
      target?: HassServiceTarget,
      returnResponse?: boolean,
    ) =>
      run("callService", () =>
        callService(
          input.connection,
          validateName(domain, "domain"),
          validateName(service, "service"),
          serviceData,
          target,
          returnResponse,
        ),
      ),
    sendMessage: <Result = unknown>(message: MessageBase) =>
      run("sendMessage", () =>
        input.connection.sendMessagePromise<Result>(validateMessage(message)),
      ),
  };
}

function validateName(value: string, label: string): string {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error(
      `Home Assistant ${label} must contain only lowercase letters, numbers, and _`,
    );
  }
  return value;
}

function validateMessage(message: MessageBase): MessageBase {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Home Assistant command must be an object");
  }
  if (typeof message.type !== "string" || message.type.length === 0) {
    throw new Error("Home Assistant command type must be a non-empty string");
  }
  if ("id" in message)
    throw new Error("Home Assistant command id is assigned by the bridge");
  if (
    message.type === "auth" ||
    message.type === "supported_features" ||
    message.type.startsWith("subscribe_") ||
    message.type.startsWith("unsubscribe_")
  ) {
    throw new Error(
      `Home Assistant command ${message.type} is not a one-shot command`,
    );
  }
  return { ...message };
}

function createConcurrencyLimit(maxConcurrent: number) {
  let active = 0;
  const pending: (() => void)[] = [];

  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => pending.push(resolve));
    }
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      pending.shift()?.();
    }
  };
}
