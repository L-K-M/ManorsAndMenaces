# Storybook artwork

The six rival portraits were created with the built-in image generation tool,
using `../manors-and-menaces-icon-concept.png` as the style reference. The exact
prompts are in `prompts.json`; the final emperor correction is in
`emperor-edit.txt`. Keep these original paintings as source assets.

Emperor Mumble is a goblin ruler; Dame Brash is a human woman knight. Their
existing content ids stay unchanged so saved games retain their rivals.

Run `node tools/generate-game-art.mjs` to derive the small runtime portraits,
and title artwork. App icons have their own `media-sources/icon.png` master
and `icon.json` configuration; use the commands in `AGENTS.md` for those.

The runtime portraits keep the player's coloured border and heraldic badge.
High contrast uses the vector portraits. The five painted menace miniatures
live in `menaces/`, with their exact built-in image-generation prompts in
`menaces/prompts.json`. They use the same icon as their style reference and
retain transparent backgrounds. The highwaywoman and goblin mechanic broaden
the cast; their existing gameplay identifiers stay unchanged.

The generator derives 256px menace sprites as well as portraits and title art.
The board uses vector menace alternatives for high contrast and failed image
loads. Buildings, terrain, resource tokens and cards remain native SVG.

`title-coast.png` is the painted title-screen scenery, generated with the
built-in image tool and the original icon as a style reference. Its exact
prompt is in `title-coast-prompt.txt`. The quiet center leaves space for the
manor and menu; irregular headlands and coves replace the old oval backdrop.
Run `node tools/generate-title-scenery.mjs` to derive the 1920px and 960px WebP
copies. This optional preparation script needs `cwebp` from libwebp; ordinary
game builds use the checked-in copies and do not need an image encoder.

Every distinct playable card now has its own painting in `cards/`. See
`cards/README.md` for the roster, prompts and runtime preparation command.
