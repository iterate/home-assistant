import type { HassEvent } from "home-assistant-js-websocket";
import { abortError } from "./timeout.js";

export type BufferedHomeAssistantEvent = {
  event: HassEvent;
  receivedAt: string;
  sequence: number;
  sizeBytes: number;
};

export class EventQueueOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventQueueOverflowError";
  }
}

export class EventQueue {
  readonly #maxBytes: number;
  readonly #maxEvents: number;
  #bytes = 0;
  #items: BufferedHomeAssistantEvent[] = [];
  #nextSequence = 1;
  #waiters = new Set<() => void>();

  constructor({ maxBytes = 4 * 1024 * 1024, maxEvents = 1_000 } = {}) {
    this.#maxBytes = maxBytes;
    this.#maxEvents = maxEvents;
  }

  get lastSequence(): number {
    return this.#nextSequence - 1;
  }

  get length(): number {
    return this.#items.length;
  }

  push(
    event: HassEvent,
    receivedAt = new Date().toISOString(),
  ): BufferedHomeAssistantEvent {
    const sizeBytes = Buffer.byteLength(JSON.stringify(event));
    if (sizeBytes > this.#maxBytes) {
      throw new EventQueueOverflowError(
        `Home Assistant event is ${sizeBytes} bytes, over the ${this.#maxBytes}-byte queue limit`,
      );
    }
    if (
      this.#items.length >= this.#maxEvents ||
      this.#bytes + sizeBytes > this.#maxBytes
    ) {
      throw new EventQueueOverflowError(
        `Home Assistant event queue exceeded ${this.#maxEvents} events or ${this.#maxBytes} bytes`,
      );
    }

    const item = {
      event,
      receivedAt,
      sequence: this.#nextSequence++,
      sizeBytes,
    };
    this.#items.push(item);
    this.#bytes += sizeBytes;
    for (const wake of this.#waiters) wake();
    this.#waiters.clear();
    return item;
  }

  take(
    maxEvents: number,
    throughSequence = Number.POSITIVE_INFINITY,
  ): BufferedHomeAssistantEvent[] {
    let count = 0;
    while (
      count < this.#items.length &&
      count < maxEvents &&
      this.#items[count]!.sequence <= throughSequence
    ) {
      count += 1;
    }
    const batch = this.#items.splice(0, count);
    for (const item of batch) this.#bytes -= item.sizeBytes;
    return batch;
  }

  async waitForItems(signal: AbortSignal): Promise<void> {
    if (this.#items.length > 0) return;
    if (signal.aborted) throw abortError(signal);

    await new Promise<void>((resolve, reject) => {
      const wake = () => {
        signal.removeEventListener("abort", onAbort);
        this.#waiters.delete(wake);
        resolve();
      };
      const onAbort = () => {
        this.#waiters.delete(wake);
        reject(abortError(signal));
      };
      this.#waiters.add(wake);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
