import type { Locator, Page } from "@playwright/test";

// A card another player plays waits on screen until you tap OK, and local
// computer players wait with it (PlayedCardDialog). Flows that let computer
// players take turns acknowledge those cards to keep the game going.

/** The dialog showing a card another player played. */
export const playDialog = (page: Page): Locator => page.getByRole("dialog").filter({ has: page.locator(".full-card") }).filter({ has: page.getByRole("button", { name: "OK", exact: true }) });

/** Taps OK on every played card on screen now; returns how many there were. */
export async function acknowledgePlays(page: Page): Promise<number> {
  const ok = playDialog(page).getByRole("button", { name: "OK", exact: true });
  let read = 0;
  let missed = 0;
  while (await ok.count()) {
    // The next card may replace the dialog between the count and the click,
    // but a dialog that keeps refusing the tap is a failure, not a wait.
    if (await ok.click({ timeout: 2000 }).then(() => true, () => false)) {
      read += 1;
      missed = 0;
    } else if (++missed >= 3) throw new Error("a played card's OK did not respond to 3 taps");
  }
  return read;
}

/** Waits until `target` is visible, tapping OK on any played card meanwhile. */
export async function untilVisible(page: Page, target: Locator, timeout = 30_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await target.isVisible())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${target.toString()}`);
    await acknowledgePlays(page);
    await page.waitForTimeout(150);
  }
}
