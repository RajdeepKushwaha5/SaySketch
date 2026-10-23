import { describe, expect, it } from "vitest";
import { isCompleteThought, recentInstructions } from "./speech";

describe("speech boundaries and context", () => {
  it.each(["The backend writes to", "Connect Spring Boot to...", "And", "Actually no", "Host the backend on", "Use MongoDB instead of", "You, by the way, can host", "GraphQL connects to, let's say", "and that hits", "So the back end is"]) ("holds unfinished thought: %s", text => expect(isCompleteThought(text)).toBe(false));
  it.each(["The backend writes to MongoDB.", "Actually no, use MongoDB instead of Postgres.", "Add Redis.", "Rename this to Orders."])("accepts complete thought: %s", text => expect(isCompleteThought(text)).toBe(true));
  it("joins a split relationship before considering it complete", () => expect(isCompleteThought("The backend writes to" + " MongoDB")).toBe(true));
  it("bounds history and preserves order", () => {
    expect(recentInstructions("first\nsecond\nthird")).toEqual(["first", "second", "third"]);
    const history = recentInstructions(Array(20).fill("x".repeat(3000)).join("\n"));
    expect(history.length).toBeLessThanOrEqual(6);
    expect(history.join("").length).toBeLessThanOrEqual(6000);
    expect(history.every(s => s.length <= 2000)).toBe(true);
  });
});
