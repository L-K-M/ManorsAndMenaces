import type { Page } from "@playwright/test";

/**
 * How far the middle of each item in the game's top bar lies from the menu
 * button's: all under a few pixels when they share its row. `score` counts
 * the scoreboard, which has a row of its own on phones.
 */
export function topBarRowOffsets(page: Page, score: boolean): Promise<number[]> {
  return page.locator(".topbar").evaluate((bar, withScore) => {
    const middle = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (r.top + r.bottom) / 2;
    };
    const items = Array.from(bar.children).filter((el) => (withScore || !el.classList.contains("score")) && el.getBoundingClientRect().width > 0);
    return items.map((el) => Math.abs(middle(el) - middle(bar.children[0] as Element)));
  }, score);
}
