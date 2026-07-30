import type { Connection } from "home-assistant-js-websocket";
import { describe, expect, test } from "vitest";
import {
  CAPABILITY_TYPES,
  capabilityInstructions,
  createHomeAssistantCapability,
} from "./capability.js";
import type { BridgeConfig } from "./config.js";

const config: BridgeConfig = {
  iterateUrl: "https://os.iterate.com",
  itxPath: ["myHa"],
  projectSecret: "not-logged",
  projectSlug: "iterate",
  streamPath: "/home-assistant/ceil-sense",
};

function fakeConnection() {
  const messages: Record<string, unknown>[] = [];
  const connection = {
    connected: true,
    haVersion: "2026.7.4",
    sendMessagePromise: async (message: Record<string, unknown>) => {
      messages.push(message);
      return message.type === "get_states" ? [] : { ok: true };
    },
  } as unknown as Connection;
  return { connection, messages };
}

describe("live Home Assistant capability", () => {
  test("publishes the mount contract first and official supporting types", () => {
    expect(CAPABILITY_TYPES.trimStart()).toMatch(
      /^export interface HomeAssistantCapability/,
    );
    expect(CAPABILITY_TYPES).toContain(
      'import("home-assistant-js-websocket").HassEntity',
    );
    expect(capabilityInstructions(config)).toContain("itx.myHa");
    expect(capabilityInstructions(config)).toContain(
      "/home-assistant/ceil-sense",
    );
    expect(capabilityInstructions(config)).not.toContain(config.projectSecret);
  });

  test("uses official command helpers for reads and actions", async () => {
    const { connection, messages } = fakeConnection();
    const capability = createHomeAssistantCapability({
      bridgeVersion: "0.1.0",
      config,
      connectedAt: "2026-07-30T12:00:00.000Z",
      connection,
      sessionId: "session",
    });

    await expect(capability.getStates()).resolves.toEqual([]);
    await expect(
      capability.callService(
        "light",
        "turn_on",
        { brightness_pct: 15, rgb_color: [255, 0, 255] },
        { entity_id: "light.ceilsense_status_led" },
      ),
    ).resolves.toEqual({ ok: true });

    expect(messages).toEqual([
      { type: "get_states" },
      {
        type: "call_service",
        domain: "light",
        service: "turn_on",
        service_data: { brightness_pct: 15, rgb_color: [255, 0, 255] },
        target: { entity_id: "light.ceilsense_status_led" },
        return_response: undefined,
      },
    ]);
  });

  test("rejects subscription commands from the one-shot escape hatch", async () => {
    const { connection } = fakeConnection();
    const capability = createHomeAssistantCapability({
      bridgeVersion: "0.1.0",
      config,
      connectedAt: "2026-07-30T12:00:00.000Z",
      connection,
      sessionId: "session",
    });

    await expect(
      capability.sendMessage({ type: "subscribe_events" }),
    ).rejects.toThrow("is not a one-shot command");
  });
});
