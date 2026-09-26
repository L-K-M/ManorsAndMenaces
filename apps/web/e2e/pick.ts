import type { Locator } from "@playwright/test";

/**
 * Picks a board piece as a click on it would. A pointer click lands on the
 * centre of the piece's box, which for a Route along a curving coast, or a
 * Region wrapped around a bay, can lie on a neighbouring piece; every board
 * layout differs, so send the click to the piece itself.
 */
export const pick = (piece: Locator): Promise<void> => piece.dispatchEvent("click");
