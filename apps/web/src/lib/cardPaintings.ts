import type { CardEffectId } from "@manors-menaces/rules";

/**
 * Cards still waiting for their painting (ART_DIRECTION.md, "Custom card
 * illustrations"; the prompts are in media-sources/storybook/cards). They
 * show their card-type emblem without requesting an image that is not there,
 * which would fail to load and log an error. Remove a card from this list
 * when its runtime WebP lands in public/art/cards.
 */
const AWAITING_PAINTING: ReadonlySet<CardEffectId> = new Set(["the_dowager"]);

export function hasCardPainting(id: CardEffectId): boolean {
  return !AWAITING_PAINTING.has(id);
}
