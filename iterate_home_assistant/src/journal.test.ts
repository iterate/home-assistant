import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeJournal } from "./journal.js";

describe("BridgeJournal", () => {
  test("turns an interrupted active session into an explicit pending gap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iterate-ha-journal-"));
    const path = join(directory, "bridge-journal.json");
    await writeFile(
      path,
      JSON.stringify({
        active: {
          sessionId: "prior-session",
          startedAt: "2026-07-30T12:00:00.000Z",
        },
      }),
    );

    const journal = await BridgeJournal.open(path);
    expect(journal.pendingGap).toMatchObject({
      reason: "bridge process restarted before the prior session closed",
      sessionId: "prior-session",
    });

    await journal.clearPendingGap();
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({});
  });

  test("persists a failed live session without its secret-bearing configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iterate-ha-journal-"));
    const path = join(directory, "bridge-journal.json");
    const journal = await BridgeJournal.open(path);
    await journal.startSession("current-session", "2026-07-30T12:00:00.000Z");
    await journal.failActiveSession("event queue overflow");

    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      pendingGap: {
        reason: "event queue overflow",
        sessionId: "current-session",
      },
    });
  });
});
