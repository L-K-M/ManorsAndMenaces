# Manors & Menaces

**Latest release:** v<!-- version -->0.1.0<!-- /version --> · [Download](https://github.com/L-K-M/ManorsAndMenaces/releases/latest)

*Build wisely. Trouble wanders.*

A competitive turn-based fantasy strategy board game for 2–4 players. Build roads and manors across a cheerful fantasy realm, plant **Banners** to choose exactly what you will harvest next turn — no production dice — and use Royal Writs, Wardens, knights, wizards, trolls and dragons to make everyone else's plans slightly worse.

- **Play modes:** hot-seat pass-and-play, humans vs. AI (easy/normal/hard), online private matches (live or asynchronous) with invite links.
- **Platforms:** web (static hosting, offline-capable), Windows/macOS/Linux via Tauri; the server runs anywhere Node 22 or Docker runs.
- **Design document:** [`manors_and_menaces_project_spec.md`](manors_and_menaces_project_spec.md) (revision v0.2; §129 lists what changed and why).

## Quick start

```sh
corepack enable            # provides pnpm
pnpm install
pnpm dev                   # web client on http://localhost:5173
pnpm server                # online server on http://localhost:8787 (optional)
```

Or run the whole online stack in Docker:

```sh
docker compose up -d       # web client + API on http://localhost:8787
```

## How to play (short)

1. Each Manor raises a Banner; a Stronghold raises two. Plant them in neighbouring Regions.
2. At the start of your turn every Banner produces its Region's resource — unless a Menace interferes.
3. Spend resources on Routes (1 Timber + 1 Stone), Manors (1 Grain + 1 Timber + 1 Stone) and Strongholds (2 Grain + 2 Iron).
4. Most Regions hold one Banner. Send a rival's settled Banner home with a **Royal Writ** (1 Essence + a 1-resource bribe paid to them).
5. **Hire a Warden** (1 Essence + 1 Grain) to move a Menace — ideally onto someone else's problem.
6. First to 12 Renown wins (10 with 4 players, and 10 in the Core rules). Manors are worth 1, Strongholds 2, Royal Quests 1–2.

The in-game tutorial teaches all of this interactively.

## Repository layout

| Path | What |
|---|---|
| `packages/rules` | Deterministic, framework-free rules engine (commands → events, seeded RNG, hidden-information views) |
| `packages/content` | Map, cards, Quests, Menaces, English strings, map validation |
| `packages/ai` | Heuristic AI (§57) |
| `packages/protocol` | Client/server protocol and save-file types |
| `apps/web` | Svelte 5 + SVG client (also the Tauri frontend) |
| `apps/server` | Node HTTP/WebSocket server with SQLite persistence |
| `src-tauri` | Tauri 2 desktop shell |
| `tools` | Map generator (`pnpm map:generate`) and balance simulator (`pnpm simulate`) |

See [AGENTS.md](AGENTS.md) for build, test and release commands.

## License

MIT — see [LICENSE](LICENSE).
