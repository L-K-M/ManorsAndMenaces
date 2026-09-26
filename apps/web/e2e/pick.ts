import type { Locator, Page } from "@playwright/test";

// A pointer click lands on the centre of an element's box. For board pieces
// that point can lie on a neighbour: a Route along a curving coast bends away
// from it, a Region wraps around a bay, and a Trading Post or landmark widens
// a Site's box. Every board layout differs, so tests either send the click to
// the piece itself or click where a player would.

/** Picks a board piece as a click on it would, wherever its box falls. */
export const pick = (piece: Locator): Promise<void> => piece.dispatchEvent("click");

/** Clicks a Site on its own point, as a player would. */
export async function clickSite(page: Page, site: Locator): Promise<void> {
  const hit = await site.locator("circle.hit").boundingBox();
  if (!hit) throw new Error("the Site is not on screen");
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
}

/** Clicks a Route on its own line, halfway along, as a player would. */
export async function clickRoute(page: Page, route: Locator): Promise<void> {
  const { x, y } = await route.locator("path.hit").evaluate((el) => {
    const path = el as SVGPathElement;
    const mid = path.getPointAtLength(path.getTotalLength() / 2);
    const onScreen = new DOMPoint(mid.x, mid.y).matrixTransform(path.getScreenCTM() ?? undefined);
    return { x: onScreen.x, y: onScreen.y };
  });
  await page.mouse.click(x, y);
}
