import { WebSocketServer } from "ws";
import { afterEach, describe, expect, test } from "vitest";
import { createAuthenticatedSocket } from "./home-assistant.js";

const servers: WebSocketServer[] = [];

afterEach(
  () =>
    new Promise<void>((resolve) => {
      const server = servers.pop();
      if (!server) return resolve();
      for (const client of server.clients) client.terminate();
      server.close(() => resolve());
    }),
);

describe("Supervisor Home Assistant WebSocket authentication", () => {
  test("authenticates and negotiates the official coalesced-message feature", async () => {
    const server = new WebSocketServer({ port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (typeof address === "string" || address === null)
      throw new Error("missing test address");

    const received: Record<string, unknown>[] = [];
    server.on("connection", (socket) => {
      socket.send(
        JSON.stringify({ type: "auth_required", ha_version: "2026.7.4" }),
      );
      socket.on("message", (data) => {
        const message = JSON.parse(String(data)) as Record<string, unknown>;
        received.push(message);
        if (message.type === "auth") {
          socket.send(
            JSON.stringify({ type: "auth_ok", ha_version: "2026.7.4" }),
          );
        }
      });
    });

    const socket = await createAuthenticatedSocket(
      `ws://127.0.0.1:${address.port}`,
      "supervisor-test-token",
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(socket.haVersion).toBe("2026.7.4");
    expect(received).toEqual([
      { type: "auth", access_token: "supervisor-test-token" },
      { type: "supported_features", id: 1, features: { coalesce_messages: 1 } },
    ]);
    socket.close();
  });

  test("surfaces invalid Supervisor authentication", async () => {
    const server = new WebSocketServer({ port: 0 });
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (typeof address === "string" || address === null)
      throw new Error("missing test address");

    server.on("connection", (socket) => {
      socket.send(
        JSON.stringify({ type: "auth_required", ha_version: "2026.7.4" }),
      );
      socket.on("message", () => {
        socket.send(
          JSON.stringify({ type: "auth_invalid", message: "bad token" }),
        );
      });
    });

    await expect(
      createAuthenticatedSocket(`ws://127.0.0.1:${address.port}`, "invalid"),
    ).rejects.toThrow("Home Assistant authentication failed: bad token");
  });
});
