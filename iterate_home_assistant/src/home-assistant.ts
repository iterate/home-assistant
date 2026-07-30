import {
  createConnection,
  type Connection,
  type ConnectionOptions,
  type HaWebSocket,
  type HassEvent,
} from "home-assistant-js-websocket";
import WebSocket from "ws";

const AUTH_TIMEOUT_MS = 15_000;

export type HomeAssistantSession = {
  close(): void;
  connection: Connection;
  disconnected: Promise<never>;
};

export async function connectHomeAssistant(input: {
  token: string;
  websocketUrl?: string;
}): Promise<HomeAssistantSession> {
  if (!input.token) throw new Error("SUPERVISOR_TOKEN is missing");
  const websocketUrl =
    input.websocketUrl ??
    process.env.HOME_ASSISTANT_WEBSOCKET_URL ??
    "ws://supervisor/core/websocket";

  const connection = await createConnection({
    createSocket: () => createAuthenticatedSocket(websocketUrl, input.token),
    setupRetry: 0,
  });

  let rejectDisconnected: ((error: Error) => void) | undefined;
  const disconnected = new Promise<never>((_resolve, reject) => {
    rejectDisconnected = reject;
  });
  disconnected.catch(() => {});
  connection.addEventListener("disconnected", () => {
    connection.close();
    rejectDisconnected?.(new Error("Home Assistant WebSocket disconnected"));
  });
  connection.addEventListener("reconnect-error", () => {
    connection.close();
    rejectDisconnected?.(
      new Error("Home Assistant WebSocket reauthentication failed"),
    );
  });

  return {
    close: () => connection.close(),
    connection,
    disconnected,
  };
}

export function createAuthenticatedSocket(
  url: string,
  token: string,
): Promise<HaWebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { handshakeTimeout: AUTH_TIMEOUT_MS });
    let settled = false;

    const timer = setTimeout(() => {
      finish(
        new Error(
          `Home Assistant WebSocket authentication timed out after ${AUTH_TIMEOUT_MS}ms`,
        ),
      );
      socket.close();
    }, AUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(socket as unknown as HaWebSocket);
    };
    const onOpen = () => {
      socket.send(JSON.stringify({ type: "auth", access_token: token }));
    };
    const onMessage = (message: WebSocket.MessageEvent) => {
      const value = JSON.parse(String(message.data)) as {
        ha_version?: string;
        message?: string;
        type?: string;
      };
      if (value.type === "auth_invalid") {
        finish(
          new Error(
            `Home Assistant authentication failed: ${value.message ?? "invalid token"}`,
          ),
        );
        socket.close();
      } else if (value.type === "auth_ok") {
        const haVersion = value.ha_version ?? "unknown";
        Object.assign(socket, { haVersion });
        if (supportsCoalescedMessages(haVersion)) {
          socket.send(
            JSON.stringify({
              type: "supported_features",
              id: 1,
              features: { coalesce_messages: 1 },
            }),
          );
        }
        finish();
      }
    };
    const onClose = (event: WebSocket.CloseEvent) => {
      finish(
        new Error(
          `Home Assistant WebSocket closed during authentication (${event.code}: ${event.reason})`,
        ),
      );
    };
    const onError = () => {
      finish(
        new Error("Home Assistant WebSocket failed during authentication"),
      );
    };

    socket.addEventListener("open", onOpen);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
  });
}

function supportsCoalescedMessages(version: string): boolean {
  const match = /^(\d{4})\.(\d+)/.exec(version);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 2022 || (year === 2022 && month >= 9);
}

export async function subscribeAllEvents(
  connection: Connection,
  callback: (event: HassEvent) => void,
): Promise<() => Promise<void>> {
  return connection.subscribeEvents(callback);
}

export type { ConnectionOptions, HassEvent };
