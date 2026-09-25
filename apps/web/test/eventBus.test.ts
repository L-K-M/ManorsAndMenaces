import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/lib/game/eventBus.js";

describe("EventBus", () => {
  it("keeps publishing when a listener throws", () => {
    const bus = new EventBus<number>();
    const seen: number[] = [];
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bus.on(() => {
      throw new Error("broken view");
    });
    bus.on((n) => seen.push(n));

    expect(() => bus.emit(7)).not.toThrow();
    expect(seen).toEqual([7]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
