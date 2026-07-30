import {
  Auth,
  createConnection,
  createLongLivedTokenAuth,
  type AuthData,
  type Connection,
} from "home-assistant-js-websocket";

export type HomeAssistantSession = {
  close(): void;
  connection: Connection;
  disconnected: Promise<never>;
};

class SupervisorAuth extends Auth {
  public constructor(
    data: AuthData,
    private readonly supervisorWebSocketUrl: string,
  ) {
    super(data);
  }

  public override get wsUrl(): string {
    return this.supervisorWebSocketUrl;
  }
}

export async function connectHomeAssistant(input: {
  token: string;
  websocketUrl?: string;
}): Promise<HomeAssistantSession> {
  if (!input.token) throw new Error("SUPERVISOR_TOKEN is missing");
  const longLivedTokenAuth = createLongLivedTokenAuth(
    "http://supervisor",
    input.token,
  );

  // Supervisor exposes Core's WebSocket API at /core/websocket instead of the
  // /api/websocket path used by a normal Home Assistant URL.
  const auth = new SupervisorAuth(
    longLivedTokenAuth.data,
    input.websocketUrl ??
      process.env.HOME_ASSISTANT_WEBSOCKET_URL ??
      "ws://supervisor/core/websocket",
  );

  const connection = await createConnection({
    auth,
    setupRetry: 0,
  });

  const disconnected = new Promise<never>((_resolve, reject) => {
    connection.addEventListener("disconnected", () => {
      reject(new Error("Home Assistant WebSocket disconnected"));
    });
    connection.addEventListener("reconnect-error", () => {
      reject(new Error("Home Assistant WebSocket reauthentication failed"));
    });
  });
  void disconnected.catch(() => undefined);

  return {
    close: () => connection.close(),
    connection,
    disconnected,
  };
}
