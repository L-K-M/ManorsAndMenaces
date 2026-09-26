# Card paintings

All eleven distinct cards in the 24-card prototype deck have individual
illustrations. These full-size PNG originals were generated with the built-in
image tool, using `../../manors-and-menaces-icon-concept.png` as a style
reference. `prompts.json` contains every exact prompt. No API/CLI generation
fallback was used.

| Card | Painting |
| --- | --- |
| Wizard's Interference | [View](wizard_interference.png) |
| Counterspell | [View](counterspell.png) |
| Knight Errant | [View](knight_errant.png) |
| Druid's Blessing | [View](druids_blessing.png) |
| Teleportation Mishap | [View](teleportation_mishap.png) |
| Bribe the Troll | [View](bribe_the_troll.png) |
| Arcane Exchange | [View](arcane_exchange.png) |
| Festival at the Inn | [View](festival_at_the_inn.png) |
| Very Minor Prophecy | [View](very_minor_prophecy.png) |
| Fog of Confusion | [View](fog_of_confusion.png) |
| Dragon Whisperer | [View](dragon_whisperer.png) |

The knight is Dame Alda, matching her revised flavor text. The cast also
includes a woman wizard, goblin woman druid, goblin alchemist, male dragon
whisperer and a woman bard. All gameplay identities and rules stay unchanged.

From the repository root, run `node tools/generate-card-art.mjs` to produce
600px runtime WebP copies in `apps/web/public/art/cards` and regenerate the
[Royal Quest paintings](../quests/README.md) alongside them. This optional artwork
preparation uses `cwebp` from libwebp, as the title-scenery preparation does.
Ordinary builds use the checked-in runtime copies without an image encoder.
The eleven runtime paintings total about 712KB.

The hand uses compact crops; the hover, keyboard and touch-hold preview shows
larger illustrations. Prophecy ordering shows the same identifiable images.
High contrast and failed image loads use the editable type emblems in
`CardGlyph.svelte`. Hidden hands never instantiate card paintings.
