import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const Session = z.object({
  sessionId: z.string(),
  startedAt: z.string(),
});

const Gap = z.object({
  endedAt: z.string(),
  reason: z.string(),
  sessionId: z.string(),
  startedAt: z.string(),
});

const JournalState = z.object({
  active: Session.optional(),
  pendingGap: Gap.optional(),
});

export type GapRecord = z.infer<typeof Gap>;
type State = z.infer<typeof JournalState>;

export class BridgeJournal {
  #state: State = {};

  private constructor(private readonly path: string) {}

  static async open(
    path = process.env.BRIDGE_JOURNAL_PATH ?? "/data/bridge-journal.json",
  ) {
    const journal = new BridgeJournal(path);
    try {
      journal.#state = JournalState.parse(
        JSON.parse(await readFile(path, "utf8")) as unknown,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (journal.#state.active) {
      journal.#state.pendingGap = {
        ...journal.#state.active,
        endedAt: new Date().toISOString(),
        reason: "bridge process restarted before the prior session closed",
      };
      delete journal.#state.active;
      await journal.#write();
    }
    return journal;
  }

  get pendingGap(): GapRecord | undefined {
    return this.#state.pendingGap;
  }

  async clearPendingGap(): Promise<void> {
    delete this.#state.pendingGap;
    await this.#write();
  }

  async startSession(sessionId: string, startedAt: string): Promise<void> {
    this.#state.active = { sessionId, startedAt };
    await this.#write();
  }

  async failActiveSession(reason: string): Promise<void> {
    if (!this.#state.active) return;
    this.#state.pendingGap = {
      ...this.#state.active,
      endedAt: new Date().toISOString(),
      reason,
    };
    delete this.#state.active;
    await this.#write();
  }

  async #write(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(this.#state, null, 2)}\n`,
      { mode: 0o600 },
    );
    await rename(temporaryPath, this.path);
  }
}
