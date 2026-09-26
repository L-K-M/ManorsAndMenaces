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
- Svelte/SVG web client and an online server, with Playwright E2E tests
  covering create/join/setup across two browsers.
- Tauri desktop shell (macOS universal, Linux, Windows) and an unsigned
  universal Android APK; static web bundle and single-file server bundle.
- Docker deployment with compose, plus CI, an on-demand installer Build
  workflow, tag-driven releases with a test gate, and a server container
  image on ghcr.io.
