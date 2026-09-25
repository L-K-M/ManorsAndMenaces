import { describe, expect, it } from "vitest";
import { hasSlideOverPanel, layoutFor } from "../src/lib/layout.js";

describe("layoutFor", () => {
  it.each([
    [1920, 1080, "wide"],
    [1400, 900, "wide"],
    [1280, 720, "wide"],
    [1024, 640, "wide"],
    [1180, 820, "wide"],
    [820, 1180, "sheet"],
    [412, 915, "sheet"],
    [360, 740, "sheet"],
    [915, 412, "rail"],
    [740, 360, "rail"],
    // The Tauri minimum window must not fall back to a bottom dock.
    [800, 560, "rail"],
  ] as const)("%ix%i is %s", (w, h, expected) => {
    expect(layoutFor(w, h)).toBe(expected);
  });

  it("keeps a square short window out of the side rail", () => {
    expect(layoutFor(500, 500)).toBe("sheet");
  });

  it("uses a slide-over panel only when there is no panel column", () => {
    expect(hasSlideOverPanel("wide")).toBe(false);
    expect(hasSlideOverPanel("rail")).toBe(true);
    expect(hasSlideOverPanel("sheet")).toBe(true);
  });
});
