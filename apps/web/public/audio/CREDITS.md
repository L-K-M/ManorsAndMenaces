# Storybook soundscape

Selected September 26, 2026. All source recordings are released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
The original files are retained in `originals/`; `sources.json` records each
creator, source page, direct download, original filename and SHA-256.
Kenney's original license notices are retained in `licenses/`.

## Sources and choices

- [Kenney: RPG Audio](https://kenney.nl/assets/rpg-audio): coins for resources,
  paper for cards, cloth for Banners, a closing book for Royal Writs, and a
  creak for wandering Menaces.
- [Kenney: Impact Sounds](https://kenney.nl/assets/impact-sounds): wooden
  construction knocks, mining/stone impacts, footsteps and a small bell.
- [Kenney: Interface Sounds](https://kenney.nl/assets/interface-sounds):
  pitched glass accents for spells and quest rewards.
- [Kenney: Music Jingles](https://kenney.nl/assets/music-jingles):
  `jingles_PIZZI07.ogg`, a short pizzicato flourish for victory.
- [RandomMind: Medieval: The Old Tower Inn](https://opengameart.org/content/medieval-the-old-tower-inn):
  the author's 49.95-second WAV loop for optional background music. The
  source page identifies RandomMind as author, explicitly labels it CC0,
  and offers both a full track and this loop. License verified 2026-09-26.

These were selected from the creators' own CC0 releases. A “public domain”
search term on a stock library does not itself identify a file's license.
No Freesound or Pixabay files are bundled in this pass.

## Preparation and playback

Run `node tools/generate-audio.mjs` with FFmpeg on PATH. The script verifies
source hashes, uses `recipes.json` to layer and pitch the effects, filters
sub-bass/very high frequencies, peak-matches them to -6 dBFS, and exports
44.1 kHz mono PCM WAV clips. Music is loudness-normalized to -18 LUFS with
-3 dBTP headroom and encoded as a stereo MP3. Runtime files are under
`apps/web/public/audio/` and work offline through the existing PWA precache.
Only the game-ready files ship; the source recordings stay in this directory.

Mixing and peak measurement use floating-point samples so layered transients
above full scale are preserved until attenuation. Run
`node --test tools/generate-audio.test.mjs` to verify this with a deliberately
overdriven mix; the regression checks its dynamics and final peak level.

Effects have independent per-cue gains and a master level; the turn bell is
quieter than a reward. At most three effects overlap, rapid routine cues are
limited, and stale pending cues are dropped. Music and effects have separate
volume controls and toggles. Music is off by default, starts only after a user
gesture, and resumes from its previous position after backgrounding. Missing
or unsupported audio must never prevent gameplay.

Effects currently cover resource gains/trades, Banners, Routes, Manors,
Stronghold upgrades, spells, Menaces, cards, quests, turns, rejected actions,
victory and Royal Writs/insurance. The Chronicle remains the text equivalent.

Technical QA checks decode, duration, signal levels, cue selection, lifecycle,
volume persistence and offline inclusion. This agent session cannot hear audio
input; subjective listening and final musical taste should be checked using
Settings > Test sound and the Music toggle. The audition attempt did not
provide audible input to the model, so it is not claimed as listening QA.
