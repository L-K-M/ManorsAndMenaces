# Royal Quest paintings

Twelve original storybook illustrations, one per Royal Quest definition.
Generated with the built-in image tool using the Knight Errant painting as a
style reference. Exact prompts and provenance are in [prompts.json](prompts.json).

| Quest | Original | Scene |
| --- | --- | --- |
| King's Highway | [View](kings_highway.png) | A royal road and bridge join distant landmarks. |
| Friend of the Forest | [View](friend_of_the_forest.png) | A forester and goblin plant an oak together. |
| Monster Problems | [View](monster_problems.png) | A dwarf ranger escorts a troublesome procession. |
| Grand Tour | [View](grand_tour.png) | Travelers plan a journey past three landmarks. |
| Master Builder | [View](master_builder.png) | A woman mason celebrates a completed stronghold. |
| Diverse Realm | [View](diverse_realm.png) | A goblin steward displays all five resources. |
| Patron of Heroes | [View](patron_of_heroes.png) | A goblin emperor honors a woman knight and fellow adventurer. |
| Arcane Scholar | [View](arcane_scholar.png) | An older woman scholar studies a glowing crystal. |
| Stone and Timber | [View](stone_and_timber.png) | A goblin carpenter and human mason build a bridge. |
| Prosperous Estates | [View](prosperous_estates.png) | Farmers bring an abundant harvest to the manor. |
| Far Reaches | [View](far_reaches.png) | An explorer surveys distant coastal estates. |
| The Safer Road | [View](the_safer_road.png) | A knight guides a troll off a merchant's road. |

The originals are 1536 × 1024 PNGs. The game uses 600 × 400 WebP copies in
`apps/web/public/art/quests/`, preserving the full scene without cropping.
Rebuild both hand-card and quest runtime illustrations with:

```sh
node tools/generate-card-art.mjs
```

This optional preparation script requires `cwebp` from libwebp. Normal builds
use the checked-in runtime files. Quest names, rules, rewards and progress
remain live localized UI text; the artwork contains no baked-in rules.
High contrast and image-load failure use the existing vector parchment emblem.
