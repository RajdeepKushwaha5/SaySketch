import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTO_DRAW_PAUSE_MS, canAutoApply, remainingAfterSend, scheduleAutoDraw } from "./auto-draw";

afterEach(() => vi.useRealTimers());
describe("Auto draw", () => {
  it("submits once after the pause, and resets when text changes", () => {
    vi.useFakeTimers();
    const submit = vi.fn();
    const cancel = scheduleAutoDraw(submit);
    vi.advanceTimersByTime(1000);
    cancel();
    scheduleAutoDraw(submit);
    vi.advanceTimersByTime(AUTO_DRAW_PAUSE_MS - 1);
    expect(submit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(submit).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10000);
    expect(submit).toHaveBeenCalledOnce();
  });
  it("cancels pending submission when disabled or unmounted", () => {
    vi.useFakeTimers();
    const submit = vi.fn();
    scheduleAutoDraw(submit)();
    vi.runAllTimers();
    expect(submit).not.toHaveBeenCalled();
  });
  it("allows additions and renames but never destructive or empty batches", () => {
    expect(canAutoApply([{ type: "addNode", ref: "n", label: "Cache" }, { type: "addEdge", from: "api", to: "n" }, { type: "updateNode", id: "api", label: "Gateway" }])).toBe(true);
    expect(canAutoApply([{ type: "addNode", ref: "n", label: "Cache" }, { type: "removeEdge", id: "edge" }])).toBe(false);
    expect(canAutoApply([{ type: "removeNode", id: "api" }])).toBe(false);
    expect(canAutoApply([])).toBe(false);
  });
  it("keeps only text dictated after the sent instruction", () => {
    expect(remainingAfterSend("Add a cache", "Add a cache")).toBe("");
    expect(remainingAfterSend("Add a cache. Then connect it to Postgres", "Add a cache.")).toBe("Then connect it to Postgres");
    expect(remainingAfterSend("  Add a cache  more words", " Add a cache ")).toBe("more words");
    // the user edited what was sent: never guess, keep everything
    expect(remainingAfterSend("Add a Redis cache", "Add a cache")).toBe("Add a Redis cache");
  });
});
