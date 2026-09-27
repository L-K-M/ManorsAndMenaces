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
- Sealed Charges, an option on New Game and in the online lobby (ruleset
  0.8.0): every player keeps 1 of 2 secret goals (reach a landmark, hold
  Banners in several Regions of a resource, or deeds such as 3 Royal
  Writs or 2 moves of a Menace). A goal you meet is revealed at your End
  Turn for 2 Renown. At goals 25 and 30 you draw again after a reveal,
  and once per game you may pay 1 Essence to trade your Charge in. Rivals
  see only that you hold one.
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
