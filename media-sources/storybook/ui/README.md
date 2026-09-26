# Painted interface details

[empty-hand.png](empty-hand.png) is the original transparent painting of a
green-and-gold card fan, with a manor emblem, oak leaf and wax seal. It replaces
the flat card fan shown when a player's hand is empty. The earlier SVG remains
available for high contrast and failed image loads.

Generated with the built-in image tool using the existing Knight Errant
painting as a style reference. [prompts.json](prompts.json) records the exact
prompt. No API or CLI generation fallback was used.

Run `node tools/generate-game-art.mjs` from the repository root to derive the
256px runtime PNG at `apps/web/public/art/ui/empty-hand.png`.
