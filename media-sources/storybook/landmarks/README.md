# Painted landmarks

Five transparent storybook miniatures, generated with the built-in image
tool using the original manor-and-troll icon as a style reference. Exact
prompts and provenance are in [prompts.json](prompts.json).

| Landmark | Original | Distinctive silhouette |
| --- | --- | --- |
| Royal Castle | [View](royal_castle.png) | Cream round towers, terracotta roofs and golden flags. |
| Wizard Tower | [View](wizard_tower.png) | Crooked violet tower, star and brass telescope. |
| Adventurers' Inn | [View](adventurers_inn.png) | Broad thatched roof, timber beams and tankard sign. |
| Dwarven Hall | [View](dwarven_hall.png) | Angular gate carved into a rocky outcrop. |
| Sacred Grove | [View](sacred_grove.png) | Ancient oak surrounded by standing stones. |

The original PNGs preserve alpha transparency. Runtime copies are 256px
square PNGs in `apps/web/public/art/landmarks/`. From the repository root:

```sh
node tools/generate-game-art.mjs
```

This uses the existing Tauri image renderer and also regenerates portraits
and menace miniatures. Normal game builds use the checked-in runtime copies.

The board draws landmarks behind and to the left of their site, preserving
the holding and its ownership emblem in front. Decorations ignore pointer
events. The inspector reuses the same component at a larger size. High
contrast, failed image loads and unknown landmark IDs retain vector art.
