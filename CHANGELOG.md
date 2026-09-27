# Changelog

## Unreleased

- Competitive turn-based fantasy strategy board game for 2–4 players: roads,
  manors, Banners (no production dice), Royal Writs, Wardens, knights,
  wizards, trolls and dragons.
- Play modes: hot-seat pass-and-play, humans vs. AI (easy/normal/hard), and
  online private matches (live or asynchronous) with invite links.
- Rules engine with a content package and the generated Greenvale map;
  heuristic AI and a balance simulator; Warden guard rules.
- Ten new cards bring the deck to 40 (ruleset 0.5.0): Changeling, Fire
  Bolt, Dragon's Landing, Transmutation Magic, The Plague, Robin of the
  Glade, The Unreliable Bard, Treasure Hunter, the Royal Insurance Policy
  (the first Charter, kept face up in front of you) and Ragnarök, which
  waits outside the deck until someone is within 3 Renown of victory and
  then lets a leader end the game at once. A third Counterspell keeps pace
  with the new Spells. The balance simulator reports per-card plays and
  the new cards' effects.
- Six offensive Spells bring the deck to 51 (ruleset 0.7.0): Disgrace
  (the leader loses 1 Renown for good), Siege Engines (a Stronghold at
  the end of your Route drops to a Manor), Raiders (a Manor at the end of
  your Route burns, and only its owner may rebuild there for a turn),
  Stolen Glory (take 1 Renown from a rival ahead of you), Siege Fireball
  (burn a leading rival's Manor and leave its Site in ruins for good) and
  Sabotage (an opponent loses 2 Grain). A fourth Counterspell keeps pace,
  and the Royal Insurance Policy now covers every card that costs Renown.
  The AI plays them against the leader, the board marks ruined and razed
  Sites, and the cards show their type emblem until they are painted.
- The Crown's Levy (ruleset 0.8.0), in every Standard and async game: once
  the Quest deck runs out, or by round 16, each round the King's Marshal
  names a resource, and each player may pay 5 of it once a round for 1
  Renown, or 2 at goals of 25 and 30. The five resources come in a random
  order, each once before any repeats and never one two rounds running,
  and the next round's Levy is always known. The Quest panel shows the
  Levy with a button that says why it is unavailable, a chip by the round
  number names it, and the AI saves and trades for it. Games created
  before 0.8.0 play on without it.
- The Dowager, a Hero ×2, brings the deck to 53 cards: at full cost she
  builds a Manor at the far end of your Route from one of your
  Strongholds, next to your own Holdings but never a rival's. Raiders'
  rebuild window works for her Manor, and for a Manor of yours burned
  beside it, too. The AI plays her where no ordinary Manor fits, and the
  card shows its Hero emblem until it is painted.
- The AI no longer reads hidden information: it plans on what its player
  can see and weighs each Spell by the chance a rival holds a Counterspell.
  It values each card by what it tends to be worth, so it buys and plays
  cards two to three times as often, uses Fog of Confusion and Very Minor
  Prophecy, and discards its weakest cards. It saves for cards only once
  its opening is built, which keeps the first seat's lead from growing.
- Svelte/SVG web client and an online server, with Playwright E2E tests
  covering create/join/setup across two browsers.
- Tauri desktop shell (macOS universal, Linux, Windows) and an unsigned
  universal Android APK; static web bundle and single-file server bundle.
- Docker deployment with compose, plus CI, an on-demand installer Build
  workflow, tag-driven releases with a test gate, and a server container
  image on ghcr.io.
