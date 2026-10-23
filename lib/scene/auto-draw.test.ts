import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTO_DRAW_PAUSE_MS, canAutoApply, scheduleAutoDraw } from "./auto-draw";

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
});
