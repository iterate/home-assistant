import type { HassEvent } from "home-assistant-js-websocket";
import { describe, expect, test } from "vitest";
import { EventQueue, EventQueueOverflowError } from "./event-queue.js";

const event = (eventType: string): HassEvent => ({
  context: { id: eventType, parent_id: null, user_id: null },
  data: { marker: eventType },
  event_type: eventType,
  origin: "LOCAL",
  time_fired: "2026-07-30T12:00:00.000Z",
});

describe("EventQueue", () => {
  test("assigns monotonic sequence numbers and drains through a snapshot boundary", () => {
    const queue = new EventQueue();
    queue.push(event("one"));
    queue.push(event("two"));
    const boundary = queue.lastSequence;
    queue.push(event("three"));

    expect(queue.take(50, boundary).map((item) => item.sequence)).toEqual([
      1, 2,
    ]);
    expect(queue.take(50).map((item) => item.sequence)).toEqual([3]);
  });

  test("fails explicitly instead of growing beyond its event bound", () => {
    const queue = new EventQueue({ maxBytes: 1_000_000, maxEvents: 1 });
    queue.push(event("one"));
    expect(() => queue.push(event("two"))).toThrow(EventQueueOverflowError);
  });

  test("fails explicitly when one event cannot fit in the byte bound", () => {
    const queue = new EventQueue({ maxBytes: 20, maxEvents: 10 });
    expect(() => queue.push(event("large"))).toThrow(
      /over the 20-byte queue limit/,
    );
  });
});
