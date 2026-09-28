# Manors & Menaces
## Complete Game Design and Technical Implementation Specification

**Status:** Implementation specification (revision v0.2 — see §129 for what changed and why)  
**Working title:** **Manors & Menaces**  
**Document purpose:** This document is intended to be sufficiently explicit that another developer or coding model can implement the project without needing prior conversation context.  
**Primary genre:** Competitive turn-based fantasy strategy board game  
**Primary presentation:** Illustrated 2D board with UI overlays  
**Primary platforms:** Web, Windows, macOS, Linux  
**Secondary platforms:** iOS and Android  
**Core technology:** TypeScript + Svelte + SVG + optional PixiJS + Tauri  
**Players:** 2–4  
**Primary mode:** Competitive multiplayer  
**Secondary modes:** Pass-and-play, AI opponents, asynchronous online play  
**Target session length:** 35–60 minutes

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

---

# 1. Product Summary

**Manors & Menaces** is a competitive fantasy strategy game about building a network of manors, roads, and fortified holdings across a cheerful but disorderly medieval-fantasy realm.

Its defining mechanic is **deterministic resource assignment**.

Instead of rolling dice to determine which areas produce resources, every player owns a number of **Banners**. Banners are attached to the player's holdings and are assigned to adjacent resource regions. A Banner placed at the end of a player's turn produces that region's resource at the beginning of the player's next turn, unless a **Menace**, card effect, or other game rule interferes.

The game is therefore built around three pillars:

1. **Plan Your Harvest**  
   Decide what your holdings will produce next turn.

2. **Compete for the Realm**  
   Expand roads and holdings, compete for scarce resource slots, and race for public objectives.

3. **Redirect Trouble**  
   Move trolls, dragons, witches, highwaymen, and other Menaces so they disrupt an opponent instead of you.

The intended strategic texture is:

- low randomness in the economy;
- high visibility of future production;
- meaningful spatial competition;
- tactical player interference;
- variable fantasy effects;
- short, readable turns;
- no player elimination.

The tone is colorful, witty, pastoral, and mildly chaotic rather than grim or militaristic.

---

# 2. Product Identity

## 2.1 One-sentence pitch

> Build roads and manors across a cheerful fantasy realm, assign your banners to guarantee tomorrow's harvest, and use knights, wizards, trolls, and dragons to interfere with everyone else's plans.

## 2.2 Store-style short description

Build a thriving network of manors, roads, and strongholds across a magical countryside. Assign your banners to farms, forests, mines, and enchanted sites to choose what you will harvest next turn. Complete Royal Quests, recruit eccentric heroes, cast troublesome spells, and redirect wandering Menaces toward places where they will cause somebody else considerably more trouble.

There are no dice deciding whether your farms work.

Unfortunately, there are wizards.

## 2.3 Design pillars

The game should always reinforce the following:

### Predictable economy

Players normally know what they will harvest next turn.

### Spatial competition

Resource access is constrained by geography and limited Banner slots.

### Reversible disruption

Players may inconvenience one another, but should rarely destroy long-term progress.

### Fantasy interference

Cards and Menaces introduce tactical uncertainty on top of a stable economy.

### Fast interpretation

The game state should be readable from the board and HUD without requiring memory of hidden calculations.

---

# 3. Non-goals

The base game is **not** intended to be:

- a real-time strategy game;
- a simulation game;
- a physics game;
- a tactical combat game;
- a collectible card game;
- a deck-building game;
- a 4X empire simulator;
- a grand-strategy game;
- a campaign RPG;
- a game with player elimination;
- a game in which random production is the primary source of uncertainty;
- a game requiring direct player negotiation over every trade.

Future expansions may add campaign or cooperative systems, but none are required for the initial release.

---

# 4. Tone and World

## 4.1 Setting

The game takes place in a prosperous fantasy realm that is already inhabited.

Players are not colonizing empty territory. They are rival noble houses, guild patrons, landed families, or chartered stewards improving roads, manors, markets, and defenses in an established kingdom.

The Crown rewards players with **Renown** for developing the realm, completing public commissions, dealing with dangerous creatures, and building useful infrastructure.

The countryside contains:

- farms;
- forests;
- quarries;
- mines;
- magical glades;
- villages;
- inns;
- bridges;
- rivers;
- wizard towers;
- ruins;
- monasteries;
- dwarven halls;
- dragon caves;
- royal roads.

## 4.2 Tone

The tone is:

- cheerful;
- storybook medieval fantasy;
- lightly satirical;
- warm rather than grim;
- dangerous enough to create stakes;
- humorous without becoming parody.

Example flavor:

> **Toll Troll**  
> Grum insists the bridge was his first. Records concerning the matter are unfortunately damp.

> **Very Minor Prophecy**  
> You receive a vision of events approximately six minutes in the future.

> **Wizard's Interference**  
> Scholars continue to debate whether moving someone else's workforce by magic is legal. Wizards do not.

## 4.3 Inspirational boundaries

The game may allude broadly to fantasy traditions:

- wandering adventurers;
- dark wizards;
- enchanted forests;
- dragons;
- trolls;
- inns;
- prophecies;
- knights;
- eccentric hedge mages.

It must not copy recognizable characters, names, quotations, locations, plot devices, visual designs, or unique terminology from specific copyrighted franchises.

The goal is genre familiarity, not parody or imitation of any one property.

---

# 5. Terminology

| Term | Meaning |
|---|---|
| **Realm** | The complete game board. |
| **Site** | A location where a player may construct a holding. |
| **Route** | A connection between two Sites. Usually represented as a road, bridge, trail, or pass. |
| **Region** | A resource-producing area adjacent to one or more Sites. |
| **Holding** | A player structure built on a Site. |
| **Manor** | Basic Holding. |
| **Stronghold** | Upgraded Manor. |
| **Banner** | Player-controlled production marker generated by a Holding. |
| **Settled Banner** | A Banner that has been through at least one of its owner's Harvests in its current Region. Only Settled Banners can be targeted by a Royal Writ. |
| **Royal Writ** | Universally available paid action that displaces an opponent's Settled Banner. |
| **Network Site** | A Site from which a player may extend Routes or on which they may build a Manor (see §13.2). |
| **Trading Post** | A Site feature granting improved Market rates to the player who holds it. |
| **Harvest** | Production at the beginning of a player's turn. |
| **Menace** | Neutral movable disruptive character. |
| **Hero** | Card or persistent character used to manipulate the board or Menaces. |
| **Spell** | Tactical card effect. |
| **Royal Quest** | Public scoring objective available to all players. |
| **Renown** | Victory-point equivalent. |
| **Market** | Neutral trading system. |
| **Essence** | Magical resource. |
| **Command** | Player intent sent to the deterministic rules engine. |
| **Event** | Result emitted by the rules engine after applying a valid command. |

---

# 6. Core Resources

The v0.1 game uses five resources.

| Resource | Typical source | Primary uses |
|---|---|---|
| **Grain** | Farms, meadows | Manors, Strongholds, cards, Warden (used all game) |
| **Timber** | Forests | Routes, Manors (early expansion) |
| **Stone** | Quarries, hills | Routes, Manors (early expansion) |
| **Iron** | Mines | Strongholds, cards (late growth) |
| **Essence** | Enchanted glades, ruins | Royal Writ, Warden, cards (interfering with other players) |

## 6.1 Resource properties

Resources:

- are stored in each player's public inventory;
- are not hidden;
- have no default maximum;
- may be spent in any legal combination during the Main Action phase;
- may be exchanged at the Market.

Resource visibility is intentionally public to reduce memory burden and make tactical planning clearer.

---

# 7. Victory

The standard game ends when a player reaches **15 Renown** (**13 Renown with 4 players**) and completes their current turn.

The MVP ruleset (no cards, no Quests) uses a target of **10 Renown**, because Holdings are its only Renown source (see §7.1).

The target is `RulesetConfig.targetRenown`. It is chosen when a game is created: the rules' default above, or **15, 20, 25 or 30 Renown** (`BALANCE.targetRenownChoices`). The server accepts only these goals for an online match (§129.6). The game keeps the target it was created with, so a saved game or running match keeps its goal when the defaults change.

The winning condition is checked during the End Turn phase of the active player's turn, after all other end-of-turn effects.

In the base game only the active player can gain Renown, because building, Quest claims and answers to the Crown's Levy (§27.3) happen only in their own Main Action phase. The check therefore looks at the active player first. If any player is at or above the target when the check runs, the game ends. If more than one player is at or above the target (possible only through future effects), use the following tie-break order:

1. highest Renown;
2. most completed Royal Quests;
3. most Strongholds;
4. most total resources;
5. player earlier in current turn order.

Simultaneous wins should be rare.

**Exception: Ragnarök.** The game can also end before anyone reaches the target. When Ragnarök resolves (§19.13), the game ends at once, in the middle of the turn, without the End Turn phase. The winner is decided by the same tie-break order, applied to all players, and may have less than the target Renown.

**Exception: a full board.** The board can fill up before anyone reaches the target, most often with 3 or 4 players and the higher goals (§129.6). The board is full when no Site could take a new Manor, whoever builds, because each is built on, in ruins (§19.26) or too close to a Holding (§10.3), and every Holding is a Stronghold. A Site burned down by Raiders (§19.24) counts as open, since its owner may rebuild there. On a full board nobody can build for Renown any more; only Quests, cards and the Crown's Levy (§27.3) remain. So when the round ends on a full board (the End Turn phase of the last player in turn order, after the victory check above), the game ends. The winner is decided by the same tie-break order, applied to all players, and may have less than the target Renown. Until then, each End Turn on a full board announces that the game ends with the round if the board is still full then (`board_full`); a card that opens it again, such as Raiders or Siege Engines, or adds a Manor, such as The Dowager (§19.28), lets the game go on. A card that could add one but is still in a hand does not: hands are hidden, and the check also runs on the redacted views that clients and the AI plan with. The game records how it ended (`endCause: "full_board"`). The rule is `RulesetConfig.endOnFullBoard`, on in every ruleset from 0.7.0; games created before it play on.

**Exception: the last round.** Every game ends after round 30 at the latest, whatever the goal and the number of players (§129.7). When the last player in turn order ends round 30 (their End Turn phase, after the victory check and the full-board check above), the game ends. The winner is decided by the same tie-break order, applied to all players, and may have less than the target Renown. A player who reaches the target in round 30 wins as usual, and a round 30 that also ends on a full board records the full board as its end. The round is shown as "Round n of 30" from the start ("n/30" where the top bar is narrow), and it opens how the game can end. As rounds 29 and 30 begin, the game announces that the reign is ending (`reign_ending`), and a game that ends this way records it (`endCause: "last_round"`). Ragnarök can still end the game sooner. The rule is `RulesetConfig.lastRound` (`BALANCE.lastRound`), 30 in every ruleset from 0.8.0; games created before it play on, and "Play again" after one of them adds it. A last round must be 3 or more, so that both announcements fall after setup.

## 7.1 Renown budget

The target must be reachable on the chosen map. Use this budget when tuning:

| Ruleset | Target | Typical winning mix |
|---|---:|---|
| MVP | 10 | 5 Holdings, all upgraded to Strongholds; or 6 Holdings with 4 upgraded |
| Standard | 12 | about 4 Holdings, 3–4 of them Strongholds (7–8), plus 2–3 Quests (4–5) |

References: Catan targets 10 VP, and typically 2–4 of those come from sources other than buildings (longest road, largest army, VP cards). Kolonists also targeted 10 "influence". The MVP has no non-building Renown, so each player needs roughly 5–6 buildable Sites. §11 sizes the map for this.

---

# 8. Renown Sources

Default Renown values:

| Source | Renown |
|---|---:|
| Manor | 1 |
| Stronghold | 2 total, replacing the Manor's 1 |
| Minor Royal Quest | 1 |
| Major Royal Quest | 2 |
| Rare card/story reward (base game: The Unreliable Bard, §19.20) | 1 |
| Answering the Crown's Levy (§27.3), each time | 1 (2 at goals of 25 and more) |
| Major landmark objective | 2 (Sealed Charges, §27A) |
| Sealed Charge, a lobby option (§27A), revealed when met | 2 |

The major landmark objectives are the five landmark Charges of Sealed Charges (§27A), worth 2 each; without the option there are none. A revealed Charge is its own Renown source, beside Holdings, Quests, the Crown's Levy and bonus Renown, and stays scored like a claimed Quest.

A Manor upgraded to a Stronghold increases the player's Renown by **+1**, because the site moves from 1 total Renown to 2 total Renown.

Renown can also fall. Dragon's Landing (§19.15), Siege Engines (§19.23), Raiders (§19.24) and Siege Fireball (§19.26) burn a Manor or reduce a Stronghold to a Manor, which costs its owner 1 Renown either way. Disgrace (§19.22) and Stolen Glory (§19.25) take Renown for the rest of the game; it is recorded as `lostRenown` (§33.1) and subtracted from the total. Claimed Quests stay claimed.

A player's Renown never drops below 0. A card may take Renown only from a player who has some, and when a lost Holding would take a player below 0, their `lostRenown` is reduced by the difference, so no hidden debt eats into what they build next.

---

# 9. Player Count

Supported:

- 2 players;
- 3 players;
- 4 players.

The preferred balance target is **3 players**.

Four-player games should remain fully supported.

Two-player games may eventually use small map or Menace-rule adjustments if testing shows excessive openness.

---

# 10. Map Model

The game board should look like an illustrated fantasy map, not a uniform geometric island.

Internally, the board is a graph.

## 10.1 Core entities

### Site

A point where a Holding may be constructed.

```ts
interface Site {
  id: SiteId;
  x: number;
  y: number;
  adjacentSiteIds: SiteId[];
  adjacentRegionIds: RegionId[];
  landmarkId?: LandmarkId;
  tradePost?: TradePost;
}

interface TradePost {
  resource: ResourceType; // resource that may be given at the improved rate
  give: number;           // default 2
}
```

### Route

An edge connecting exactly two Sites.

```ts
interface Route {
  id: RouteId;
  siteA: SiteId;
  siteB: SiteId;
  kind: "road" | "bridge" | "trail" | "pass";
}
```

All route kinds are mechanically identical in v0.1.

### Region

A resource-producing territory.

```ts
interface Region {
  id: RegionId;
  resource: ResourceType;
  adjacentSiteIds: SiteId[];
  capacity: number;
  x: number;
  y: number;
}
```

## 10.2 Region capacities

Default:

- normal Region capacity: **1 Banner**;
- rich Region capacity: **2 Banners**.

The initial prototype should use mostly capacity-1 Regions, because scarcity drives competition.

Recommended initial map distribution:

- 80% capacity 1;
- 20% capacity 2.

## 10.3 Site distance rule

A Holding may not be built on a Site if any directly adjacent Site already contains any Holding.

This is the standard **one-edge spacing rule**.

In graph terms:

```ts
canBuildHolding(siteId) =
  site is empty
  AND every adjacent site is empty
```

This prevents overly dense construction and preserves meaningful resource adjacency.

**Exception: The Dowager (§19.28).** Her Manor may stand next to its builder's own Holdings, never next to a rival's. So may its owner's rebuild of one that Raiders burned, during the rebuild window (§19.24).

---

# 11. Suggested v0.1 Fixed Map

For the first implementation, use one fixed board rather than procedural generation.

Recommended topology:

- 36 Sites;
- about 44 Routes;
- 24 Regions;
- 5 resource types;
- 5 landmark Sites;
- 2 Trading Post Sites (one 2:1 Stone, one 2:1 Iron); these must not also be landmark Sites.

Resource count:

- 6 Grain Regions;
- 5 Timber Regions;
- 5 Stone Regions;
- 4 Iron Regions;
- 4 Essence Regions.

Rich capacity-2 Regions (5 of 24, about 20%):

- 1 of each resource type.

Total Banner capacity: 29.

## 11.1 Sizing rationale

An earlier draft used 24 Sites, 34 Routes and 17 Regions. Under the one-edge spacing rule, that graph can hold only about 10–11 Holdings in total. That is too few for 3 players to reach the Renown targets from buildings, and its Banner capacity (20) fills by mid-game.

Catan, for comparison, uses 54 intersections, 72 edges and 19 hexes for 3–4 players. Rather than copy that board, size the map to the Renown budget in §7.1:

- the maximum set of Sites that can all hold Holdings under the spacing rule should be at least **16**, enough for 4 players × 4 Holdings;
- total Banner capacity should be about **1.3–1.5 ×** the Banners expected mid-game (3 players × ~6–7 Banners ≈ 20).

The resource distribution follows demand. Grain appears in the most costs (§12, §18.2), so it has the most Regions. Essence has the fewest because it feeds only interaction: the Royal Writ, paid Menace moves and cards.

These are starting points. §102 checks them, and telemetry (§67) should tune them.

The exact visual geometry can be authored manually in SVG.

A map authoring tool is not needed for MVP. Store topology in a JSON or TypeScript data file.

---

# 12. Holdings

## 12.1 Manor

The basic Holding.

Properties:

- worth 1 Renown;
- supports 1 Banner;
- must be built on an empty legal Site;
- may be upgraded to a Stronghold.

Default cost:

- 1 Grain;
- 1 Timber;
- 1 Stone.

```ts
const MANOR_COST = {
  grain: 1,
  timber: 1,
  stone: 1
};
```

## 12.2 Stronghold

An upgraded Manor.

Properties:

- worth 2 total Renown;
- supports 2 Banners;
- remains on the same Site;
- cannot be upgraded further in the base game;
- can be reduced back to a Manor only by Dragon's Landing (§19.15, §114).

Default upgrade cost:

- 2 Grain;
- 2 Iron.

```ts
const STRONGHOLD_COST = {
  grain: 2,
  iron: 2
};
```

Rationale: in an earlier draft Stone appeared in every building cost (Route, Manor, Stronghold) and was the bottleneck all game. Catan avoids this by giving its resources different peak phases. Brick is needed for expansion (roads, settlements) and ore for growth (cities, development cards), so the scarce resource shifts during play. In Manors & Menaces, Stone and Timber therefore drive early expansion, and Iron and Grain drive late upgrades and cards.

## 12.3 Ownership

Each Site may contain zero or one Holding.

```ts
interface Holding {
  id: HoldingId;
  siteId: SiteId;
  ownerId: PlayerId;
  type: "manor" | "stronghold";
  dowerHouse?: true; // built by The Dowager (§19.28), closer than §10.3 allows
}
```

---

# 13. Routes

Players build Routes between Sites.

Default Route cost:

- 1 Timber;
- 1 Stone.

```ts
const ROUTE_COST = {
  timber: 1,
  stone: 1
};
```

## 13.1 Route ownership

A Route may be owned by at most one player.

## 13.2 Route placement

A Site is a **Network Site** for a player if either:

- it contains one of the player's Holdings; or
- it is an endpoint of a **usable** Route owned by the player **and** does not contain an opponent's Holding.

A Route is usable unless an effect says otherwise. In the base game:

- a Route affected by Fog of Confusion is not usable;
- a Route occupied by the Highwayman is usable only for a build action whose cost includes the toll (§22).

A player may build a Route if:

1. the Route is unowned; and
2. at least one of its endpoints is a Network Site for that player.

This means enemy Holdings break through-connectivity. A Route may end at an enemy Holding, but that Site is not a Network Site for anyone except its owner, so no further Routes can be built from it.

```ts
isNetworkSite(state, playerId, siteId): boolean
```

## 13.3 Building Holdings via network

Outside initial setup, a player may build a Manor only on a Site that:

1. is a Network Site for that player because it is an endpoint of one of their usable Routes; and
2. satisfies the spacing rule (§10.3).

---

# 14. Banners

Banners are the core production mechanism.

## 14.1 Banner supply

Each Manor supports 1 Banner.

Each Stronghold supports 2 Banners.

The Banner count is derived from Holdings and is not independently purchased.

```ts
function bannersSupported(holding: Holding): number {
  return holding.type === "manor" ? 1 : 2;
}
```

## 14.2 Banner ownership and origin

Every Banner belongs to one specific Holding.

```ts
interface Banner {
  id: BannerId;
  ownerId: PlayerId;
  holdingId: HoldingId;
  regionId: RegionId | null;
  settled: boolean; // see §14.6
}
```

A Banner may only be assigned to a Region adjacent to its origin Holding's Site.

A Banner cannot move to a Region merely because another owned Holding touches it.

## 14.3 Banner placement

During the Banner Assignment phase, the active player may:

- leave a Banner in its current Region;
- move it to another legal adjacent Region;
- withdraw it to `null`.

A Region may contain Banners only up to its capacity.

## 14.4 Stronghold restriction

The two Banners generated by one Stronghold may **not** occupy the same Region, even if that Region has capacity 2.

This keeps Strongholds flexible rather than allowing double-stacking.

## 14.5 Banner persistence

Banner positions persist across turns until reassigned or moved by another effect.

## 14.6 Settled Banners

- Whenever a Banner's `regionId` changes (reassignment, a card, a Writ), set `settled = false`.
- At the end of the owner's Harvest phase, set `settled = true` on every Banner of theirs that has a Region, whether it produced anything or not. This includes Banners that a Menace blocked, so a Menace cannot make a Banner permanently immune.
- A Banner the owner leaves in place during Banner Assignment keeps its current `settled` value.

## 14.7 Royal Writ — contesting a Region

Persistent Banners plus mostly capacity-1 Regions would otherwise let the first Banner in a valuable Region keep it for the whole game. The Royal Writ is a displacement mechanism every player can always use, so contesting a Region never depends on drawing the right card.

It is modelled on the **Bribe** in the iOS game *Kolonists*: occupying a resource space gave exclusive access, but an opponent could pay resources to displace that worker. Occupation brings access, not permanent ownership.

**Timing:** Main Action phase, active player only.

**Target:** one opponent's **Settled** Banner in a Region adjacent to at least one of the active player's Holdings.

**Cost:**

- 1 Essence, paid to the supply; and
- 1 resource of the challenger's choice, paid **to the displaced Banner's owner**. This is the bribe that compensates them.

**Effect:** the target Banner returns to its origin Holding (`regionId = null`, `settled = false`). Its owner may reassign it in their next Banner Assignment phase. Because Harvest comes before Banner Assignment, the displaced Banner produces nothing at its owner's next Harvest.

**Limit:** 1 Royal Writ per player per turn.

The challenger does not occupy the freed Region automatically. They must assign a legal Banner to it in their Banner Assignment phase. That phase comes later in the same turn, so the challenger normally gets first claim, but only if they have a Banner whose origin Holding is adjacent to the Region.

### 14.7.1 Why Settled protection

A Banner cannot be targeted until it has been through one of its owner's Harvests. This guarantees that anyone who claims a Region, including through a Writ, gets at least one Harvest from it. It also stops Writ wars:

- each exchange costs the challenger 2 resources, and 1 of those goes to the defender;
- the defender loses 1 Harvest;
- if two players keep displacing each other, the challenger gets 1 resource per cycle for 2 spent, so it is a losing trade.

A Writ is therefore worth using against an occupant who will not fight back, or when the Region matters more than the resources spent.

### 14.7.2 Relationship to other interference

| Tool | Availability | What it does to the occupant |
|---|---|---|
| Royal Writ | Always (paid) | Frees the slot; the occupant is compensated |
| Wizard's Interference | Card | Moves the Banner elsewhere; ignores Settled |
| Toll Troll / Young Dragon | Menace | Suppresses production; the slot stays occupied |

Menaces pressure the occupant. Only the Writ and Wizard's Interference actually free a slot.

The protection and compensation rules are an open design question. §129.2 lists the variants to playtest, and `RulesetConfig.writ` makes them configurable.

---

# 15. Harvest

At the start of the active player's turn, resolve Harvest.

For every Banner owned by that player:

1. determine its assigned Region;
2. determine whether the Banner is active;
3. apply Menace and card modifiers;
4. produce the resulting resource;
5. emit a resource-gained event.

Default production:

- each active Banner produces **1** resource matching its Region.

Example:

- Banner A on Forest → +1 Timber;
- Banner B on Mine → +1 Iron.

## 15.1 No production dice

There is no global production die.

No ordinary turn-start randomness determines whether Regions produce.

## 15.2 Blocked production

If a Menace fully blocks a Region, Banners there produce zero.

A sick Banner (The Plague, §19.17) also produces zero, at its owner's next Harvest only.

## 15.3 Modified production

Some Menaces or cards transform rather than block production.

The rules engine should resolve modifiers by explicit priority, described later.

---

# 16. Turn Structure

Every turn has four phases.

```ts
type TurnPhase =
  | "harvest"
  | "main"
  | "banner_assignment"
  | "end";
```

## 16.1 Phase 1 — Harvest

Automatic.

Resolve:

- Banner production;
- Harvest-triggered card effects;
- Harvest-triggered Menace effects;
- delayed effects scheduled for Harvest.

The UI then presents a concise harvest summary.

## 16.2 Phase 2 — Main Actions

The player may perform any number of legal actions while able to pay costs.

Typical actions:

- Build Route;
- Build Manor;
- Upgrade Manor;
- Buy Card;
- Play eligible Card;
- Trade at Market or a Trading Post;
- Issue a Royal Writ (§14.7);
- Hire a Warden to move a Menace (§26.1);
- Claim completed Quest;
- Answer the Crown's Levy (§27.3);
- Use landmark ability (not in base game; see §80);
- Activate hero ability.

Main Actions may be performed in any order.

## 16.3 Phase 3 — Banner Assignment

The player may reposition all eligible Banners.

No resource cost.

The UI must preview next Harvest.

The player explicitly confirms assignments.

Before the turn ends, the UI warns when another legal placement of the player's own Banners would harvest more at their next Harvest (`getBannerAdvice`). Rival Banners stay where they are, and among equal totals the placement with the fewest moves wins, so a Bog Witch (same amount) or a sick Banner (nothing anywhere) never warns by itself, and neither does a Banner at home with no Region to go to. The warning names each move and its reason (at home, the Toll Troll, the Young Dragon, a Druid's Blessing outside Grain and Timber, or room for another Banner) and offers:

- **Place Banners** (the default): back to the board, the first Banner to move picked up;
- **Place them for me**: the suggestion goes into the draft, and the turn does not end;
- **End turn anyway**.

There is no warning when the player will not harvest again, because the game ends first (`hasNextHarvest`, which shares its checks with the End Turn): someone has the target Renown, equal turns already end the game with the round, the round is the last (§7), or the player ends the round on a full board. When two Banners swap full Regions, the moves start by sending one of them home, so each can be made in turn.

A setting, also offered as "Don't warn me again", turns the warning off. It is advice only: no command, protocol or server change, and AI seats never see it.

## 16.4 Phase 4 — End Turn

Resolve, in order:

1. end-of-turn effects;
2. discard down to the hand limit (§18.3), using a `discard_cards` command if the player is over it;
3. reveal replacement Quests for any claimed this turn (§27);
4. expiration of temporary effects;
5. reset per-turn counters (Market trades, cards played, Writs, Warden hires);
6. with Sealed Charges, reveal the player's Charge if it is met (§27A);
7. victory check (§7);
8. if the game did not end, the endgame omen (§19.13);
9. with Sealed Charges at goals 25 and 30, after a reveal, the player keeps one of two new Charges (§27A.4).

All Quest claims in the base game are manual (§116). None resolve automatically here.

Then advance to the next player.

---

# 17. Market

There is no mandatory player-to-player negotiation.

The base game uses a neutral Market.

## 17.1 Default exchange

> Spend 3 identical resources to gain 1 resource of your choice.

Example:

- 3 Timber → 1 Essence.

## 17.2 Market limit

Default:

- at most **2** exchanges per turn, counting Market and Trading Post exchanges together.

(An earlier draft said "once per turn" in §17.1 and "maximum 2" in §17.2. The limit is 2.)

## 17.3 Trading Posts

A player who has a Holding on a Trading Post Site may, as one of their exchanges, spend **2** of that Post's resource to gain 1 resource of their choice.

Rationale: Catan's harbors are the main defence against a resource bottleneck there. They make trade a spatial goal worth building toward, instead of just a flat bank rate. The v0.1 map puts Posts on Stone and Iron, the two resources most likely to be bottlenecks (§11).

## 17.4 Market modifiers

Cards, landmarks, or Quests may improve rates.

Example Merchant Guild effect:

> One of your exchanges each turn may use a 2:1 rate for any resource. It still counts toward the exchange limit.

---

# 18. Cards

Cards create controlled tactical variability.

## 18.1 Card categories

```ts
type CardType =
  | "spell"
  | "hero"
  | "trick"
  | "charter"
  | "story";
```

### Spell

Immediate magical effect.

### Hero

Immediate effect or temporary/persistent ability.

### Trick

Non-magical tactical interference.

### Charter

Longer-lasting economic or scoring modifier.

When a Charter resolves it does not go to the discard pile. It stays face up in front of its player, where everyone can see it (§83), until its own text discards it. Charters in front of a player are not part of their hand, so they do not count toward the hand limit (§18.3). The first Charter is the Royal Insurance Policy (§19.19).

### Story

One-off narrative effect, often symmetrical or unusual.

## 18.2 Card acquisition

New Standard and asynchronous games deal two cards to each player after all
setup steps finish. At the start of rounds 3, 6, 9 and every third round after
that, every player draws one free card before the first seat acts. A round is
one turn for each player. Deal in turn order, one card per seat per pass, using
the normal draw pile and discard reshuffle. If no cards remain, skip the
unavailable draws without blocking play. Set-aside Ragnarök stays out until
its omen. Free cards do not count as purchases. Hand limits still apply at
the end of each player's own turn, even if a free draw took them above seven.

New Game's Advanced options can disable both starting and periodic draws.
Older saves without these ruleset fields keep their original card economy.
Core games have no cards and receive no free draws.

Default card purchase cost:

- 1 Grain;
- 1 Iron;
- 1 Essence.

Purchased cards go to the player's hand.

## 18.3 Hand limit

Default hand limit:

- 7 cards.

If a player exceeds 7 after resolving an effect, discard down to 7 at end of turn.

## 18.4 Card play limit

Default:

- at most 1 non-reaction card per turn.

Reaction cards do not count toward this limit.

This prevents card effects from overwhelming the board economy.

---

# 19. Initial Card Set

The deck has 53 cards: the 24-card prototype (§19.1–19.11), a second wave of 15 cards (§19.12–19.21), a third wave of 10 cards that attack Renown and Grain (§19.22–19.27), a Counterspell more with each wave (§19.2), and The Dowager (§19.28).

Recommended copies are shown.

## 19.1 Wizard's Interference ×3

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Move one opponent Banner to another Region that is adjacent to its origin Holding and has free capacity. The moved Banner becomes unsettled.  
**Restrictions:** Must respect Region capacity and the Stronghold restriction (§14.4). Ignores Settled protection.

## 19.2 Counterspell ×4

**Type:** Spell / Reaction  
**Timing:** When another Spell is played  
**Effect:** Cancel that Spell before its effect resolves.  
**Note:** The prototype had 2 copies. The second wave adds five Spells, most of them hostile (Changeling, Ragnarök, Fire Bolt, The Plague), and the third wave ten hostile Spells (§19.22–19.27), so each wave adds a copy to keep Counterspell's share of the deck, and the chance that someone holds an answer, about where it was: 2 of 24 cards in the prototype, 3 of 40 after the second wave, 4 of 51 now. Heroes, Tricks, Stories and Charters open no reaction window and cannot be countered.

## 19.3 Knight Errant ×3

**Type:** Hero  
**Timing:** Main Action  
**Effect:** Move one Menace to any legal destination.

## 19.4 Druid's Blessing ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Choose one of your Banners. During your next Harvest, if it produces Grain or Timber, gain +1 additional matching resource.  
**Note:** A Banner at home is a valid choice. It pays off if you assign it to a Grain or Timber Region before your next Harvest, for example in the same turn's Banner Assignment.

## 19.5 Teleportation Mishap ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Swap the positions of two Menaces if both resulting placements are legal.  
**Note:** A Menace can only stand on its own kind of place (§20), so the two Menaces must both be on Regions, both on Routes or both on Sites. When no two active Menaces share a kind, as with the 2-player set (§118: Toll Troll on a Region, Highwayman on a Route), the card can never be played, so setup leaves it out of the deck, just like cards whose required Menace is inactive.

## 19.6 Bribe the Troll ×2

**Type:** Trick  
**Timing:** Main Action  
**Requirement:** Toll Troll is active.  
**Effect:** Move the Toll Troll. If it leaves a Region containing one of your Banners, gain 1 Grain.

## 19.7 Arcane Exchange ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Perform one 1-for-1 resource exchange involving Essence.

## 19.8 Festival at the Inn ×2

**Type:** Story  
**Timing:** Main Action  
**Effect:** Every player gains 1 Grain. You gain 1 additional resource of your choice.

## 19.9 Very Minor Prophecy ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Look at the top 3 cards of the draw pile. Reorder them.

## 19.10 Fog of Confusion ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Choose one Route you do not own. Until the start of your next turn, that Route cannot be used for network connectivity. It remains owned.  
**Note:** Fogging your own Route would only hurt you, so it is not allowed. Fogging an unowned Route is: a player who builds it before the fog lifts cannot connect through it. Fogging a Route that another player has already fogged is allowed and extends the fog to your next turn; fogging one you have already fogged is not.

## 19.11 Dragon Whisperer ×2

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** Young Dragon is active.  
**Effect:** Move the Young Dragon. If its Hoard is non-empty, take one resource from the Hoard.

## 19.12 Changeling ×1

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** An opponent holds at least 1 card.  
**Effect:** Choose such an opponent. Swap your whole hand with theirs.  
**Note:** Changeling has already left your hand when the swap happens, so you give them the rest of your hand, which may be nothing. Hand sizes are public (§83), so everyone can check the requirement. The two players learn the cards they receive; everyone else sees only the new hand sizes. A Royal Insurance Policy in front of the chosen opponent prevents the swap (§19.19). A player who ends up over the hand limit discards at the end of their own turn, as usual (§18.3).  
**Rationale:** One copy. A whole-hand swap is the biggest swing of card advantage in the deck, and a single copy keeps it a rare event rather than a routine one. It punishes hoarding cards, which the hand limit alone does not. The target can answer it with a Counterspell or a policy.

## 19.13 Ragnarök ×1

**Type:** Spell  
**Timing:** Main Action  
**Setup:** Set aside face up, outside the draw pile (§28.1).  
**Omen:** At the end of any turn in which the game did not end, if any player has at least the target Renown minus 3 (`BALANCE.ragnarok.omenGap`), Ragnarök is shuffled into the draw pile at a random position (match RNG, §30) and every player is told. This happens once per game.  
**Requirement:** No rival has more Renown than you. Ties are allowed.  
**Effect:** The game ends at once. The winner is decided by the §7 tie-break order, applied to all players: highest Renown, then most Royal Quests, most Strongholds, most resources, earlier in turn order. The winner may have less than the target Renown.  
**Note:** Ragnarök is a Spell, so it opens a reaction window and a Counterspell cancels it; the game ends only when it resolves. Because the tie-break runs over all players, a rival tied with you on Renown may still win: playing Ragnarök on a tie is a bet on Quests, Strongholds and resources. A cancelled or discarded Ragnarök goes to the discard pile and can return in a reshuffle (§117). The Royal Insurance Policy does not cover it. The `game_won` event carries `cause: "ragnarok"`.  
**Rationale:** Ragnarök is a clock for the final rounds, not a surprise in round 2. Set aside until someone is 3 Renown from victory, it cannot cut a game short before the race is on, and it then sits at a random depth in the draw pile. Only a leader or co-leader may play it, so it never hands the game to a player who is behind. A trailing player who draws it can hold it, and play it after catching up.

## 19.14 Fire Bolt ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** An opponent owns a Route.  
**Effect:** Choose an opponent's Route. If that opponent owns any bridge, you must choose one of their bridges. The Route burns down and becomes unowned. Until the end of that opponent's next turn it smoulders: only they may rebuild it.  
**Note:** Rebuilding follows the normal Route rules (§13), cost included, so the owner needs a connection to one of its ends, which the rest of their network usually provides. The smouldering ends when they rebuild it or when their next turn ends; after that anyone may build it. Building a smouldering Route that was not yours is refused with `ROUTE_SMOULDERING`. Holdings stay where they are: a Route carries no Renown. A Royal Insurance Policy in front of the owner prevents the burn (§19.19).  
**Rationale:** Bridges burn first because they are usually chokepoints, so the card makes a strategic point instead of taxing a random Route, and because a burning bridge is easy to read on the board. The rebuild window keeps the disruption reversible (§2.3): the owner loses tempo and the cost of a Route, not the Route itself, unless they decide it is no longer worth having.

## 19.15 Dragon's Landing ×1

**Type:** Story  
**Timing:** Main Action  
**Requirement:** Some player, you included, has at least 3 Holdings (`BALANCE.dragonsLanding.minHoldings`).  
**Effect:** A dragon lands on one Holding, picked at random from every Holding of every player who has 3 or more, yours included. A Manor burns down: it is removed with its Banner, and its Site becomes empty. A Stronghold is reduced to a Manor and loses one of its two Banners (§114).  
**Note:** The Holding is picked with the match RNG (§30) when the card resolves, from a pool in a fixed order, so replays stay deterministic. Every Holding in the pool is equally likely, so a player with more Holdings is more likely to be hit. If the owner of the picked Holding has a Royal Insurance Policy in front of them, the policy is discarded and nothing burns (§19.19). As a Story it opens no reaction window, so Counterspell cannot stop it. This dragon is not the Young Dragon Menace (the flavour text blames its mother): the card needs no active Young Dragon and does not move it. Routes that end at the burned Site stay standing and owned, and the empty Site counts as one of their ends again (§13.2); a Trading Post belongs to the Site, so it waits for whoever builds there next.  
**Rationale:** The only card that takes Renown away, so it is built to respect the Reversible disruption pillar (§2.3). There is one copy. Nobody with fewer than 3 Holdings can be hit, so no player drops below the 2 Holdings everyone starts with. A Stronghold is only reduced, never destroyed, and can be upgraded again. The random pick makes the card a tax on large estates rather than a weapon aimed at one rival, and the caster's own Holdings are at risk too once they have 3 or more. The Royal Insurance Policy is the answer. §111.1 records the safety checklist.

## 19.16 Transmutation Magic ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Pay 2 resources and gain 2 resources. The two you pay may be the same type, and so may the two you gain, but you cannot gain a type you paid.  
**Example:** 2 Grain → 1 Iron + 1 Essence, or 1 Grain + 1 Timber → 2 Stone. Not 1 Grain + 1 Timber → 1 Grain + 1 Stone.  
**Note:** It is not a Market exchange and does not count toward the Market limit (§17.2). Legal-action lists offer each unordered pair once, so there are at most 110 distinct plays.  
**Rationale:** A second answer to a resource bottleneck next to Arcane Exchange (§19.7), which must involve Essence. Forbidding a type you paid keeps every play a real conversion.

## 19.17 The Plague ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** At least one opponent's Banner in the Regions around the Site is not already sick. That opponent's Royal Insurance Policy may still spare it (§19.19).  
**Effect:** Choose a Site. Every Banner in the Regions around it that is not already sick falls sick, whoever owns it, yours included. A sick Banner produces nothing at its owner's next Harvest, and that Harvest cures all of the owner's sick Banners.  
**Note:** Sickness belongs to the Banner, not the Region: a sick Banner that moves stays sick, and a Banner that arrives later is not affected. In the Harvest layers sickness is a complete blocker applied after the Toll Troll (§31). The Harvest still settles the Banner (§14.6). Each owner with a Royal Insurance Policy spends it to spare all of their Banners here, the caster included (§19.19).  
**Rationale:** Area denial with a cost to the caster: it hits your own Banners too, so a good Site is one where opponents cluster and you do not. Each Banner misses exactly one Harvest, so it slows an economy without breaking it, and no turn is skipped (§111).

## 19.18 Robin of the Glade ×2

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** A rival with more Renown than you has at least 1 of the resource you name.  
**Effect:** Name a resource. Each rival with more Renown than you gives you 1 of it, if they have any.  
**Note:** "More" is strict: a rival tied with you gives nothing. As a Hero it cannot be countered, and the Royal Insurance Policy does not cover it.  
**Rationale:** A catch-up card that pays more the more players are ahead of you. It moves at most one resource from each of them, so it narrows a lead without deciding it, and the leader can never play it.

## 19.19 Royal Insurance Policy ×2

**Type:** Charter  
**Timing:** Main Action  
**Requirement:** You have no Royal Insurance Policy in front of you.  
**Effect:** Keep this card face up in front of you (§18.1). The next Fire Bolt, Plague, Changeling or card costing you Renown that would affect you does not. Discard the policy instead.  
**Note:** The cards costing Renown are Dragon's Landing and the third wave's Disgrace, Siege Engines, Raiders, Stolen Glory and Siege Fireball (§19.22–19.26). The policy is used on the first of these cards that would affect you, whoever played it, including your own Plague or Dragon's Landing; you cannot choose to save it. Against The Plague one policy spares all of your Banners around that Site. Against Dragon's Landing it is used only if the dragon picks one of your Holdings. It does not cover anything else: not Ragnarök, and not Sabotage (§19.27), which takes only Grain, as Robin of the Glade takes only resources. As a Charter it cannot be countered. It is public, so opponents can see who is insured before they aim.  
**Rationale:** The first Charter, and the counterplay (§82) to the harshest cards of the second and third waves. It stops one hit, not every hit, and it has to be in play before the hit comes.

## 19.20 The Unreliable Bard ×1

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** A rival has at least 2 more Renown than you (`BALANCE.underdogGap`).  
**Effect:** Gain 1 Renown.  
**Note:** The Renown is kept for the rest of the game, like a Quest's (`bonusRenown`, §33.1). It is the base game's only card that awards Renown (§8).  
**Rationale:** One copy of a pure catch-up card. With a gap of 2 it can never lift you level with the rival who made it playable.

## 19.21 Treasure Hunter ×1

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** The Young Dragon is active, its Hoard is not empty, and it can legally move (§26) to a Region that holds one of your Banners.  
**Effect:** Name a resource in the Hoard and take up to 3 of it (`BALANCE.treasureHunter.take`). Then move the Young Dragon to a Region that holds one of your Banners.  
**Note:** Setup leaves it out when the Young Dragon is not in play, as in 2-player games (§118). The move counts as moving a Menace for Quests such as Monster Problems (§27.1).  
**Rationale:** Dragon Whisperer (§19.11) takes 1 resource and sends the Dragon anywhere. Treasure Hunter takes up to 3, but the Dragon follows you home: it will divert your Banner's next Harvest into its Hoard (§23.3) unless you move it on first. A big Hoard is a prize with a price.

The third wave (§19.22–19.27) answers a playtest request for more offensive cards, "like a card that destroys another player's win point". All six are Spells, so Counterspell stops them, and every one but Sabotage is covered by the Royal Insurance Policy (§19.19). All their effects are public.

## 19.22 Disgrace ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** A rival has more Renown than you, and nobody has more than them.  
**Effect:** Choose a rival with the most Renown. They lose 1 Renown (`BALANCE.renownSwing`) for the rest of the game.  
**Note:** Not playable while you hold or share the lead. With rivals tied for the lead, you choose which of them. The loss is kept in `lostRenown` (§33.1), the Unreliable Bard's +1 in reverse, and survives any later building. The `renown_lost` event carries `cause: "disgrace"`.  
**Rationale:** A brake on the leader that anyone behind can apply. Unlike Stolen Glory it gives the caster nothing, so it narrows every player's gap to the leader at once.

## 19.23 Siege Engines ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** An opponent's Stronghold stands at an end of one of your Routes.  
**Effect:** Choose such a Stronghold. It is reduced to a Manor and loses one of its two Banners (§114), costing its owner 1 Renown.  
**Note:** The owner may upgrade it again at the normal cost (§12.2). "At an end of one of your Routes" means one of your Routes touches its Site, which you can arrange by building a Route toward it (§13.2), so the attack is spatial and can be seen coming.  
**Rationale:** Dragon's Landing's Stronghold result, aimed. It destroys nothing (§81): the Site, the Manor and one Banner stay.

## 19.24 Raiders ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** An opponent's Manor stands at an end of one of your Routes, and that opponent has at least 3 Holdings (`BALANCE.raid.minHoldings`).  
**Effect:** Choose such a Manor. It burns down with its Banner, costing its owner 1 Renown. Until the end of the owner's next turn the Site is razed: only they may build on it or on a Site next to it.  
**Note:** This is Fire Bolt's rebuild window (§19.14) for a Manor. Rebuilding on the Site ends it, as does the end of the owner's next turn. The neighbours are protected too, or the raider could take the spot, or block the rebuild by the spacing rule (§10.3), with a Manor of their own on the far end of the very Route that made the raid possible. Building on a razed Site, or next to it, that is not yours is refused with `SITE_RAZED`. Only a Manor burns; Strongholds are Siege Engines' business. A burned Dower House (§19.28) passes its mark to the razed Site (`dowerHouse`), so its owner's rebuild there is a Dower House again. It and any other Manor burned beside one of its owner's Holdings, such as a Stronghold beside a Dower House once Siege Engines reduce it, leave the spacing rule waived toward the owner's Holdings (`besideOwnHoldings`), so the owner may rebuild with an ordinary build during the window.  
**Rationale:** The 3-Holding minimum is Dragon's Landing's (§19.15): nobody drops below the two Holdings everyone starts with, so no player is eliminated (§3). The rebuild window keeps the loss reversible (§2.3).

## 19.25 Stolen Glory ×1

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** A rival has more Renown than you.  
**Effect:** Choose such a rival. For the rest of the game they lose 1 Renown and you gain 1 (`BALANCE.renownSwing`).  
**Note:** Their loss is kept in `lostRenown` and your gain in `bonusRenown` (§33.1). The `renown_stolen` event names both players. If their Royal Insurance Policy absorbs the card, neither happens: they lose nothing and you gain nothing (§19.19).  
**Rationale:** The strongest card of the wave, a two-point swing, so there is one copy, and only a player behind may play it. It never puts you more than 1 Renown ahead of the rival you rob.

## 19.26 Siege Fireball ×1

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** A rival with more Renown than you, and at least 3 Holdings (`BALANCE.raid.minHoldings`), owns a Manor.  
**Effect:** Choose such a Manor, anywhere on the board. It burns down with its Banner, costing its owner 1 Renown, and its Site lies in ruins for the rest of the game: nobody, its owner and you included, may build a Holding there again.  
**Note:** The design is a player's own: "remove one manor and make the location unavailable to build again. Can only be used against players with more renown than the card holder." The ruins are kept in `ruinedSiteIds` (§33) and shown on the board. Every build check refuses them with `SITE_RUINED`, initial placement included. A ruin is not a Holding: it does not count for the spacing rule (§10.3), Routes may still end at it and networks pass through it, and a Trading Post there (§17.3) is lost to everyone. The `site_ruined` event follows the `holding_destroyed` one.  
**Rationale:** The one card that permanently changes the board, and the deliberate exception to §81 (§111.2). One copy, only against a rival ahead of you, and never against a player with fewer than 3 Holdings.

## 19.27 Sabotage ×2

**Type:** Spell  
**Timing:** Main Action  
**Requirement:** An opponent has at least 1 Grain.  
**Effect:** Choose such an opponent. Their grain silo burns down: they lose 2 Grain (`BALANCE.sabotage.grain`), or all they have if less.  
**Note:** The design is a player's own ("burn down a grain silo, target loses two grain resources"). The Royal Insurance Policy does not cover it (§19.19). The Grain goes to the supply, not to the caster. The `resources_lost` event carries `cause: "sabotage"`.  
**Rationale:** A cheap, reversible nuisance aimed at a rival's next Manor or Stronghold, both of which need Grain.

## 19.28 The Dowager ×2

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** One of your Routes joins one of your Strongholds to an empty Site, no rival's Holding stands next to that Site, and you can pay for a Manor there.  
**Effect:** Build a Manor on that Site, her Dower House, and pay its full cost as for any Manor there: the Manor's price plus the Highwaywoman's toll (§22) and the Goblin Tinkers' surcharge (§25) when due. The spacing rule (§10.3) is waived only toward your own Holdings.  
**Card text:** "Build a Manor, at full cost, at the far end of your Route from one of your Strongholds. It may stand next to your own Holdings, never next to a rival's."  
**Note:** The Route must be usable, as for any build (§13): a fogged Route does not count. A ruined Site (§19.26) is refused, as is a Site razed for someone else or next to one (§19.24); a ruin next door does not stop her, since a ruin is not a Holding. Afterwards the Dower House is an ordinary Manor, worth 1 Renown with 1 Banner, and can be upgraded. It is marked `dowerHouse` (§12.3): when Raiders burn one, or a Manor of its owner's beside it, the owner may rebuild during the rebuild window (§19.24). Played on a razed Site of yours, she ends its window, as any build there does. Dragon's Landing gives no window, so a Dower House it burns is gone. As a Hero she opens no reaction window and cannot be countered (§109), and she harms nobody, so no Royal Insurance Policy pays out. She does not keep a full board open while held (§7). The target names the Site and, when due, the toll and surcharge resources (`tollPayment`, `extraPayment`), as `build_manor` does.  
**Rationale:** Late in a game almost every Holding is a Stronghold and no Site is far enough from the others for an ordinary Manor, so she brings Renown where building has stopped, without crowding a rival's Regions. At full price she costs the card and the Manor, about the Renown per resource of ordinary building. Requiring a Stronghold keeps her out of the opening, where an early Banner would snowball.

Total: 53 cards: 35 Spells, 11 Heroes, 3 Stories, 2 Tricks and 2 Charters.

Setup leaves out cards that cannot be played with the active Menaces (§19.5, §118) and sets Ragnarök aside (§19.13):

| Players | Cards | Draw pile at setup | Set aside | Left out |
|---|---:|---:|---|---|
| 2 | 48 | 47 | Ragnarök | Dragon Whisperer ×2, Teleportation Mishap ×2, Treasure Hunter |
| 3–4 | 53 | 52 | Ragnarök | none |

With 2 players the deck holds 33 Spells and 8 Heroes. The async ruleset (§109) also leaves out the 4 Counterspells.

---

# 20. Menaces

Menaces are neutral pieces that alter local rules.

Each match activates a subset.

Recommended standard game:

- 2 active Menaces for 2 players;
- 2 active Menaces for 3 players;
- 3 active Menaces for 4 players.

The MVP ruleset uses exactly 1 Menace, the Toll Troll, regardless of player count. §118 lists which Menaces are used.

Menaces begin on designated Menace starting locations.

```ts
interface MenaceInstance {
  id: MenaceId;
  type: MenaceType;
  location: MenaceLocation;
  state: Record<string, unknown>;
}
```

`MenaceLocation` may reference:

- Region;
- Route;
- Site.

Landmarks are Sites (§10.1), so a Menace on a landmark is a Site-located Menace.

```ts
type MenaceLocation =
  | { kind: "region"; regionId: RegionId }
  | { kind: "route"; routeId: RouteId }
  | { kind: "site"; siteId: SiteId };
```

---

# 21. Toll Troll

## 21.1 Location

Region.

## 21.2 Effect

The Troll completely blocks Harvest in its Region.

Banners remain in place but produce nothing.

## 21.3 Movement

Can be moved by:

- Hiring a Warden (§26.1), which is always available;
- Knight Errant;
- Bribe the Troll;
- other explicit effects.

## 21.4 Placement restriction

May occupy any Region not already occupied by another Menace. The general movement rules in §26 apply.

---

# 22. Highwayman

## 22.1 Location

Route.

## 22.2 Effect

The affected Route remains owned but:

- cannot be used for expansion connectivity unless its owner pays 1 resource of any type when performing the relevant build action.

This payment is made once per build action, not once per path traversal.

## 22.3 Design rationale

The Highwayman interferes with network expansion without permanently removing infrastructure.

---

# 23. Young Dragon

## 23.1 Location

Region.

## 23.2 Hoard

The Dragon maintains a public Hoard:

```ts
interface DragonState {
  hoard: Partial<Record<ResourceType, number>>;
}
```

## 23.3 Effect

Whenever a Banner in the Dragon's Region would produce:

- the Banner's owner gains nothing from that Banner;
- place 1 matching resource into the Dragon's Hoard.

If multiple Banners are present, each contributes separately.

## 23.4 Movement reward

When a player moves the Dragon using an effect that explicitly says they "drive away", "move", or "whisper to" the Dragon, that effect may award Hoard resources if stated.

Knight Errant does **not** automatically grant Hoard.

Dragon Whisperer grants 1 resource from the Hoard.

Future cards may defeat the Dragon and grant more.

---

# 24. Bog Witch

## 24.1 Location

Region.

## 24.2 Effect

Whenever a Banner in the Witch's Region would produce a non-Essence resource:

- produce 1 Essence instead.

If the Region already produces Essence, production is unchanged.

This makes the Witch situationally beneficial.

---

# 25. Goblin Tinkers

## 25.1 Location

Site.

## 25.2 Effect

Building or upgrading a Holding on the occupied Site costs one additional resource of the player's choice.

The player chooses which resource to add to the normal cost.

If the player cannot pay one extra resource, the action is illegal.

---

# 26. Menace Movement Rules

Unless a card says otherwise:

1. a Menace may only move to a legal location for its type;
2. a movement effect must choose a different location;
3. two Menaces may not occupy the same logical location unless explicitly allowed;
4. a Menace may move onto a location affecting the active player;
5. a Menace may be used tactically against any player;
6. there is no "leader targeting" rule in the engine.

## 26.1 Hire a Warden

Any player may move a Menace as a Main Action, without a card.

**Cost:** 1 Essence + 1 Grain.  
**Effect:** move one active Menace to another legal location for its type.  
**Limit:** once per player per turn.  
**Guard:** the Warden stays with the Menace. Until the start of the hirer's next turn, no other player may move that Menace with a Warden. Cards can still move it. (`RulesetConfig.warden.guard`, default on.)

Why the guard: in simulated 4-player games without it, each player hurt by a Menace paid 2 resources to push it onto someone else. That produced about 46 Warden hires per game and slowed every economy. The guard cut this to about 27, and turns interference into a choice about timing.

This counts as moving a Menace for Quests such as Monster Problems and The Safer Road.

Rationale: without dice there is no automatic trigger like Catan's robber on a 7. Without a paid action, Menaces would move only when someone drew a card, and in the MVP, which has no cards, the Troll would never move. The cost makes Essence the resource for interfering with other players (Writs, Wardens, cards), so it has a real use even without cards.

---

# 27. Royal Quests

Royal Quests are public objectives.

At setup:

- reveal 3 Quests.

A player may claim a Quest if its condition is met.

Unless the Quest says otherwise:

- each Quest may be claimed by only one player;
- claiming is immediate during the Main Action phase;
- claimed Quests remain visible in the claimant's area;
- at the End Turn phase, each claimed Quest is replaced by the top card of the Quest deck, so 3 unclaimed Quests stay available until the deck runs out;
- in the Standard rules, a Quest nobody claims leaves after 4 rounds (§27.2).

Terms used in Quest conditions:

- **Graph distance** is the length of the shortest path between two Sites over **all** Routes, regardless of ownership.
- A player's network **reaches** a Site if that Site contains one of their Holdings or is an endpoint of one of their usable Routes. An opponent's Holding on a Site does not stop the Site from being reached.
- A player **connects** Sites X and Y if a path of their usable Routes runs from X to Y and no Site strictly between X and Y holds an opponent's Holding.
- Quest counts of **Holdings** include both Manors and Strongholds unless the Quest says "Manors" and "Strongholds" separately. In that case each Holding counts only as its current type.

## 27.1 Prototype Quest set

Implement at least 12.

### King's Highway — 2 Renown

Connect the two landmark Sites that the map designates for this Quest (`MapDefinition.questParams.kingsHighway`).

### Friend of the Forest — 1 Renown

Have Banners assigned to 3 different Timber Regions simultaneously.

### Monster Problems — 1 Renown

Move Menaces 3 times during the match.

Track per player.

### Grand Tour — 2 Renown

Your network reaches 3 different landmark Sites.

(An earlier draft required "3 different landmark types". The v0.1 map had only 3 landmarks and opponents' Holdings block paths through a Site, so that version was often impossible. Reaching a landmark does not need a path through it.)

### Master Builder — 2 Renown

Own at least 5 Holdings, at least 2 of which are Strongholds.

### Diverse Realm — 1 Renown

During one Harvest, gain all 5 resource types.

### Patron of Heroes — 1 Renown

Play 2 Hero cards.

(v0.2 asked for 3. The prototype deck held only 5 Hero cards, and 3 in 2-player games where Dragon Whisperer is left out, so 3 was almost never reachable: under 2% for a player drawing 6 cards in a 2-player game, against about 20% for 2. The second wave (§19.12–19.21) raises this to 9 Heroes, 6 with 2 players. A player drawing 6 cards now finds 2 Heroes about 28% of the time with 2 players and 42% with 3 or 4, and 3 Heroes about 5% and 12%. The requirement stays at 2.)

### Arcane Scholar — 1 Renown

Play 3 Spell cards.

### Stone and Timber — 1 Renown

Own at least 6 Routes and 1 Stronghold.

### Prosperous Estates — 1 Renown

Harvest at least 5 resources in a single turn.

### Far Reaches — 2 Renown

Own Holdings at two Sites whose graph distance is at least 6.

### The Safer Road — 1 Renown

Twice during the match, move a Menace away from a location that affects you: a Region holding one of your Banners, a Route you own, or a Site holding your Holding.

## 27.2 Quest expiry

On in the Standard rules (`RulesetConfig.questExpiryRounds` is `BALANCE.questExpiryRounds`, 4). Absent or 0 turns it off; the New Game screen has a checkbox for that, and online matches always use it. Without it a Quest is replaced only when claimed, so a Quest nobody can realistically complete can hold one of the 3 slots for the whole match (simulation: King's Highway and Patron of Heroes were on show for hundreds of player-turns without a claim). With it, 40 AI games per setting claimed more Quests per game (2.1 to 3.1 with 2 players, 3.3 to 4.1 with 3, 2.8 to 4.3 with 4) and cut the longest game from 20 to 16 rounds with 3 players and from 25 to 17 with 4.

With the rule set to N rounds:

- each revealed Quest remembers the first round it can be claimed in: the round it was revealed in, or the next round when it is revealed at the end of the last seat's turn; the opening Quests count from round 1;
- when a new round begins, each Quest that has been on show for N rounds without being claimed goes to the bottom of the Quest deck, and the top Quest of the deck takes its slot;
- Quests are checked in slot order, and no more Quests leave than the deck held when the round began, so a Quest never returns at once; with an empty deck, nothing leaves;
- the Quest panel shows how many rounds each Quest has left.

No randomness is involved beyond the setup shuffle of the Quest deck (§30), so replays stay deterministic.

## 27.3 The Crown's Levy

On in the Standard and async rules at every goal (`RulesetConfig.crownLevy`, from ruleset 0.9.0). The Core rules have no Quests and no Levy. Games created before 0.9.0 have no `crownLevy` field and play on without it: the engine never draws a Levy for them, so they replay as before. "Play again" after a Standard or async one adds it (`crownLevyRules`), as it adds the last round.

The first round that begins with the Quest deck empty, or round 15 (`proclaimByRound`) at the latest, the King's Marshal rides in and proclaims a Levy for the next round. From then on, as each round begins, the proclaimed Levy takes effect and the Marshal proclaims the next. This round's Levy and the next round's are always public (`GameState.crownLevy`).

- **The resource.** Each Levy names one resource. The Crown calls each of the five once, in an order drawn from the match RNG (§30), before it calls any of them again, and never one two rounds running: a new cycle does not open with the resource that closed the last. `crownLevy.called` lists the current cycle, the next Levy last, so the rest of the cycle can be read from it. Each proclamation carries a line of fiction: Timber for the King's new fleet, Stone to mend the Royal Castle's walls, Grain to feed the army on the march, Iron for the royal armoury, Essence for the court wizards' wards.
- **Answer the Levy** (Main Action, once per player per round, `answer_levy`): pay 5 (`price`) of this round's resource to the supply and gain 1 Renown, or 2 when the game's goal is 25 or more (`BALANCE.crownLevy`). It does not matter how the resources were got: Harvest, the Market, a Trading Post or a card.
- The command names the resource, which must be this round's (`INVALID_PAYMENT` otherwise), so a stale client never pays for the wrong Levy. It is refused with `LEVY_NOT_ACTIVE` before the first Levy takes effect and with `LEVY_LIMIT_REACHED` for a second answer in a round.
- **Levy Renown** is kept for the rest of the game, like a claimed Quest's, but it is not a Quest: it counts for neither the Quest tie-break (§7) nor any Quest condition. It is its own Renown source (`PlayerState.levyRenown`, the `levy` part of `getRenownSources`), shown as such in the Renown dialog and on the results.
- The Levy runs until the game ends; the victory check, a full board (§7) and Ragnarök end the game as before.
- Events: `levy_proclaimed` (public: the Levy now in force, null for the first, and the next one) and `levy_answered`.
- The Quest panel shows the Levy above the Quests: its resource, the price and Renown, the next Levy, who has answered, and a button that says why it is unavailable (the shortfall, with the Market trades that cover it). A chip beside the round number names this round's Levy.

**Rationale.** With 3 or 4 players the board usually fills before anyone reaches a goal of 20 or more (§129.6). The Levy is a Renown source that needs no Site and spends the late surplus. It starts when the Quest deck runs out, around round 15 in simulations (§129.8), when building has slowed. 5 resources for 1 Renown is about the price of a Manor with its Routes; the Renown doubles at 25 and 30, which building alone rarely reaches. The AI saves for this round's Levy and, before the last round, the next, trades toward it, and never answers while an affordable upgrade waits.

---

# 27A. Sealed Charges

A lobby option, off unless chosen on New Game (under Advanced) or in the online lobby: `RulesetConfig.sealedCharges`, from ruleset 0.9.0. Each player keeps a secret personal goal, a **Sealed Charge**, and scores it when it is met. The goal is hidden; the Renown it scores is public like all Renown (§83), because a Charge scores only when it is revealed. Games created without the option hold no Charge and replay unchanged.

## 27A.1 The Charge deck

Each Charge is worth 2 Renown when revealed (`BALANCE.sealedCharges.renown`), as much as a major Quest.

| Kind | Charges | Goal |
|---|---|---|
| Landmark | Seat at Court (Royal Castle), Patron of the Tower (Wizard Tower), Friend of the Inn (Adventurers' Inn), Guest of the Hall (Dwarven Hall), Keeper of the Grove (Sacred Grove) | Your network reaches the landmark (§27), and one of your Banners is in a Region touching its Site. |
| Banners | Granary of the Realm (3 Grain), Quarry Lord (3 Stone), Lord of the Mines (2 Iron), Wellspring Keeper (2 Essence) | Banners in that many different Regions of the resource at the same time. There is no Timber Charge: Friend of the Forest (§27.1) asks for Timber already. |
| Deeds | The King's Clerk (3 Royal Writs), Merchant Venturer (5 trades at the Market or a Trading Post), Collector of Tales (3 cards bought) | Counted from when the Charge was drawn: the player's counts then (`stats.writsIssued`, `marketTrades`, `cardsBought`) are its baseline (`SealedCharge.since`). |
| Menaces | Troll Herder, Friend of Outlaws, Dragon Tamer, The Witch's Errand, Patron of Tinkers | Move the named Menace 2 times after the draw, with a Warden or a card. Only games with the option count moves per Menace (`stats.menaceMoves`). |

The deck of a new game holds every Charge the game can meet, shuffled with the match RNG (§30) after the card and Quest decks, so games without the option draw exactly as before. Charges naming a Menace not in play are removed first, and so are Charges whose landmark is not on the board, whose rule is off (Royal Writs, cards, or for a Menace Charge both Wardens and cards) or whose board has too few Regions of their resource. Every island has all five landmarks and enough Regions, so a Standard deck holds 12 Charges and one per active Menace: 14 with 2 or 3 players, 15 with 4.

## 27A.2 Drawing and keeping

- Before the first placement (§28), each player in turn order draws 2 Charges and keeps 1 (`choose_charge`). The choice is a pending decision (§109) that only its player sees, like a Prophecy (§19.9), and placement waits until everyone has chosen.
- A Charge not kept goes to the bottom of the deck, face down. The deck is drawn without replacement, so every player's Charge is their own.
- With fewer than 2 Charges left to draw, the player keeps one of those there are; with none, they draw nothing.
- A player holds at most one sealed Charge at a time.
- A `choose_charge` when no Charge is being chosen, such as the same choice sent twice, is refused with `NO_CHARGE_CHOICE`.

## 27A.3 Revealing

At each player's End Turn (§16.4), before the victory check (§7), their Charge is revealed and scored if it is met (`charge_revealed`). The 2 Renown stay, like a claimed Quest, whatever later happens to the Banners or the network. Only the player ending their turn reveals: a Charge met during another player's turn waits for its holder's End Turn. A reveal can win the game at that End Turn. On a full board (§7), Banner, deed and Menace Charges can still be met in the last round, so a player behind has one public last chance.

## 27A.4 Further Charges at goals 25 and 30

At the Renown goals 25 and 30, a reveal is followed by a new draw of 2, keep 1, until the player has revealed 2 Charges (goal 25) or 3 (goal 30) (`BALANCE.sealedCharges.perGame`); below 25 every player has one Charge in the game. The new draw comes after the victory check and the full-board check of that End Turn, and the turn passes to the next player once the player has kept one. These later draws, and Recommission's, skip landmark Charges, which a full board can put out of reach, and take Banner, deed and Menace Charges only.

## 27A.5 Recommission

Once per game, in their Main phase, a player may pay 1 Essence (`BALANCE.sealedCharges.recommission`) to discard their sealed Charge face down, unrevealed, and draw 2 and keep 1 again (`recommission_charge`). The discarded Charge leaves the game. Recommission needs the deck to hold a Charge a later draw can take (`CHARGE_DECK_EMPTY` otherwise). It is the remedy for a landmark Charge that rivals' Holdings and Routes have closed off.

## 27A.6 What players see

- Everyone sees that a player holds a sealed Charge (a seal on the scoreboard and in the Players panel), how many Charges are left in the deck (in the Quests tab), every revealed Charge and all Renown.
- Only the holder sees their Charge, with its progress, in the Quests tab, and only the player choosing sees the Charges they drew. Online, the server replaces rivals' Charges, a rival's draw and the deck with `hidden` (§105); `charges_drawn` and `charge_kept` reach other players without the Charge. In hot-seat play the choice waits behind the privacy curtain (§56.1), and the Chronicle says only that a Charge was drawn or kept.
- The first seat draws when the game is created, which reports no events, so a local game's Chronicle tells that draw from the initial state. An online match's Chronicle comes from the server's history of commands (§62) and does not tell it.

## 27A.7 The AI

The AI keeps the Charge it is further along. It counts Banners where its next Banner Assignment could put them, and a landmark it has not reached yet by its distance, so each Route toward it pays; between Charges it has made no progress on, it prefers the kinds it meets most often in simulation. It values progress toward its own Charge (`WEIGHTS.chargeProgress`), saves for the Writ, card or Warden a deed or Menace Charge needs, places its Banners to meet a Banner or landmark Charge when an assignment can, and Recommissions a Charge it can no longer meet. It plans on its redacted view (§105), with one exception: whether Recommission can draw a Charge now is read from the full state, since a player learns as much by trying and a refused try would make the AI end its Main phase. It counts each rival's sealed Charge as 1 expected Renown.

---

# 28. Setup

## 28.1 Standard setup

1. Load board.
2. Randomly determine first player.
3. Select active Menaces according to player count.
4. Place Menaces at their configured starting locations.
5. Set Ragnarök aside face up; it joins the draw pile only at the endgame omen (§19.13). Shuffle the rest of the card deck using match RNG.
6. Shuffle Quest deck using match RNG.
7. Reveal 3 Quests.
8. With Sealed Charges (§27A), shuffle the Charge deck using match RNG; each player in turn order draws 2 Charges and keeps 1 (§27A.2).
9. Players place initial Holdings in snake order. Each Manor is followed immediately by one free Route and, for a player's second Manor, their starting resources (§28.2–28.3).
10. Players assign initial Banners in **reverse** turn order (§28.4).
11. Begin turn 1.

## 28.2 Initial Holdings

Each player starts with 2 Manors.

Placement order:

- first round: player order forward;
- second round: player order reverse.

Example for 3 players:

```text
A → B → C → C → B → A
```

After placing each Manor, the player immediately places one free Route that has that Manor's Site as an endpoint.

During setup, Manors ignore the network requirement (§13.3) but still obey the spacing rule (§10.3).

## 28.3 Starting resources

After a player's **second** initial Manor is placed:

Gain 1 resource from each Region adjacent to that Manor.

Ignore Region capacity and Menaces during this initial grant.

## 28.4 Initial Banners

After all initial placement is complete:

Each player assigns one Banner from each starting Manor.

Normal capacity restrictions apply.

Resolve players in **reverse** turn order: the last seat assigns first, and the first player assigns last.

If a desired Region fills before later players assign, those later players must choose another legal Region, or leave the Banner unassigned.

Rationale: the first player already acts first in round 1. If they also chose Banners first, that would add a lasting advantage in exclusive Regions. Reverse order balances this in the same way that Catan's snake setup gives the last seat two placements in a row.

Initial Banners start **unsettled**. They become Settled after their owner's first real Harvest (in round 2, because round 1's Harvest is skipped, §29). So no initial Banner can be targeted by a Writ before it has produced once, and the first player gets no chance to Writ in round 1.

---

# 29. First Turn

No special first-turn Harvest occurs.

The first player begins directly in the Main Action phase.

This prevents initial Banner placement from immediately granting the first player a production advantage.

Every player skips the Harvest of their own first turn. From round 2 onward, Harvest happens normally.

Implementation (this is the only mechanism; there is no round-count flag):

```ts
// PlayerState
firstHarvestSkipped: boolean; // false at setup
```

At the start of a player's turn, if `firstHarvestSkipped` is `false`, set it to `true` and go directly to the Main Action phase. Otherwise resolve Harvest.

A skipped Harvest does not settle Banners (§14.6).

---

# 30. Gameplay Randomness

Randomness should be deterministic and seeded.

Random elements may include:

- initial first player;
- Quest order;
- card deck order;
- Sealed Charge deck order (§27A.1);
- procedural map generation in future;
- optional Dark Wizard events.

All random calls must pass through a single match RNG service.

Do not call `Math.random()` in gameplay code.

---

# 31. Effect Resolution Order

When multiple effects modify the same action, use explicit layers.

For Harvest:

1. determine base production;
2. apply complete blockers;
3. apply converters;
4. apply multipliers/bonuses;
5. apply theft/diversion;
6. grant final resources;
7. emit post-Harvest triggers.

Example:

- Toll Troll blocks first, so no further production modifiers apply.
- A sick Banner (The Plague, §19.17) is the next complete blocker. Under the Troll, the Harvest reports the Troll's block, and the Banner is cured all the same.
- Bog Witch converts Grain to Essence.
- Druid's Blessing then checks final or original type according to card wording.

For v0.1, Druid's Blessing checks the **original Region resource**.

---

# 32. Undo Policy

Undo is allowed only before hidden information is revealed or irreversible random state advances.

Undo-safe actions:

- build Route;
- build Manor;
- upgrade Manor;
- Market exchange;
- Banner reassignment;
- ordinary resource payment;
- selecting/deselecting targets before confirmation.

Undo-locking actions:

- draw card;
- reveal hidden card;
- inspect top deck;
- randomize anything;
- play a card (it reveals hidden information and may open a reaction window);
- issue a Royal Writ (it transfers resources to another player);
- hire a Warden;
- claim a Quest (it reveals a replacement at end of turn and races other players);
- end turn.

Implementation should support local action checkpoints during the active turn.

## 32.1 Undo in online play

The server is authoritative (§59), so undo works on a **client-side draft buffer**:

1. Undo-safe commands are applied to the local draft only. They are validated locally with the shared rules and are not sent yet.
2. When the player issues an undo-locking command, or ends the turn, the client sends the buffered commands followed by the locking command as one ordered batch (`SubmitCommandsRequest`, §104).
3. The server validates and applies the batch in order and atomically: all accepted or none. Revision increases by the number of accepted commands.
4. If the batch is rejected, the client reloads the authoritative state and discards the draft (§60).

In local modes (hot-seat, vs. AI) the same buffer is used without a server.

---

# 33. Game State Model

The core rules package must not depend on Svelte, DOM, SVG, PixiJS, Tauri, browser APIs, or server APIs.

Suggested structure:

```ts
export interface GameState {
  revision: number;        // incremented once per accepted command (§60)
  matchId: string;
  rulesetVersion: string;
  seed: string;
  rngState: RngState;

  status: "setup" | "playing" | "finished";
  setup?: SetupProgress;   // present only while status === "setup"
  round: number;
  turnNumber: number;
  activePlayerId: PlayerId;
  phase: TurnPhase;

  board: BoardState;
  players: Record<PlayerId, PlayerState>;
  banners: Record<BannerId, Banner>;
  menaces: Record<MenaceId, MenaceInstance>;

  cardDeck: CardId[];
  discardPile: CardId[];
  setAsideCardIds?: CardId[]; // Ragnarök, until the endgame omen (§19.13)

  questDeck: QuestId[];
  publicQuests: PublicQuestState[];

  delayedEffects: DelayedEffect[];
  ruinedSiteIds?: SiteId[]; // Siege Fireball (§19.26): nobody may build there again
  crownLevy?: { current: ResourceType | null; next: ResourceType; called: ResourceType[]; answeredBy: PlayerId[] }; // §27.3, public
  historyMeta: HistoryMeta;
  winnerId?: PlayerId;
  endCause?: "ragnarok" | "full_board" | "last_round"; // §19.13, §7; absent when the target was reached
}
```

## 33.1 Player state

```ts
export interface PlayerState {
  id: PlayerId;
  seat: number;
  displayName: string;

  resources: Record<ResourceType, number>;
  hand: CardId[];

  // Renown from explicit rewards (rare cards, story rewards). Total Renown is
  // derived by getRenown() from Holdings + claimed Quests + levyRenown +
  // bonusRenown - lostRenown; it is never stored.
  bonusRenown: number;
  // Renown from answering the Crown's Levy (§27.3); absent until the first answer.
  levyRenown?: number;
  // Renown lost for the rest of the game (Disgrace, Stolen Glory, §8). Never
  // more than keeps the total at 0 or above; absent in older saves.
  lostRenown?: number;

  holdingIds: HoldingId[]; // Manors and Strongholds
  routeIds: RouteId[];

  claimedQuestIds: QuestId[];
  charters?: CardId[]; // face up in front of the player (§18.1); absent in older saves

  stats: PlayerStats;

  marketTradesThisTurn: number;   // Market + Trading Post exchanges
  nonReactionCardsPlayedThisTurn: number;
  writsIssuedThisTurn: number;
  wardensHiredThisTurn: number;
  firstHarvestSkipped: boolean;   // §29
}
```

```ts
export interface SetupProgress {
  // Snake order of placements, e.g. [A, B, C, C, B, A]
  placementOrder: PlayerId[];
  placementIndex: number;
  step: "place_manor" | "place_route" | "assign_banners";
  bannerAssignmentOrder: PlayerId[]; // reverse turn order (§28.4)
  bannerAssignmentIndex: number;
}
```

## 33.2 Player stats

```ts
export interface PlayerStats {
  menacesMoved: number;
  heroesPlayed: number;
  spellsPlayed: number;
  resourcesHarvestedTotal: number;
  maxSingleHarvest: number;
  menacesMovedOffOwnAssets: number;
  writsIssued: number;
  writsReceived: number;
}
```

---

# 34. Command Model

Every player action is a serializable command.

```ts
export type GameCommand =
  // setup
  | PlaceInitialManorCommand
  | PlaceInitialRouteCommand
  | AssignInitialBannersCommand
  // main phase
  | BuildRouteCommand
  | BuildManorCommand
  | UpgradeHoldingCommand
  | BuyCardCommand
  | PlayCardCommand
  | TradeResourcesCommand
  | IssueRoyalWritCommand
  | HireWardenCommand
  | ClaimQuestCommand
  | RecommissionChargeCommand   // Sealed Charges (§27A.5)
  | EndMainPhaseCommand
  // banner assignment
  | AssignBannersCommand
  // end of turn
  | DiscardCardsCommand
  | EndTurnCommand
  // reaction windows (§109), issued by a non-active player
  | ReactCommand
  | PassReactionCommand
  // other pending decisions (§109), issued by the player deciding
  | ResolveProphecyCommand      // Prophecy (§19.9)
  | ChooseChargeCommand;        // Sealed Charges (§27A.2)
```

Debug-only commands (such as granting resources, §100) are a separate `DebugCommand` union. Production builds reject them.

Every command includes:

```ts
interface CommandBase {
  commandId: string;
  matchId: string;
  playerId: PlayerId;
}
```

The expected revision belongs to the submission, not to each command (§60, §104). That keeps a replay log (§62) a plain ordered list of commands.

## 34.1 Example

```ts
interface BuildRouteCommand extends CommandBase {
  type: "build_route";
  routeId: RouteId;
  tollPayment?: ResourceType; // required when the build relies on a Highwayman Route (§22)
}

interface IssueRoyalWritCommand extends CommandBase {
  type: "issue_royal_writ";
  targetBannerId: BannerId;
  bribe: ResourceType; // resource paid to the displaced Banner's owner
}

interface HireWardenCommand extends CommandBase {
  type: "hire_warden";
  menaceId: MenaceId;
  destination: MenaceLocation;
}
```

---

# 35. Event Model

The rules engine validates a Command and returns Events.

```ts
export interface ApplyResult {
  accepted: boolean;
  events: GameEvent[];
  error?: RuleError;
  newState?: GameState;
}
```

Events are serializable and replayable.

Examples:

```ts
type GameEvent =
  | ResourceSpentEvent
  | ResourceGainedEvent
  | RouteBuiltEvent
  | HoldingBuiltEvent
  | HoldingUpgradedEvent
  | ResourceTransferredEvent   // player-to-player, e.g. Writ bribe
  | BannerAssignedEvent
  | BannerDisplacedEvent       // Royal Writ
  | MenaceMovedEvent
  | CardDrawnEvent
  | CardPlayedEvent
  | QuestClaimedEvent
  | QuestRevealedEvent
  | PhaseChangedEvent
  | TurnEndedEvent
  | GameWonEvent;
```

---

# 36. Rules Engine API

Recommended public API:

```ts
export interface RulesEngine {
  createGame(config: GameConfig): GameState;

  getLegalCommands(
    state: GameState,
    playerId: PlayerId
  ): LegalActionSummary;

  validateCommand(
    state: GameState,
    command: GameCommand
  ): RuleValidation;

  applyCommand(
    state: GameState,
    command: GameCommand
  ): ApplyResult;

  replay(
    initialState: GameState,
    commands: GameCommand[]
  ): GameState;
}
```

All functions should be deterministic.

Avoid mutating the input `GameState`.

Use immutable updates or controlled structural cloning.

---

# 37. Error Model

Rules errors must be machine-readable.

```ts
type RuleErrorCode =
  | "GAME_NOT_ACTIVE"
  | "NOT_ACTIVE_PLAYER"
  | "WRONG_PHASE"
  | "INSUFFICIENT_RESOURCES"
  | "INVALID_PAYMENT"            // wrong extra payment, toll or bribe
  | "ROUTE_OCCUPIED"
  | "ROUTE_SMOULDERING"          // burned by Fire Bolt; only its former owner may rebuild it yet (§19.14)
  | "SITE_OCCUPIED"
  | "SITE_TOO_CLOSE"
  | "NOT_CONNECTED"
  | "REGION_FULL"
  | "BANNER_NOT_ADJACENT"
  | "STRONGHOLD_BANNERS_SAME_REGION" // §14.4
  | "BANNER_NOT_SETTLED"         // Royal Writ target protected (§14.6)
  | "WRIT_LIMIT_REACHED"
  | "WARDEN_LIMIT_REACHED"
  | "MARKET_LIMIT_REACHED"
  | "NO_TRADE_POST"
  | "ILLEGAL_MENACE_TARGET"
  | "CARD_LIMIT_REACHED"
  | "CARD_NOT_IN_HAND"
  | "INVALID_CARD_TARGET"
  | "DECK_EMPTY"                 // deck and discard both empty (§117)
  | "HAND_OVER_LIMIT"            // must discard before ending turn
  | "QUEST_NOT_AVAILABLE"        // not revealed or already claimed
  | "QUEST_NOT_COMPLETE"
  | "NO_PENDING_REACTION"
  | "REVISION_MISMATCH";
```

UI may map these codes to localized user-facing messages.

---

# 38. Content Data Model

Gameplay content should be data-driven.

Suggested project layout:

```text
packages/
  rules/
  content/
    cards/
    quests/
    menaces/
    maps/
    balance/
```

Prefer TypeScript data modules during early development for type safety.

Later, content may move to JSON/YAML if external authoring becomes useful.

---

# 39. Card Definition Model

```ts
export interface CardDefinition {
  id: CardId;
  // Localization keys (§71), e.g. "card.wizard_interference.name".
  // Content data never embeds display text.
  nameKey: string;
  type: CardType;
  rulesTextKey: string;
  flavorTextKey?: string;
  timing: CardTiming[];
  tags: string[];
  effectId: CardEffectId;
  copies: number;
}
```

Do not embed arbitrary executable scripts in card data.

Use `effectId` to call a typed effect implementation.

---

# 40. Quest Definition Model

```ts
export interface QuestDefinition {
  id: QuestId;
  nameKey: string;
  renown: number;
  descriptionKey: string;
  conditionId: QuestConditionId;
  exclusive: boolean;
}
```

---

# 41. Menace Definition Model

```ts
export interface MenaceDefinition {
  type: MenaceType;
  nameKey: string;
  locationType: "region" | "route" | "site";
  rulesTextKey: string;
  flavorTextKey?: string;
}
```

Behavior itself should remain typed code.

---

# 42. Repository Structure

Recommended monorepo:

```text
manors-and-menaces/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  ├─ public/
│  │  └─ vite.config.ts
│  │
│  └─ server/
│     └─ src/
│
├─ packages/
│  ├─ rules/
│  ├─ content/
│  ├─ ai/
│  ├─ protocol/
│  └─ ui-assets/
│
├─ src-tauri/
│
├─ tests/
│  ├─ integration/
│  └─ replay-fixtures/
│
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

Use **pnpm workspaces**.

---

# 43. Technology Stack

## 43.1 Language

**TypeScript**

Use strict mode.

Recommended `tsconfig` principles:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

## 43.2 UI framework

**Svelte**

Use Svelte for:

- HUD;
- dialogs;
- card hand;
- settings;
- lobby;
- quest panel;
- game log;
- tutorials;
- responsive layout;
- app-level state composition.

Do not put authoritative game rules in Svelte components.

## 43.3 Build tool

**Vite**

Single web build should support:

- direct browser deployment;
- Tauri packaging.

## 43.4 Board rendering

Start with **SVG**.

Use SVG for:

- Region shapes;
- Routes;
- Site markers;
- Holdings;
- Banners;
- Menace tokens;
- highlights;
- targeting overlays;
- selection indicators;
- accessibility labels.

Advantages:

- crisp at arbitrary zoom;
- natural interaction events;
- easy DOM inspection;
- straightforward path animation;
- easy CSS styling;
- low complexity for a board-sized scene.

## 43.5 PixiJS

PixiJS is optional.

Do **not** make it a dependency of the first playable prototype.

Introduce it only for effects that become cumbersome or expensive in SVG:

- particles;
- spell effects;
- ambient animated sprites;
- fog;
- glowing magical areas;
- large transient effects.

The board remains SVG even if PixiJS is added.

## 43.6 Packaging

**Tauri**

Use Tauri for:

- Windows;
- macOS;
- Linux;
- later iOS;
- later Android.

The same Vite frontend is deployed directly on the web.

## 43.7 Testing

Use:

- **Vitest** for rules/content/unit tests;
- **Playwright** for web UI/end-to-end tests;
- optional Tauri integration tests for packaging-specific behavior.

---

# 44. Why Svelte Is Optional but Recommended

The entire client could technically be vanilla TypeScript.

However, Svelte is recommended because the game will accumulate substantial application UI:

- card hand;
- drawers;
- modals;
- player panels;
- quest tracker;
- settings;
- matchmaking;
- game history;
- reconnect state;
- tutorials;
- responsive mobile layouts.

Svelte should be regarded as an ergonomic application layer, not a game-engine dependency.

The core architecture remains:

```text
Rules / State
    |
Selectors / View Models
    |
+------------------+
|                  |
Svelte UI       SVG Board
|                  |
+--------+---------+
         |
 Optional Pixi FX
```

---

# 45. Client State Architecture

Maintain separate state categories.

## 45.1 Authoritative state

The latest accepted `GameState`.

Read-only from UI perspective.

## 45.2 Draft turn state

Local provisional state for undoable actions before submission.

## 45.3 UI state

Non-gameplay state:

- selected card;
- hovered Region;
- open dialog;
- zoom;
- tutorial step;
- animation queue.

Never serialize UI state as part of authoritative game state.

## 45.4 Derived view state

Selectors compute:

- legal build Sites;
- legal Routes;
- next Harvest preview;
- affected Regions;
- Quest completion status;
- Menace targeting options.

---

# 46. Svelte Store Strategy

Do not place the whole project in one giant writable store.

Recommended modules:

```text
gameState.svelte.ts
draftTurn.svelte.ts
selection.svelte.ts
boardViewport.svelte.ts
animationQueue.svelte.ts
settings.svelte.ts
```

Rules package remains framework-free.

Use derived values for:

- current player;
- legal actions;
- harvest preview;
- selected target options.

---

# 47. SVG Board Architecture

Suggested component tree:

```text
Board.svelte
├─ TerrainLayer
│  └─ RegionPath[]
├─ RouteLayer
│  └─ RoutePath[]
├─ HoldingLayer
│  └─ HoldingToken[]
├─ BannerLayer
│  └─ BannerToken[]
├─ MenaceLayer
│  └─ MenaceToken[]
├─ HighlightLayer
└─ InteractionLayer
```

## 47.1 Coordinates

Use one shared logical board coordinate system.

Example:

```text
viewBox="0 0 1600 1000"
```

All authored map positions use that system.

Responsive scaling is handled by SVG.

## 47.2 Interaction

Use pointer events.

Support:

- hover;
- click/tap;
- keyboard focus;
- long-press details on touch;
- drag only when it improves usability.

Banner assignment should preferably use click/tap selection rather than drag-only interaction, because drag is less accessible.

---

# 48. Board Camera

Required:

- pan;
- zoom;
- reset view;
- zoom-to-selection.

Desktop:

- wheel zoom;
- drag pan.

Touch:

- pinch zoom;
- one-finger pan when not targeting.

Keep critical player HUD outside the zoomed board.

---

# 49. Visual State Encoding

Every board entity needs multiple simultaneous channels beyond color.

Examples:

## Regions

- fill color;
- resource icon;
- terrain illustration;
- capacity markers.

## Player ownership

- color;
- heraldic shape;
- small player emblem.

## Menaces

- unique silhouette;
- icon;
- animation;
- tooltip.

This is required for color accessibility.

---

# 50. Animation Principles

Animation must communicate state, not delay the game.

Recommended durations:

- resource fly-to-HUD: 250–400 ms;
- Banner move: 200–300 ms;
- Menace move: 300–500 ms;
- structure build: 300–450 ms;
- Quest completion: 500–800 ms.

Provide:

- normal speed;
- fast speed;
- reduced-motion mode.

When animations are disabled or sped up, logic timing must not change.

---

# 51. Audio

Music:

- acoustic fantasy;
- lute;
- flute;
- light strings;
- hand percussion;
- warm ambient texture.

SFX:

- resource collection;
- Banner placement;
- Route construction;
- Manor construction;
- spell cast;
- Menace movement;
- card draw;
- Quest completion;
- turn change.

Menaces should have distinctive cues.

---

# 52. Accessibility

Minimum requirements:

- keyboard navigation for core UI;
- visible focus states;
- no color-only information;
- scalable text;
- high-contrast mode;
- reduced motion;
- configurable animation speed;
- subtitles/text equivalents for meaningful audio;
- minimum touch targets approximately 44 CSS px;
- screen-reader labels for buttons and cards;
- tooltips not required to discover essential rules;
- board entities should expose accessible names.

For SVG:

```html
<g role="button" aria-label="Iron Mine, capacity 1, occupied by Blue Banner">
```

---

# 53. Responsive Layout

## Desktop

Suggested:

```text
+----------------------+-------------------+
|                      | Player / Quests   |
|       BOARD          | Cards / Details   |
|                      |                   |
+----------------------+-------------------+
| Hand / Actions / Harvest Preview         |
+------------------------------------------+
```

## Tablet

Board remains primary, side panels become collapsible.

## Phone

Use:

- full-screen board;
- bottom action sheet;
- slide-over card/quest panels;
- compact top resource bar.

---

# 54. Harvest Preview

This is a critical feature.

During Banner Assignment show:

```text
NEXT HARVEST

Grain      +2
Timber     +1
Stone      +0
Iron       +1
Essence    +1
```

Also show warnings:

```text
Stone +1
Blocked by Toll Troll
```

and conversions:

```text
Grain → Essence
Bog Witch
```

The preview should update immediately as Banners move.

Ending the turn compares the preview's total with the best legal placement and warns when that is higher (§16.3).

---

# 55. Tutorial Requirements

Tutorial must explicitly teach:

1. Holdings generate Banners.
2. Banners select future resources.
3. Resources arrive next turn.
4. Regions have limited capacity.
5. Roads expand the network.
6. Menaces interfere with local rules.
7. Cards move Menaces or Banners.
8. Royal Quests score Renown.
9. Reach the target Renown to win (Standard: 15 by default, or 13 with 4 players; Core tutorial: 10).

Tutorial should be interactive, not a wall of text.

---

# 56. Local Game Modes

## 56.1 Hot-seat

2–4 players on one device.

At turn transitions, optionally show a privacy curtain:

> Pass to Alice  
> Tap to begin turn.

Because resources are public but cards are hidden, this is important.

## 56.2 AI players

Humans may mix with AI players.

Example:

- 1 human + 2 AI;
- 2 humans + 1 AI.

---

# 57. AI Architecture

Do not use machine learning initially.

Use heuristic search.

## 57.1 Candidate generation

Generate legal candidate actions:

- builds;
- trades;
- card plays;
- Quest claims;
- Banner configurations.

The AI plans only on what its player could see (§105): it simulates candidates on the redacted view, so rivals' hands, the draw pile and the RNG state never change its choice. Because a simulated Spell there never meets a Counterspell, each Spell is scored as a blend of resolving and being countered, weighted by the chance that a rival holds a Counterspell, counted from public cards only. A random outcome, such as Dragon's Landing's target, is averaged over the possible results.

## 57.2 Evaluation

Score resulting states.

Suggested components:

```text
+ 8.0 * Renown
+ 2.0 * expected_next_harvest_value
+ 1.5 * quest_progress
+ 1.2 * network_reach
+ 1.0 * resource_diversity
+ 0.8 * card_value
+ 0.7 * menace_pressure_on_opponents
- 1.0 * menace_pressure_on_self
- 0.8 * wasted_resources
```

Weights are placeholders.

## 57.3 Banner search

Because Banner assignment is combinatorial, use:

- legal-region enumeration;
- pruning;
- heuristic resource-demand estimation.

For a player with 6 Banners and 2–4 choices each, brute force may still be manageable with pruning.

## 57.4 Difficulty

Easy:
- shallow evaluation;
- random choice among near-best candidates;
- weak opponent modeling.

Normal:
- stronger heuristic;
- one-turn opponent estimate.

Hard:
- deeper search;
- Quest race evaluation;
- denial strategies.

---

# 58. Backend Strategy

No backend is required for local MVP.

For online play, use a server-authoritative command model.

Possible implementation:

- TypeScript server;
- PostgreSQL;
- optionally Supabase for Auth/Postgres/Realtime.

The rules package is shared between client and server.

---

# 59. Online Command Flow

```text
Client
  |
  | ordered command batch + expected revision (§32.1)
  v
Server
  |
  | authenticate
  | load match
  | verify active player
  | validate command
  | apply shared rules
  | persist events/state
  v
Database
  |
  v
Server response / realtime notification
  |
  v
Clients
```

Clients must never submit arbitrary replacement game state.

---

# 60. Match Revision

Every accepted command increments `GameState.revision`. A batch of N accepted commands increases it by N.

Revision is part of `GameState`; it is not kept in a separate wrapper. It is distinct from:

- `SaveFile.schemaVersion`, the serialization format (§64);
- `GameState.rulesetVersion`, gameplay behaviour and balance (§64).

With each batch, the client sends the revision its draft was based on:

```ts
expectedRevision: 42
```

If the server is already at 43:

- reject with `REVISION_MISMATCH`;
- client reloads current state;
- local draft is reconciled or discarded.

---

# 61. Online Persistence

Recommended tables:

```text
users

matches
  id
  status
  rules_version
  seed
  revision
  active_player_id
  state_snapshot
  created_at
  updated_at

match_players
  match_id
  user_id
  seat
  display_name

match_events
  id
  match_id
  revision
  player_id
  command_id
  command_type
  payload
  created_at
```

Store periodic snapshots plus command/event history.

---

# 62. Replays

A match should be reproducible from:

```text
ruleset version
+ seed
+ initial config
+ ordered commands
```

Replay system can later support:

- match review;
- debugging;
- spectating;
- shareable replays;
- regression fixtures.

---

# 63. Save Files

Local save schema:

```ts
interface SaveFile {
  schemaVersion: number;
  rulesetVersion: string;
  savedAt: string;
  state: GameState;
  commandHistory?: GameCommand[];
}
```

Do not store runtime class instances.

Use plain serializable objects.

---

# 64. Versioning

Two separate versions are required:

## Save schema version

Changes when serialization format changes.

## Ruleset version

Changes when gameplay behavior or balance changes.

Online players in the same match must use the same ruleset version.

---

# 65. Deterministic RNG

Implement a small seeded PRNG owned by game state.

Requirements:

- serializable internal state;
- deterministic across browser, Node, and Tauri;
- no floating-point ambiguity if avoidable.

Use an established simple algorithm such as:

- xoshiro128**;
- sfc32;
- PCG variant.

Wrap it behind:

```ts
interface GameRng {
  nextUint32(): number;
  nextInt(maxExclusive: number): number; // unbiased, via rejection sampling
  nextFloat(): number;                   // nextUint32() / 2**32, in [0, 1)
  shuffle<T>(items: readonly T[]): T[];  // Fisher–Yates using nextInt
  pick<T>(items: readonly T[]): T;
}
```

Gameplay code should use the integer methods (`nextInt`, `shuffle`, `pick`). `nextFloat` exists for non-authoritative uses such as AI tie-breaking. It must never feed into a rules outcome, which keeps rules results free of floating-point differences between platforms.

---

# 66. Testing Strategy

Testing the rules engine is a first-class requirement.

## 66.1 Unit tests

Test:

- resource costs;
- Site spacing;
- Route connectivity;
- Banner adjacency;
- capacity;
- Stronghold Banner restriction;
- Harvest;
- Market;
- card limits;
- Menace rules;
- Quest conditions;
- victory.

## 66.2 Determinism test

For any fixture:

> Same seed + same commands = byte-equivalent normalized final state.

## 66.3 Replay regression tests

Store known command logs.

After rules changes, replay them and inspect expected results.

## 66.4 Property tests

Useful invariants:

- resources never negative;
- no Region exceeds capacity;
- no Site has more than one Holding;
- no Route has more than one owner;
- each Banner's Region is adjacent to origin Holding;
- no Stronghold has both Banners in the same Region;
- an unsettled Banner is never displaced by a Royal Writ;
- total resources are conserved across a Royal Writ (the challenger's loss equals the supply's gain plus the defender's gain);
- `getRenown()` is non-decreasing over a match in the base game;
- active player always exists while game is active.

## 66.5 UI E2E tests

Use Playwright.

Critical flows:

- create game;
- initial placement;
- complete first turn;
- build Route;
- assign Banner;
- Harvest;
- buy/play card;
- move Menace;
- claim Quest;
- win match;
- save/reload.

---

# 67. Telemetry for Balance

Development telemetry should capture:

- player count;
- winner seat;
- turn count;
- final Renown;
- Renown by turn;
- resources produced by type;
- resources spent by type;
- Banner occupation frequency;
- average Region contention;
- how long each Region stays held by the same player (the "hereditary Region" check);
- Royal Writs issued, with target Region type and whether the defender retook it;
- Warden hires;
- Trading Post usage;
- Menace moves;
- card plays, per card;
- the round of the endgame omen, and games ended by Ragnarök with their round (§19.13);
- second-wave damage: Holdings destroyed or reduced, Routes burned, Banners sickened, hands swapped, insurance claims;
- Quest claims;
- Market trades;
- first-player win rate;
- average game duration.

Do not collect personally identifying data unless necessary and consented.

---

# 68. Balance Targets

Initial targets:

- average game length: 45 minutes;
- average turns per player: 12–16;
- winner Renown: 12 (standard), 10 (MVP);
- no Region held by the same player for more than 60% of the match in more than 25% of games;
- Royal Writ used at least occasionally (mean ≥ 1 per player per game) but not constantly (mean ≤ 1 per player every 3 turns);
- average Harvest by midgame: 3–5 resources;
- average Harvest by late game: 4–7 resources;
- no starting seat > 30% win rate in 4-player testing;
- no single Quest claimed in > 60% of games unless intentionally easy;
- no single resource should be the dominant bottleneck in > 50% of games.

---

# 69. Art Direction

Recommended:

**2D illustrated storybook fantasy map.**

Avoid a sterile board-game abstraction where possible.

Visual motifs:

- bright green countryside;
- parchment map accents;
- colorful heraldry;
- exaggerated roofs and towers;
- animated flags;
- sheep and carts;
- water mills;
- mushroom circles;
- magical glows;
- friendly-but-dangerous creatures.

---

# 70. Asset Layers

Board illustration should be separated into:

1. base terrain;
2. Region overlays;
3. Routes;
4. landmarks;
5. Holdings;
6. Banners;
7. Menaces;
8. highlights/effects;
9. UI labels.

This supports state-driven rendering and animation.

---

# 71. Localization

All user-facing strings should be externalized from the start.

Use IDs:

```ts
t("card.wizard_interference.name")
t("card.wizard_interference.rules")
```

Do not embed English text inside game-rule code.

Rules engine uses IDs, not localized strings.

---

# 72. Security

Online server must validate:

- player identity;
- match membership;
- active turn;
- expected revision;
- command legality;
- resource costs;
- card ownership;
- target legality.

Never trust:

- client resource totals;
- client Renown;
- client card draws;
- client RNG output;
- client legality checks.

---

# 73. Privacy and Accounts

Initial web/local build may not require accounts.

Online multiplayer may support:

- guest sessions;
- email/social auth;
- display name;
- friends/invite links later.

Keep account requirements minimal.

---

# 74. Packaging with Tauri

Tauri responsibilities:

- native window;
- filesystem saves if desired;
- native notifications;
- platform menus;
- platform-specific app lifecycle;
- mobile packaging later.

Game logic should not import Tauri APIs.

Wrap native capabilities behind adapters.

Example:

```ts
interface PlatformAdapter {
  saveLocalFile(data: string): Promise<void>;
  loadLocalFile(): Promise<string | null>;
  notify(title: string, body: string): Promise<void>;
}
```

Implement:

- BrowserPlatformAdapter;
- TauriPlatformAdapter.

---

# 75. Web Deployment

Web build should work independently of Tauri.

Requirements:

- static hosting compatible;
- responsive;
- PWA support optional;
- local games stored in IndexedDB;
- online games via HTTPS/WebSocket or Realtime backend.

Possible hosting:

- Cloudflare Pages;
- Netlify;
- Vercel;
- static object hosting.

Do not couple the application to one provider.

---

# 76. Offline Support

Local games should work offline.

For web:

- cache application shell;
- use IndexedDB for saves.

For Tauri:

- local filesystem or embedded database.

Online matches obviously require connectivity.

---

# 77. Content Expansion Model

The architecture should support adding:

- new cards;
- new Quests;
- new Menaces;
- new maps;
- new landmarks;
- new player factions;
- new cosmetic themes.

Do not design a plugin system yet.

Typed data definitions are sufficient.

---

# 78. Dark Wizard Expansion

The Dark Wizard is not required for the MVP.

Potential future implementation:

## Chaos Track

Certain powerful spells add Chaos.

Thresholds trigger Dark Wizard effects.

Example:

```text
Chaos 3  → Move a Menace
Chaos 6  → Corrupt a Region
Chaos 9  → Major magical event
```

The Dark Wizard should not simply be random punishment.

Players should usually increase Chaos by choosing strong magical actions.

---

# 79. Cooperative / Solo Dark Wizard Mode

Future mode:

Players cooperate against an automated Dark Wizard.

Wizard goals:

- corrupt key Regions;
- occupy landmarks;
- summon Menaces;
- complete ritual progress.

This requires a separate scenario system and is out of base-game scope.

---

# 80. Landmarks

Base MVP may use landmarks only for Quest targeting.

Future landmark abilities:

## Adventurers' Inn

Buy Hero cards more cheaply.

## Wizard Tower

Buy Spells more cheaply.

## Dwarven Hall

Improve Stone/Iron trade.

## Royal Castle

Quest-related bonus.

## Sacred Grove

Essence-related bonus.

Do not add these until core balance is stable.

---

# 81. Interaction Philosophy

Good disruption:

- occupy a desired Region;
- move a Troll;
- redirect a Banner;
- temporarily block a Route;
- race for a Quest;
- steal or divert a limited resource;
- manipulate market access.

Avoid:

- destroying a Stronghold;
- permanently deleting Routes;
- skipping whole turns;
- eliminating a player;
- repeated unavoidable card theft;
- hidden effects with no counterplay.

The second wave's harshest cards stay inside these limits. Dragon's Landing only ever reduces a Stronghold, and Fire Bolt lets the owner rebuild the burned Route first; §111.1 has the details.

The third wave (§19.22–19.27) keeps to them too, with one deliberate exception. Siege Engines only reduces a Stronghold, Raiders gives the owner a rebuild window like Fire Bolt's, and Disgrace and Stolen Glory take at most 1 Renown each. Siege Fireball permanently removes a Site from play, at the request of the player who designed it; §111.2 records how it is contained.

---

# 82. Card Counterplay

Interference should generally have one or more answers:

- alternate Region;
- Royal Writ (retake a contested Region);
- Hire a Warden (move a Menace off your assets);
- Market or Trading Post exchange;
- Counterspell;
- Knight Errant;
- Royal Insurance Policy (against Fire Bolt, The Plague, Changeling and every card that costs Renown, §19.19);
- alternative expansion path.

No card should permanently disable a player's economy.

---

# 83. Information Model

Public:

- all Holdings;
- all Routes;
- all Banners;
- all Menaces;
- all resources;
- Renown;
- claimed Quests;
- number of cards in hand;
- Charters in front of each player (§18.1);
- set-aside cards, and when the omen shuffles them into the draw pile (§19.13);
- Renown lost for good (§8), ruined Sites and razed Sites (§19.24, §19.26);
- with Sealed Charges (§27A): whether each player holds a sealed Charge, how many Charges the deck holds, every revealed Charge, and Recommissions.

Private:

- card identities in hand;
- unrevealed deck order, the Charge deck's included;
- each player's sealed Charge, and the Charges a player is choosing from (§27A).

After a Changeling swap (§19.12) the two players involved know the cards they received. Everyone else sees only the new hand sizes.

This keeps strategy readable while preserving card surprise.

Sealed Charges hide a goal, never Renown. A Charge scores only when it is revealed, at its holder's End Turn before the victory check (§27A.3), so every point of Renown is public when the game can end, and nobody wins on points the others could not see. What is unknown is bounded and marked: at most one sealed Charge per player at a time, worth 2 Renown, shown by a seal on the scoreboard, so a player can see that "Bertram wins this turn if his Charge is met".

---

# 84. Event Log

UI should maintain a concise readable turn log.

Example:

```text
Alice harvested 2 Timber and 1 Grain.
Alice built a Route.
Alice played Knight Errant.
The Toll Troll moved to East Quarry.
Alice assigned 3 Banners.
```

Allow expanding technical detail for debugging builds.

---

# 85. Notification Model

For asynchronous play:

Notify when:

- it becomes your turn;
- an opponent completed a major Quest;
- match ended;
- invited to a match.

Do not send excessive notifications for every opponent action.

---

# 86. Matchmaking

Not needed for MVP.

Later modes:

- invite link;
- friends-only;
- public asynchronous queue;
- public live queue.

Private invite links should be first online implementation.

---

# 87. Spectator Mode

Not needed initially.

Replay architecture should make future spectators possible.

---

# 88. Anti-cheat

Primary defense:

- server-authoritative rules;
- hidden cards stored server-side;
- server RNG;
- revision checks.

No invasive anti-cheat software is necessary.

---

# 89. Performance Targets

Because the game is low-fidelity, performance should be conservative.

Desktop/web target:

- 60 fps during board interaction;
- input response < 100 ms locally;
- initial bundle reasonable for web deployment;
- no unnecessary full-board rerenders.

SVG board entity count should remain modest.

Typical scene:

- < 30 Regions;
- < 60 Routes;
- < 45 Sites;
- < 25 Holdings;
- < 35 Banners;
- < 5 Menaces.

This is trivial for modern browsers if implemented sensibly.

---

# 90. Rendering Optimization

Do not prematurely optimize.

If needed:

- memoize geometry;
- separate static and dynamic SVG groups;
- avoid regenerating path strings;
- minimize reactive dependencies;
- batch animation state;
- move heavy particle effects to PixiJS.

---

# 91. MVP Scope

The first playable prototype should include:

- TypeScript rules package;
- Svelte client;
- SVG board;
- one fixed map;
- 3 players;
- pass-and-play;
- five resources;
- Routes;
- Manors;
- Strongholds;
- Banners;
- Harvest preview;
- Market and Trading Posts;
- Royal Writ;
- Hire a Warden;
- 10 Renown victory (§7.1);
- Toll Troll;
- placeholder art;
- no cards;
- no Quests;
- no AI;
- no online play.

Purpose:

> Validate whether deterministic Banner allocation and Region competition are fun.

---

# 92. MVP Acceptance Criteria

A complete MVP allows players to:

1. start a local 3-player game;
2. complete snake-draft setup;
3. see legal Site and Route targets;
4. build Routes;
5. build Manors;
6. upgrade Strongholds;
7. assign Banners;
8. see next Harvest preview;
9. Harvest correctly;
10. trade at the Market and at Trading Posts;
11. move the Toll Troll by hiring a Warden;
12. displace a Settled opponent Banner with a Royal Writ;
13. reach 10 Renown;
14. end the game;
15. restart.

All core rules have automated tests.

---

# 93. Prototype Phase 2

Add:

- 2–4 players;
- full Menace framework;
- the other 4 Menaces (Highwayman, Young Dragon, Bog Witch, Goblin Tinkers), for 5 in total;
- 24-card prototype deck;
- 12 Royal Quests;
- AI;
- sound;
- better animations;
- telemetry;
- save/resume.

Purpose:

> Determine whether fantasy interference improves the deterministic economy without overwhelming it.

---

# 94. Production Phase

Add:

- polished art;
- all supported desktop/web platforms;
- tutorial;
- accessibility settings;
- robust AI;
- 60–100 cards;
- 6–8 Menaces;
- multiple maps;
- online accounts;
- private asynchronous matches;
- private live matches;
- achievements;
- localization-ready assets.

---

# 95. Suggested Production Content

Base release target:

- 3 maps;
- 5 resources;
- 8 Menaces;
- 72 cards;
- 24 Royal Quests;
- 6 landmarks;
- 4 player heraldry sets;
- 3 AI difficulties.

Do not commit to this scope until prototype testing validates the core.

---

# 96. Development Milestones

## Milestone 1 — Rules skeleton

Deliver:

- data types;
- GameState;
- deterministic RNG;
- command/event architecture;
- setup;
- turn phases.

## Milestone 2 — Core economy

Deliver:

- resource inventory;
- Manors;
- Strongholds;
- Routes;
- Banners (including Settled state);
- Harvest;
- Market and Trading Posts;
- Royal Writ;
- Renown.

## Milestone 3 — SVG board

Deliver:

- map rendering;
- selection;
- build highlights;
- Banner assignment;
- Harvest preview.

## Milestone 4 — Local playable

Deliver:

- setup UI;
- turn loop;
- victory;
- hot-seat flow;
- save/load.

## Milestone 5 — Menaces

Deliver:

- generic Menace framework;
- Toll Troll;
- Highwayman;
- Young Dragon;
- Bog Witch;
- Goblin Tinkers;
- Hire a Warden (the Toll Troll version ships in the MVP; generalize it here);
- movement UI.

## Milestone 6 — Cards and Quests

Deliver:

- deck;
- hand UI;
- effect engine;
- reaction flow;
- Quest tracker.

## Milestone 7 — AI

Deliver:

- legal action generator;
- heuristic evaluator;
- basic difficulty levels.

## Milestone 8 — Online foundation

Deliver:

- accounts;
- match persistence;
- command API;
- revision control;
- reconnect.

## Milestone 9 — Tauri packaging

Deliver:

- Windows;
- macOS;
- Linux;
- native save/notifications.

## Milestone 10 — Polish

Deliver:

- final art;
- sound;
- onboarding;
- accessibility;
- balance;
- platform QA.

---

# 97. Suggested First Implementation Tasks

A coding model beginning the project should perform these tasks in order.

## Task 1

Create pnpm monorepo with:

- `apps/web`;
- `packages/rules`;
- `packages/content`;
- `packages/protocol`.

## Task 2

Configure:

- TypeScript strict mode;
- Vite;
- Svelte;
- Vitest;
- ESLint;
- Prettier.

## Task 3

Implement IDs and primitive types.

Example:

```ts
export type PlayerId = string;
export type SiteId = string;
export type RegionId = string;
export type RouteId = string;
export type HoldingId = string;
export type BannerId = string;
```

## Task 4

Implement fixed v0.1 map data.

## Task 5

Implement `GameState`.

## Task 6

Implement deterministic RNG.

## Task 7

Implement setup placement commands.

## Task 8

Implement Route/Manor/Stronghold validation.

## Task 9

Implement Banner assignment.

## Task 10

Implement Harvest.

## Task 11

Implement Market, Trading Posts, Royal Writ and Hire a Warden.

## Task 12

Implement Renown and victory.

## Task 13

Write comprehensive rules tests.

## Task 14

Build minimal Svelte HUD.

## Task 15

Render fixed board in SVG.

## Task 16

Connect legal-action selectors to board highlighting.

## Task 17

Implement full local turn loop.

---

# 98. Coding Conventions

Use:

- small pure functions;
- discriminated unions;
- exhaustive `switch` statements;
- explicit domain types;
- no implicit `any`;
- no gameplay logic in UI components;
- no direct `Math.random`;
- no untyped JSON blobs for core state;
- no mutable singleton game manager.

Prefer:

```ts
function canBuildManor(
  state: GameState,
  playerId: PlayerId,
  siteId: SiteId
): RuleValidation
```

over:

```ts
GameManager.instance.tryBuildThing(...)
```

---

# 99. Logging

Development builds should support structured logs.

Categories:

- rules;
- command;
- event;
- network;
- render;
- AI.

Production logs should avoid exposing hidden card contents to other players.

---

# 100. Debug Tools

Provide a development-only debug panel.

Capabilities:

- grant resources;
- set Renown;
- draw specific card;
- move Menace;
- advance turn;
- inspect GameState;
- export command log;
- import replay;
- toggle legal-action overlays.

This will save substantial development time.

---

# 101. Map Authoring Format

Initial manual map format:

```ts
export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  sites: SiteDefinition[];
  routes: RouteDefinition[];
  regions: RegionDefinition[];
  landmarks: LandmarkDefinition[];
  menaceStarts: MenaceStartDefinition[];
  questParams: {
    kingsHighway: [SiteId, SiteId]; // the two landmark Sites for King's Highway
  };
}
```

`SiteDefinition` carries the optional `tradePost` from §10.1.

Region geometry may reference SVG path IDs or contain path data.

Example:

```ts
interface RegionDefinition {
  id: RegionId;
  resource: ResourceType;
  capacity: number;
  path: string;
  labelX: number;
  labelY: number;
  adjacentSiteIds: SiteId[];
}
```

---

# 102. Geometry Validation

At development time, validate map files:

- all IDs unique;
- all referenced IDs exist;
- Route endpoints are valid;
- Site adjacency is symmetric;
- Region adjacency references valid Sites;
- every Site has coordinates;
- all Regions have capacity >= 1;
- Menace starts are legal;
- every Site is adjacent to at least 1 Region;
- every resource type is present;
- `questParams` reference landmark Sites;
- Trading Posts are not on landmark Sites.

Also check the balance heuristics from §11.1 and print warnings, not failures:

- the maximum set of Sites that can all hold Holdings under the spacing rule is at least `4 × maxPlayers`. An exact search is cheap at this size (about 40 Sites);
- total Banner capacity against the mid-game estimate;
- for each resource, the number of Regions and their capacity.

Fail fast during startup in dev mode.

---

# 103. Rules vs Presentation Separation

The rules engine should never know:

- SVG path;
- screen coordinates;
- animation duration;
- Svelte component;
- sound effect;
- tooltip;
- translation string.

The presentation layer should never decide:

- whether an action is legal;
- how much it costs;
- whether a Quest is complete;
- whether a Menace blocks production.

---

# 104. Network Protocol Package

Shared protocol types should live in `packages/protocol`.

Example:

```ts
// A single command is sent as a batch of length 1.
interface SubmitCommandsRequest {
  matchId: string;
  expectedRevision: number;
  commands: GameCommand[]; // applied in order, atomically (§32.1)
}

interface SubmitCommandsResponse {
  accepted: boolean;
  revision: number;
  events: GameEvent[];
  state?: GameState;
  error?: RuleError;
}
```

---

# 105. Online Hidden Information

For online play, the server should not send other players' hand contents.

Therefore define:

```ts
type PublicGameState = ...
type PrivatePlayerState = ...
```

Client receives:

- complete public state;
- private hand for current authenticated user.

For local hot-seat, full state may exist locally but must be hidden in the UI between turns.

Sealed Charges (§27A) are hidden the same way: each client receives rivals' sealed Charges, the Charges a rival is choosing from and the Charge deck as `hidden`, which keeps their counts.

---

# 106. Serialization

Use stable JSON-compatible structures.

Avoid:

- `Map`;
- `Set`;
- class instances;
- `Date`;
- functions;
- cyclic references.

Use records and arrays.

---

# 107. State Hashing

Optional but recommended:

Compute a deterministic state hash in development and online builds.

Useful for:

- desync detection;
- replay verification;
- debugging.

Normalize key ordering before hash.

---

# 108. Rule Evaluation Helpers

Create reusable selectors:

```ts
getPlayerHoldings(state, playerId)
getPlayerRoutes(state, playerId)
getSupportedBanners(state, playerId)
getLegalBannerRegions(state, bannerId)
getRegionOccupancy(state, regionId)
getNetworkSites(state, playerId)
getHarvestPreview(state, playerId)
getQuestProgress(state, playerId, questId)
```

Selectors should be pure.

---

# 109. Reaction Cards

Reaction handling introduces nested interaction.

Use an explicit pending-resolution state.

```ts
interface PendingEffect {
  effectId: string;
  sourcePlayerId: PlayerId;
  eligibleReactionPlayerIds: PlayerId[];
  responseDeadline?: string;
}
```

For local play, prompt eligible player.

For async online, reaction windows can be cumbersome.

Recommended asynchronous rule:

- reactions are not supported in async mode initially;
- Counterspell can be omitted or replaced in async ruleset.

Alternatively use preconfigured auto-reactions later.

Do not let reaction handling block the first online implementation.

---

# 110. Mode-specific Rulesets

Support a `RulesetConfig`.

```ts
interface RulesetConfig {
  playerCount: number;
  targetRenown: number;            // chosen at creation (§7); default 15 standard (13 with 4 players), 10 MVP
  activeMenaces: MenaceType[];     // §118
  enableCards: boolean;
  enableReactionCards: boolean;
  enableQuests: boolean;
  enableTradePosts: boolean;
  market: { give: number; receive: number; maxTradesPerTurn: number };
  writ: {
    enabled: boolean;
    requireSettled: boolean;       // §14.6; see variants in §129.2
    bribeToOwner: boolean;         // false = whole cost goes to supply
    maxPerTurn: number;
  };
  warden: { enabled: boolean; maxPerTurn: number };
  sealedCharges?: boolean;         // §27A: a lobby option, absent (off) unless chosen
}
```

This allows:

- MVP mode;
- standard mode;
- async mode;
- future expansions.

---

# 111. Content Safety Against Degenerate Effects

Every new card or Menace should pass these design checks:

- Can it permanently erase major progress?
- Can it force a player to skip a turn?
- Can it create an infinite loop?
- Can it leave no legal Banner placement?
- Can it create negative resources?
- Can it make a Quest impossible after claim?
- Does it disproportionately punish one seat?
- Does it create excessive hidden information?

If yes, redesign or explicitly handle the edge case.

## 111.1 The second wave against the checklist

Five second-wave cards can hurt a rival badly or end the game early. These are their answers.

**Dragon's Landing (§19.15)** is the only card that removes Renown, and it tests the Reversible disruption pillar (§2.3) hardest.

- *Permanently erase major progress?* It costs its victim 1 Renown and one Banner, and its limits stop it from erasing a position. Only a player with 3 or more Holdings can be hit, so nobody drops below the 2 Holdings everyone starts with, and nobody is eliminated (§3). A Stronghold is only reduced to a Manor, never removed, and can be upgraded again. Only a Manor burns, and its Site can be built on again. There is one copy.
- *Punish one seat?* It is not aimed. The Holding is drawn at random from every eligible player's Holdings, the caster's included, so on average the loss falls on whoever has built the most.
- *Counterplay:* a Royal Insurance Policy absorbs it (§19.19). As a Story it cannot be countered, so the policy is the answer, and because policies are public everyone knows who is covered.
- *Quest impossible after claim?* No. Claimed Quests stay claimed, even Master Builder after one of its Holdings burns.
- *No legal Banner placement?* No. The lost Banner goes with its Holding, or is chosen by §114 on a Stronghold, and the other Banners stay where they are.
- *Hidden information?* None. The pool is public, the pick uses the match RNG when the card resolves, and the result is announced.

**Fire Bolt (§19.14)** is the answer to §81's warning against permanently deleting Routes: the loss is not permanent. The former owner alone may rebuild the Route until the end of their next turn, at the normal cost, and no Holding or Renown is lost. Counterspell (it is a Spell) and the Royal Insurance Policy stop it, and the bridges-first rule keeps the target readable.

**The Plague (§19.17)** never skips a turn. Each sick Banner misses one Harvest, its owner harvests from their other Banners and plays the turn as usual, and that Harvest cures the sickness. It cannot stack: a sick Banner cannot fall sick again until it is cured. It hits the caster's own Banners in range too. Counterspell, the policy and spreading your Banners out are the answers.

**Changeling (§19.12)** is not the repeated, unavoidable card theft that §81 warns against. There is one copy, it gives cards back instead of only taking them, and Counterspell or the policy stops it. The other players learn nothing but the new hand sizes (§83).

**Ragnarök (§19.13)** erases nothing: it ends the game on the current standings. It cannot hand the win to a player who is behind, because only a leader or co-leader may play it, and it cannot come as a surprise: it stays out of the draw pile until the public omen tells every player the endgame has begun. Counterspell is the answer; the policy deliberately is not.

None of the ten cards can create negative resources: every payment is checked against what the payer has, Robin of the Glade takes only from rivals who have the resource, and Treasure Hunter takes at most what the Hoard holds. None can loop: each resolves once and moves at most one Menace.

## 111.2 The third wave against the checklist

The third wave (§19.22–19.27) was asked for as offensive cards, so each is held to the checklist here.

**Siege Fireball (§19.26)** is the only card in the game that permanently erases something: a Site. It is contained on every other count.

- *Permanently erase major progress?* It costs its victim one Manor, 1 Renown and one Banner, and one buildable Site for everyone, the caster included. The victim keeps their Routes and may build elsewhere. Only a rival with more Renown than the caster, and with 3 or more Holdings, can be hit, so no player drops below two Holdings or is eliminated (§3), and the leader, not a struggling player, pays. There is one copy.
- *Counterplay:* Counterspell, the Royal Insurance Policy, and keeping your Renown no higher than the caster's. The confirmation dialog tells the caster the ruin is for good.
- *Quest impossible?* No. No Quest needs a particular Site (§27.1), and ruins do not block Routes or networks.
- *No legal Banner placement?* No. The Banner goes with its Manor.

**Raiders (§19.24)** and **Siege Engines (§19.23)** are aimed versions of Dragon's Landing's two results, and keep its limits: Raiders only burns a Manor of a player with 3 or more Holdings, with a rebuild window like Fire Bolt's, and Siege Engines only reduces a Stronghold. Both need one of the caster's Routes to reach the Holding, so the threat is on the board before it lands.

**Disgrace (§19.22)** and **Stolen Glory (§19.25)** cannot target a player who is behind: Disgrace strikes only the leader, and Stolen Glory only a rival ahead of the caster. Each takes 1 Renown; Renown never falls below 0 (§8).

**Sabotage (§19.27)** takes at most 2 Grain and never more than the target has, so it cannot create negative resources.

None of the six can loop or skip a turn, all are public, and all are Spells, so Counterspell answers every one of them.

## 111.3 The Dowager against the checklist

**The Dowager (§19.28)** only builds, so most of the checklist does not apply: she erases nothing, cannot loop, and pays in full from what her player holds. She never crowds a rival, since no rival's Holding may stand next to her Manor, and the spacing rule still protects everyone else's Regions. Her Manor raises a Banner like any other; with no free Region it waits at home (§112). She cannot be countered, as building never could, and nothing about her is hidden once played. Held, she cannot keep a full board open (§7).

## 111.4 Sealed Charges against the checklist

Sealed Charges (§27A) are the one rule that adds hidden information beyond cards in hand, so they are held to the checklist here.

- *Excessive hidden information?* One Charge per player at a time, like one card in hand, and the scoreboard marks who holds one. A Charge is worth 2 Renown and scores only when revealed, before the victory check, so Renown stays public (§83) and no game is won on hidden points. The option is off unless chosen.
- *Permanently erase major progress?* No. A revealed Charge stays scored, and nothing takes a sealed Charge away.
- *A goal made impossible?* A landmark Charge can be closed off by rivals' Holdings and Routes, or by full Regions. Recommission (§27A.5) trades it in once per game, and every later draw skips landmark Charges. Banner, deed and Menace Charges stay possible on a full board.
- *Skip a turn?* No. Keeping a Charge after a reveal happens inside the End Turn, before the next player's turn begins.
- *Loops?* No. Each reveal draws at most once, and a player reveals at most 2 or 3 Charges per game (§27A.4); Recommission is once per game.
- *Negative resources?* No. Recommission's Essence is checked like any payment.
- *Punish one seat?* Seats choose in turn order, each from 2 Charges of their own, drawn without replacement. §129.9 measures the seat win rates with the option.

---

# 112. No-Legal-Banner Case

A Banner is allowed to remain unassigned.

Therefore a player can never be stuck during Banner Assignment.

Unassigned Banner:

- produces nothing;
- remains available for future reassignment.

---

# 113. Region Capacity Edge Cases

If a card moves a Banner and no legal target exists:

- the card cannot target that Banner.

If an effect reduces capacity in future expansions:

- existing excess Banners must be resolved explicitly by that effect.

Base game never dynamically changes capacity.

---

# 114. Stronghold Banner Identity

When upgrading a Manor:

- existing Banner remains;
- create a second Banner with stable new ID.

When loading old saves, Banner IDs must remain stable.

An effect that downgrades a Stronghold must specify which Banner is removed. In the base game Dragon's Landing (§19.15) and Siege Engines (§19.23) do, by the same rule. The reduced Manor keeps one Banner: it loses a Banner that is at home (unassigned) over one in a Region, and the newer Banner, the one the upgrade created, when both are at home or both are in Regions. The kept Banner stays where it is, with its `settled` value.

---

# 115. Resource Payment

For fixed costs, engine spends exact resources.

For variable costs such as Goblin Tinkers, command must specify payment.

Example:

```ts
interface BuildManorCommand {
  type: "build_manor";
  siteId: SiteId;
  extraPayment?: ResourceType[];
}
```

Validator confirms the selected payment satisfies modifiers.

---

# 116. Quest Claim Timing

Default:

- manual claim during Main Action.

Reason:

Players should see when they satisfy a Quest and explicitly commit before another player claims it.

UI should highlight claimable Quests.

---

# 117. Card Draw Rules

Buying a card:

1. verify cost;
2. spend cost;
3. draw top card;
4. add to hand;
5. advance deck.

If deck is empty:

- shuffle discard pile using deterministic RNG;
- create new deck;
- continue.

If both empty:
- action illegal.

A reshuffle takes only the discard pile. Charters in front of players (§18.1) and a Ragnarök still set aside (§19.13) are not in it and stay where they are. A Royal Insurance Policy goes to the discard pile when it is used, and a cancelled or discarded Ragnarök goes there too, so both can come back in a later reshuffle. If the omen comes while the draw pile is empty, Ragnarök becomes its only card.

---

# 118. Menace Selection at Setup

For prototype:

- fixed Menaces by player count.

MVP (any player count):
- Toll Troll.

2-player:
- Toll Troll;
- Highwayman. Blocking Routes tightens expansion, which addresses the "excessive openness" concern in §9.

3-player:
- Toll Troll;
- Young Dragon.

4-player:
- Toll Troll;
- Young Dragon;
- Bog Witch.

Goblin Tinkers is not in any fixed set. It enters play through the random selection below.

Later:

- randomly select from the compatible pool (all 5 Menaces).

---

# 119. Menace Starting Positions

Map definition should provide candidate starts.

Example:

```ts
menaceStarts: [
  { menaceType: "toll_troll", regionId: "region_07" },
  { menaceType: "young_dragon", regionId: "region_12" }
]
```

Menaces must not start in a way that completely invalidates initial setup.

---

# 120. First Playtest Questions

Collect both telemetry and qualitative feedback.

Ask:

1. Did you understand what you would harvest next turn?
2. Did Banner placement feel like a meaningful decision?
3. Were resource slots too restrictive or too open?
4. Did Strongholds feel valuable?
5. Did the Market reduce frustration enough?
6. Did Menaces create interesting choices or only annoyance?
7. Did players target one opponent too heavily?
8. Were Quests worth pursuing?
9. Did cards overshadow the board?
10. Did the game feel too similar to any existing title?
11. Was the fantasy theme coherent with the mechanics?
12. Was the Renown target too short or too long?
13. Did any Region feel "owned forever"? Did the Royal Writ feel like fair jockeying, or like harassment?
14. When your Banner was displaced, did the bribe feel like fair compensation?
15. Did Trading Posts affect where you chose to build?
16. Did Ragnarök feel like a fair clock on the endgame, or like a cheap finish?
17. When Dragon's Landing or Fire Bolt hit you, could you recover, or did it feel like losing progress for good?

---

# 121. Balance Variables

Centralize tunable values.

Example:

```ts
export const BALANCE = {
  targetRenown: { standard: 20, standardFourPlayers: 18, mvp: 10 },
  targetRenownChoices: [15, 20, 25, 30],

  costs: {
    route: { timber: 1, stone: 1 },
    manor: { grain: 1, timber: 1, stone: 1 },
    stronghold: { grain: 2, iron: 2 },
    card: { grain: 1, iron: 1, essence: 1 },
    royalWrit: { toSupply: { essence: 1 }, bribeToOwner: 1 }, // bribe: any 1 resource
    warden: { essence: 1, grain: 1 }
  },

  market: {
    give: 3,
    receive: 1,
    maxTradesPerTurn: 2 // Market + Trading Posts combined
  },

  tradePostGive: 2,

  writ: { maxPerTurn: 1, requireSettled: true },
  warden: { maxPerTurn: 1 },

  handLimit: 7,
  maxNonReactionCardsPerTurn: 1,

  ragnarok: { omenGap: 3 },           // §19.13
  dragonsLanding: { minHoldings: 3 }, // §19.15
  treasureHunter: { take: 3 },        // §19.21
  underdogGap: 2,                     // The Unreliable Bard, §19.20
  renownSwing: 1,                     // Disgrace, Stolen Glory, §19.22, §19.25
  raid: { minHoldings: 3 },           // Raiders, Siege Fireball, §19.24, §19.26
  sabotage: { grain: 2 },             // §19.27
  sealedCharges: { renown: 2, drawn: 2, recommission: { essence: 1 }, perGame: [{ fromGoal: 25, charges: 2 }, { fromGoal: 30, charges: 3 }] } // §27A
} as const;
```

Avoid scattering numbers through code.

---

# 122. Naming and Branding Decision

The project name is:

# **Manors & Menaces**

Use this exact capitalization.

Short internal slug:

```text
manors-menaces
```

Package namespace examples:

```text
@manors-menaces/rules
@manors-menaces/content
@manors-menaces/protocol
```

The title is considered sufficiently available for development use based on preliminary research, but final commercial trademark clearance should still be performed before launch.

---

# 123. Logo Direction

Potential mark:

- ornate but readable serif wordmark;
- small manor silhouette;
- banner motif;
- a troll/dragon shape subtly intruding from one side.

Avoid overly grim fantasy styling.

The title should feel like:

- strategy;
- medieval fantasy;
- mischief.

---

# 124. Tagline Candidates

Primary:

> Build wisely. Trouble wanders.

Alternatives:

> Raise your banners. Mind the Menaces.

> Plan the harvest. Redirect the trouble.

> A realm of careful plans and inconvenient monsters.

---

# 125. IP-Distance Principles

The game should deliberately distinguish itself through:

- original title;
- original visual map style;
- irregular geography;
- Banner production assignment;
- multiple Menaces;
- Royal Quests;
- fantasy card system;
- distinct resource set;
- different build costs;
- different scoring;
- no production dice;
- no single generic robber;
- no fixed longest-road/largest-army awards;
- original art;
- original terminology;
- original rules text.

The project should not copy another game's:

- wording;
- art;
- iconography;
- UI layout;
- named cards;
- recognizable board arrangement;
- branding.

Some v0.2 balance changes deliberately follow Catan's *structure* (§129.1), for example resources whose scarcity peaks at different phases, and spatial trade discounts. The resulting numbers are close in places: Stronghold 2 Grain + 2 Iron against Catan's city at 2 grain + 3 ore, and card cost Grain + Iron + Essence against Catan's development card at grain + ore + wool. Game mechanics are generally not protected, but keep the costs from matching Catan's exactly, and include them in the legal review.

Legal review should occur before commercial launch.

---

# 126. Definition of Done for the Core Game

The core design is considered validated only if playtesting shows:

1. players understand deterministic production quickly;
2. Banner competition creates meaningful tension;
3. resource denial does not create unrecoverable states;
4. Menaces add tactics rather than frustration;
5. Market trading prevents resource deadlocks;
6. roads and Holdings create meaningful spatial expansion;
7. the default 15 Renown (13 with 4 players) produces acceptable match length, and the other goals (§7) offer shorter and longer games;
8. cards do not dominate strategy;
9. Quests create varied objectives;
10. players want to replay with different Menaces/Quests.

---

# 127. Guiding Development Principle

When evaluating any feature, ask:

> **Does this make planning tomorrow's harvest, expanding the realm, or redirecting trouble more interesting?**

If not, it probably does not belong in the core game.

The deterministic Banner system is the project's central identity.

Everything else should reinforce it.

---

# 128. Immediate Next Step

Implement the local MVP with:

- pure TypeScript rules;
- Svelte UI;
- SVG fixed board;
- Tauri-ready Vite app;
- no PixiJS initially;
- one Menace;
- no online dependency.

Do not begin by building backend infrastructure, procedural generation, a large card library, or advanced visual effects.

The first milestone is a complete, testable, local game loop that proves the Banner production mechanic is fun.

---

# 129. Revision v0.2 — Changes, Inspirations, and Open Questions

## 129.1 Balance changes and where they come from

| Problem in v0.1 | Change | Inspiration |
|---|---|---|
| Persistent, capacity-1 Banners meant a Region, once taken, stayed with that player for the whole game | Royal Writ, a paid displacement that compensates the displaced player (§14.7), with Settled protection (§14.6) | *Kolonists*' Bribe: occupation gives exclusive access, not permanent ownership |
| No way to move a Menace without cards, so the MVP Troll could never move | Hire a Warden (§26.1) | Catan's robber moves on a regular trigger (a rolled 7 or a knight). This spec has no dice, so the trigger is a paid action instead |
| Essence had no use in the MVP | Essence pays for the Writ and the Warden; it is the resource for interfering with other players | Catan's wool: a resource with narrow but real demand |
| Stone appeared in every build cost and was a bottleneck all game | Stronghold now costs 2 Grain + 2 Iron (§12.2) | Catan separates brick (expansion) from ore (upgrades), so the scarce resource shifts during a game |
| Trading could not ease a bottleneck; the only option was a flat 3:1 Market | 2:1 Trading Posts on Stone and Iron (§17.3) | Catan's harbors |
| A 24-Site map fits about 10–11 Holdings, too few to reach the Renown target from buildings | 36 Sites, about 52 Routes, 24 Regions, and a sizing check (§11.1, §102) | Catan's board-to-player ratio (54 intersections for 3–4 players) |
| The MVP target of 12 Renown could not be reached without Quests | MVP target 10 (§7.1) | Catan and Kolonists both target 10, with 2–4 points in Catan coming from sources other than buildings |
| The first player also chose initial Banners first | Initial Banners assigned in reverse turn order (§28.4) | Catan's snake setup |
| Players kept moving Menaces back and forth with Wardens (simulation) | A Warden guards its Menace until the hirer's next turn (§26.1) | Catan's robber stays put until the next 7 or knight |

## 129.2 Open design question: displacement protection

The Royal Writ must stop Regions from being held forever without turning Banner placement into constant harassment. The default is **Settled protection plus a bribe to the displaced player** (§14.7). Variants to playtest, all configurable through `RulesetConfig.writ`:

| Variant | Rule | Expected feel | Risk |
|---|---|---|---|
| **A — default** | Settled only; 1 Essence to supply + 1 resource to the defender | Claims are guaranteed one Harvest; displacing someone costs a net 2 | May be too cheap for rich Regions |
| B — no protection | Any Banner, same cost | Fastest jockeying for position | Writ wars; a newly claimed Region can be taken before it produces anything |
| C — no bribe | Settled only; 2 resources to the supply | Harsher; the defender gets nothing | Feels punitive, and against the "reversible disruption" pillar (§2.3) |
| D — scaled cost | Cost +1 for each consecutive Harvest the occupant has had there | Long holds get cheaper to defend over time, which creates a sense of tenure | More to explain; the Harvest preview must show the Writ price |
| E — defender response | Defender may pay the same cost to cancel the Writ (a reaction window) | A direct bidding contest | Needs reaction windows, so it does not work in async play (§109) |

Warden variants, configurable through `RulesetConfig.warden`:

| Variant | Rule | Notes |
|---|---|---|
| **Guard (default)** | The hirer's Warden guards the Menace until the hirer's next turn | Stops back-and-forth moves |
| No guard | Any player may move it again at once | Simulations showed back-and-forth moves in 3–4 player games |
| Costlier | 1 Essence + 1 Grain + 1 Iron | An alternative lever if the guard feels fiddly |

Recommendation: ship **A** in the MVP, and log the telemetry in §67 and the balance targets in §68. If Regions still stay with one player for too long, try B. If players complain about harassment, try D. Do not use E until reaction windows exist.

## 129.3 Contradictions resolved in v0.2

- Market limit: "once per turn" and "maximum 2" disagreed; the limit is 2 (§17.2).
- Toll Troll "non-landmark Region": landmarks are Sites, so this now reads "any Region not occupied by another Menace" (§21.4). `Landmark` was removed from `MenaceLocation` (§20).
- First-Harvest skip: three competing mechanisms were replaced by one flag, `firstHarvestSkipped` (§29).
- `manorIds` renamed `holdingIds`. Stored `renown` replaced by `bonusRenown` plus a derived `getRenown()` (§33.1).
- Setup order: steps 8–11 in §28.1 contradicted §28.2's "Route immediately after each Manor"; they are merged.
- §16.4 "automatic Quest claims" contradicted §116's manual claims; all claims are now manual.
- Quests: added a refill rule, and defined "connect", "reach", "graph distance" and "Holdings" (§27). Master Builder and Grand Tour are reworded.
- Commands: added setup, discard, reaction, Writ and Warden commands. `expectedRevision` moved from each command to the submission batch (§34, §104).
- Undo against server-authoritative play: resolved with a client draft buffer and atomic batches (§32.1).
- Revision: `GameState.version` became `revision`, and the `VersionedMatchState` wrapper was removed (§60).
- Menace sets: added a 2-player set; the Phase 2 count now matches the 5 defined Menaces; Goblin Tinkers added to Milestone 5 (§93, §96, §118).
- Content definitions use localization keys, not display text (§39–41, §71).
- RNG: `nextFloat` is defined, and rules outcomes are integer-only (§65).
- Route placement condition 3 was vague; it is replaced by the Network Site definition (§13.2).

## 129.4 Simulation findings (v0.2 implementation)

`pnpm simulate` plays AI-vs-AI games on the Greenvale map (normal AI). The AI was improved during this work (it had treated buying cards as a standing goal and hoarded Iron/Essence), which alone moved 3-player standard games from ~17.5 to ~15.5 turns. Current results:

| Mode | Games | Turns per player (avg) | Seat win rates | Notes |
|---|---:|---:|---|---|
| MVP, 3 players | 80 | 14.6 | 41 / 26 / 33 % | on target |
| Standard, 3 players | 80 | 15.5 | 65 / 25 / 10 % | length on target; first-seat bias (below) |
| Standard, 3 players, no cards | 60 | 15.5 | 50 / 30 / 20 % | |
| Standard, 4 players, target 12 | 40 | 21.1 | 25 / 5 / 33 / 38 % | too long |
| Standard, 4 players, target 10 | 40 | 17.6 | 30 / 13 / 28 / 30 % | **adopted as the 4-player default** |

Findings and open questions for human playtests:

1. **4-player length (historical).** This simulation originally set the target to 10 Renown with 4 players. The September 2026 playtest change superseded it with 15 for 2–3 players and 13 for 4 players, and the goal is now chosen when a game is created (§7, §129.6). 17.6 turns is still above the 12–16 target; revealing 4 Quests did not help.
2. **First-seat advantage with cards, 3 players.** Seat 1 wins ~60–65% of AI games when the card deck is in play, versus ~41–50% without cards. No single card causes it: excluding any one card leaves 57–63%. Neither aiming interference at the leader nor a starting bonus for later seats (`seatBonus`, up to 4 resources) closes the gap (best: 59%). `equalTurns` has no effect. Suspected cause: cards reward tempo, and the first seat reaches spare resources first. Test with people before changing rules. Candidate levers: card cost +1 Essence, one card per player per round (not per turn), or deal each later seat one starting card.
3. **Harvest per turn** is ~2.4 early and ~4.5 later, still slightly below the §68 targets (3–5 mid-game, 4–7 late).
4. **Hereditary Regions** remain common in AI play. The AI uses the Royal Writ cautiously (3–5 per game in 3-player games). If humans also leave Regions uncontested, try Writ variant B (§129.2).

## 129.5 The third wave: offensive cards (ruleset 0.7.0)

Playtesters asked for more offensive cards, "like a card that destroys another player's win point". Six Spells answer it (§19.22–19.27); two are players' own designs (Siege Fireball and Sabotage).

| Change | Why |
|---|---|
| Disgrace ×2, Siege Engines ×2, Raiders ×2, Stolen Glory ×1, Siege Fireball ×1, Sabotage ×2 | Ways to take a rival's Renown or Grain, aimed and visible, unlike Dragon's Landing's random strike |
| A fourth Counterspell (4 of 51 cards) | Keeps Counterspell's share of the deck as ten hostile Spells arrive (§19.2) |
| The Royal Insurance Policy covers every card that costs Renown | One consistent rule instead of a growing list; Sabotage, like Robin of the Glade, stays uncovered (§19.19) |
| `lostRenown` beside `bonusRenown`; Renown never below 0 (§8) | A lasting loss must survive later building, and never become a hidden debt |
| Raiders and Siege Fireball need a victim with 3+ Holdings | Dragon's Landing's floor: no player is eliminated (§3, §111.2) |
| Raiders protects the razed Site's neighbours for its owner | Otherwise the raider can build at the far end of the Route that made the raid possible and block the rebuild for good |
| Siege Fireball's ruin is permanent | The designer's request; the only permanent board change, contained in §111.2 |

`pnpm simulate --games 40` (normal AI, The Greenvale), before and after. Turns are turns per player; seats are win rates in turn order.

| Players, target | Turns before → after | Seats before | Seats after | Card plays per game before → after |
|---|---:|---|---|---:|
| 2, 15 | 12.8 → 13.7 | 60 / 40 % | 53 / 48 % | 9.6 → 9.6 |
| 3, 15 | 14.4 → 14.6 | 38 / 20 / 43 % | 38 / 18 / 45 % | 16.1 → 15.5 |
| 4, 13 | 14.4 → 15.8 (39 → 40 of 40 finished) | 30 / 28 / 28 / 13 % | 38 / 23 / 25 / 15 % | 24.4 → 22.8 |
| 2, 20 | 16.3 → 17.4 | 63 / 38 % | 58 / 43 % | 12.3 → 12.2 |
| 3, 20 | 20.9 → 22.6 (28 → 26 of 40 finished) | 25 / 13 / 33 % | 15 / 8 / 43 % | 45.5 → 44.9 |
| 4, 20 | 20.8 → 24.8 (5 → 6 of 40 finished) | 3 / 8 / 3 / 0 % | 8 / 5 / 3 / 0 % | 99.9 → 85.8 |

The third wave's plays in the 40 games at the default target, and what they did per game:

| Players | Disgrace | Siege Engines | Raiders | Stolen Glory | Siege Fireball | Sabotage | Per game |
|---|---:|---:|---:|---:|---:|---:|---|
| 2 | 21 (1 countered) | 0 | 2 | 8 (4) | 5 (3) | 21 (2) | Renown lost 0.50, stolen 0.10, Manors raided 0.05, Sites ruined 0.03, Grain burned 0.70 |
| 3 | 25 (5) | 2 | 5 (2) | 11 (3) | 3 (1) | 29 (7) | Renown lost 0.47, stolen 0.20, Strongholds besieged 0.05, Manors raided 0.07, Sites ruined 0.05, Grain burned 0.93 |
| 4 | 32 (2) | 7 (4) | 7 (1) | 20 (1) | 16 (1) | 48 (7) | Renown lost 0.70, stolen 0.47, Strongholds besieged 0.07, Manors raided 0.15, Sites ruined 0.38, Grain burned 1.82 |

Findings:

1. **Length** stays inside the §68 target of 12–16 turns at the default targets, 4-player games at its top (15.8). The cards add about a turn in 2- and 4-player games.
2. **Seat balance** moves within the noise of 40 games (about ±8 points per seat): the 2-player first seat falls from 60 to 53 %, the 4-player first seat rises from 30 to 38 %, above the 30 % target. Worth rechecking with more games before tuning.
3. **The siege cards are rare in AI play.** Siege Engines and Raiders need one of the caster's Routes to reach a rival's Holding, and AI networks seldom do; Siege Fireball needs a leader with 3 or more Holdings. Disgrace, Stolen Glory and Sabotage are played most. Human players can build toward a rival on purpose, so playtests should show whether the siege cards come up more often in their hands.
4. **A 20 Renown target** (§129.6) is too long for the AI on The Greenvale with or without these cards: 12 to 14 of 40 three-player games and 34 to 35 of 40 four-player games stall at the 60-round cap, and those that finish run 20 to 25 turns. The full-board end rule (§7) now ends those games; §129.6 has the runs with it.

## 129.6 Renown goal chosen at game creation (September 2026)

Players found 15 Renown too short. The goal is now picked when a game is created (§7): 15, 20, 25 or 30 Renown, or the rules' default, which rises to 20 (18 with 4 players) in the Standard and async rules. The Core rules keep 10 and offer it as a choice too. New Game and the online lobby offer the choice and remember the last goal picked. The server accepts only the goals the rules offer and stores the goal in the match's ruleset. Every game keeps the goal it was created with, and Ragnarök's omen follows it (§19.13).

`pnpm simulate --games 40 --players N --rules standard --target T` (normal AI, The Greenvale as published, stopped at round 60). Seat win rates are shares of all 40 games, so unfinished games lower them.

| Players | Goal | Finished | Rounds, finished games (avg, range) | Winner Renown | Seat win rates |
|---:|---:|---:|---|---:|---|
| 2 | 15 | 40/40 | 12.8 (9–18) | 15.7 | 60 / 40 % |
| 2 | 20 | 40/40 | 16.3 (12–20) | 20.4 | 63 / 38 % |
| 3 | 15 | 40/40 | 14.4 (12–21) | 15.4 | 38 / 20 / 43 % |
| 3 | 20 | 28/40 | 20.9 (14–46) | 19.9 | 25 / 13 / 33 % |
| 4 | 13 | 39/40 | 14.4 (11–18) | 13.4 | 30 / 28 / 28 / 13 % |
| 4 | 15 | 35/40 | 16.8 (12–25) | 14.9 | 28 / 23 / 20 / 18 % |
| 4 | 18 | 14/40 | 18.0 (13–27) | 17.6 | 10 / 13 / 5 / 8 % |
| 4 | 20 | 5/40 | 20.8 (15–24) | 19.0 | 3 / 8 / 3 / 0 % |

Findings and open questions:

1. **Two players** reach 20 Renown in 16.3 rounds, at the top of the §68 range of 12–16 turns per player.
2. **Three and four players often run out of board.** In the stalled games checked (3 players, goal 20), every Holding is a Stronghold, no free Site is far enough from the others to build on, one or two Quests are left, and the leaders are 1 to 3 Renown short. Only Ragnarök can end such a game. The drawn islands new games use behave the same: 13 of 20 three-player games at 20 finished (`--map drawn`). The Renown budget of §7.1 does not reach 20 with 3 players or 18 with 4 on these boards. The full-board end rule (§7) answers this: a round that ends on a full board ends the game, and the most Renown wins. Goals 25 and 30 were not simulated.

The same runs with the full-board end rule and the third-wave cards (§129.5), ruleset 0.7.0:

| Players | Goal | Finished | Ended on a full board | Rounds (avg, range) | Winner Renown | Seat win rates |
|---:|---:|---:|---|---|---:|---|
| 2 | 20 | 40/40 | 0 | 17.4 (15–21) | 20.5 | 58 / 43 % |
| 3 | 20 | 40/40 | 18 (avg round 21.8) | 20.0 (15–31) | 18.9 | 33 / 15 / 53 % |
| 4 | 18 | 40/40 | 29 (avg round 23.8) | 22.4 (15–37) | 15.6 | 33 / 20 / 28 / 20 % |

Every game finishes. At the default goals games still run past the §68 target of 12–16 turns per player, most with 4 players, and nearly half of the three-player games and most four-player games end on a full board rather than at the goal. The third seat won 53 % of three-player games, above the 45 % target; with about ±8 points of noise in 40 games, that needs a larger run before any tuning.

**The default returns to 15 (September 2026).** Players found 20 out of reach. With 3 or 4 players the board usually fills first, and the leader then has about 19 Renown with 3 players and about 15 with 4, as the tables above show. The Standard and async default is 15 again, or 13 with 4 players. 20, 25 and 30 stay on offer; 18 is no longer offered with 4 players. Saved games and running matches keep the goal they were created with.

## 129.7 The last round (ruleset 0.8.0, September 2026)

A few games ran on long after the board had stopped changing. Every game now ends after round 30 at the latest, and the most Renown wins (§7). One number serves every goal, player count and ruleset: the round the board fills in hardly depends on the goal, and the Core rules' goal does not depend on the player count.

Normal AI with the full-board rule, on drawn islands unless marked G (The Greenvale):

| Setup | Games | End round p50 / p90 / max | Ended on a full board | Games past round 30 |
|---|---:|---|---:|---:|
| Goals 15 and 13, 2 to 4 players (drawn and G) | 230 | 13–17 / 17–24 / 35 | 24 (16 of them 4 players at goal 15) | 1 |
| 2 players, goal 30 | 30 | 22.5 / 28 / 33 | 26 | 1 |
| 3 players, goal 25 | 30 | 20 / 24 / 37 | 29 | 1 |
| 4 players, goal 25 | 30 | 21.5 / 30 / 36 | 30 | 3 |
| 3 players, goal 30, G | 40 | 23.5 / 32 / 45 | 40 | 6 |
| 4 players, goal 18, G | 40 | 20 / 30 / 37 | 29 | 4 |

Games past round 30 were mostly waiting. The 16 in the table were checked, and one more: a four-player game at goal 18 on a drawn island (Mistholm), which ended in round 34. In 16 of these 17, no Site was left by rounds 10 to 23, and a Manor nobody had upgraded kept the board from counting as full for another 9 to 24 rounds. The leader after round 30 went on to win 16 of the 17; the other is a four-player game at goal 13 that never counted as full and ended in round 35. A later limit for four players (32) would have spared 4 of 70 four-player games at the higher goals, none with a different winner.

The hint under "Renown to win" on New Game and in the online lobby follows these runs: the board usually fills first, and then the most Renown wins, at goal 30 with 2 players and from 20 with 3 or 4. Four players at goal 15 fill it first in about half of games, so that goal gets no such hint. Games that ended on a full board, on drawn islands with the normal AI; where a cell has two figures, the second is a later check on ruleset 0.8.0 (`pnpm simulate --map drawn --rules standard`):

| Players | Goal 15 (13 with 4) | Goal 20 | Goal 25 | Goal 30 |
|---:|---|---|---|---|
| 2 | 0 of 40 | 0 of 20 | 5 of 30; 1 of 20 | 26 of 30; 17 of 20 |
| 3 | 2 of 40 | 20 of 30 | 29 of 30; 12 of 12 | 30 of 30 |
| 4 | 5 of 40 at 13, 16 of 30 at 15 | 19 of 20; 11 of 12 | 30 of 30 | 6 of 6 |

The Core rules were not simulated, so their hint gives only the last round.

## 129.8 The Crown's Levy and The Dowager (ruleset 0.9.0)

The Crown's Levy (§27.3) and The Dowager (§19.28) answer the same finding: with 3 or 4 players the board fills before anyone reaches a goal of 20 or more (§129.6). The runs below were measured on their own branch, before the last round (§129.7), Sealed Charges and the Crown's Voice, and before the Levy stopped repeating a resource across cycles, which changes later Levies only.

`pnpm simulate --games 30 --players N --target T --map drawn` (normal AI; every game finished). "Levy" is the Levy alone, "both" adds The Dowager. Levy Renown is per player, with the share of the chances to answer that were taken.

| Players, goal | Rules | Ended on a full board | Rounds (avg, range) | Winner Renown | Levy Renown per player (answered) | Seat win rates |
|---|---|---:|---|---:|---|---|
| 3, 15 | before | 1 | 14.4 (12–20) | 14.9 | | 40 / 33 / 27 % |
| 3, 15 | Levy | 1 | 14.3 (12–17) | 14.9 | 0.01 (2 %) | 40 / 30 / 30 % |
| 3, 15 | both | 0 | 13.7 (11–17) | 15.5 | 0.00 (0 %) | 53 / 10 / 37 % |
| 3, 20 | before | 20 | 18.8 (14–28) | 18.0 | | 33 / 43 / 23 % |
| 3, 20 | Levy | 16 | 19.6 (14–24) | 18.5 | 0.64 (13 %) | 37 / 33 / 30 % |
| 3, 20 | both | 15 | 19.0 (14–27) | 18.9 | 0.29 (7 %) | 50 / 20 / 30 % |
| 3, 25 | before | 29 | 20.2 (14–37) | 18.5 | | 40 / 37 / 23 % |
| 3, 25 | Levy | 26 | 20.5 (15–26) | 20.3 | 1.82 (15 %) | 37 / 30 / 33 % |
| 3, 25 | both | 23 | 20.4 (15–29) | 21.3 | 1.38 (12 %) | 50 / 13 / 37 % |
| 3, 30 | before | 30 | 20.1 (14–28) | 18.4 | | 50 / 37 / 13 % |
| 3, 30 | Levy | 27 | 21.2 (14–31) | 21.2 | 2.07 (15 %) | 43 / 30 / 27 % |
| 3, 30 | both | 27 | 20.8 (15–27) | 21.5 | 1.44 (11 %) | 50 / 17 / 33 % |
| 4, 13 | before | 4 | 16.5 (13–35) | 13.3 | | 17 / 23 / 43 / 17 % |
| 4, 13 | Levy | 3 | 16.6 (13–26) | 13.1 | 0.16 (7 %) | 27 / 20 / 33 / 20 % |
| 4, 13 | both | 0 | 14.6 (8–23) | 13.4 | 0.06 (6 %) | 30 / 20 / 20 / 30 % |
| 4, 25 | before | 30 | 23.0 (15–36) | 14.7 | | 30 / 27 / 27 / 17 % |
| 4, 25 | Levy | 28 | 21.0 (15–32) | 15.8 | 1.22 (10 %) | 33 / 23 / 30 / 13 % |
| 4, 25 | both | 24 | 22.8 (15–40) | 18.1 | 1.72 (10 %) | 47 / 13 / 33 / 7 % |

Findings and open questions:

1. **The Levy starts late**, as intended: it was proclaimed in 12 to 30 of the 30 games per row, the first Levy for round 15.2 to 15.7 on average.
2. **At goals 25 and 30 the winner gets closer to the goal**: with 3 players at goal 25 from 18.5 to 21.3 Renown with both, and with 4 players from 14.7 to 18.1, while full-board endings fall from 29 to 23 and from 30 to 24 of 30.
3. **The AI answers only 6 to 15 % of its chances**, since it never answers while an upgrade waits. Its saving weights are worth tuning.
4. **The Dowager is played 0.5 to 1.33 times a game**, and nearly every Dower House still stands at the end. The 8-round game at 4 players and goal 13 was won with 6 Quest Renown after a round-3 Dowager; no rule was at fault.
5. **The first seat wins more often with The Dowager.** Over 180 three-player games at goal 25 the seats won 33 / 41 / 26 % before and 47 / 30 / 23 % with both; the Levy alone showed no shift (32 / 33 / 34 % over 90 games at goal 20). That is about 2.7 standard errors, and the two decks deal differently, so the games are not paired. Dowager plays and Levy answers are even across seats. It needs 500 or more games per arm before a release, and a comparison of when each seat first plays her.

## 129.9 Sealed Charges (ruleset 0.9.0)

Sealed Charges (§27A) came from a study of hidden personal goals in other games: Ticket to Ride, Lords of Waterdeep, Twilight Imperium 4, Clash of Cultures, Risk's Secret Missions, Wingspan and Catan. Twilight Imperium's secret objectives, revealed and scored the moment they are met, keep the goal hidden but the score public, which §83 and the End Turn victory check (§7) need. Goals kept secret until the end (Lords of Waterdeep) were rejected: Renown would become hidden and the game would need a "reveal to win" rule. Risk removes missions that name a colour not in play, and the Charge deck removes Charges naming a Menace not in play. Wingspan's keep 1 of 2 gives a choice without slowing setup.

`pnpm simulate --games 30 --players N --target T --map drawn`, without and with `--override '{"sealedCharges":true}'` (normal AI, stopped at round 60; every game finished). Winner Renown lists the part from Charges in brackets. Charges met per player is out of 1 below goal 25 and out of 2 at 25.

| Players | Goal | Charges | Ended on a full board | Rounds (avg, range) | Winner Renown | Charges met per player | Seat win rates |
|---:|---:|---|---:|---|---|---:|---|
| 3 | 15 | off | 1 | 14.4 (12–20) | 14.9 | | 40 / 33 / 27 % |
| 3 | 15 | on | 0 | 13.9 (10–18) | 15.8 (1.6) | 0.74 | 27 / 33 / 40 % |
| 3 | 25 | off | 29 | 20.2 (14–37) | 18.5 | | 40 / 37 / 23 % |
| 3 | 25 | on | 20 | 20.8 (15–27) | 22.2 (3.3) | 1.51 | 40 / 37 / 23 % |
| 4 | 13 | off | 4 | 16.5 (13–35) | 13.3 | | 17 / 23 / 43 / 17 % |
| 4 | 13 | on | 1 | 14.2 (11–21) | 13.4 (1.3) | 0.64 | 17 / 40 / 23 / 20 % |

Charges met of those kept, by kind (Recommission's new draws count as kept): landmark 18/31, Banners 5/13, deeds 15/24, Menaces 29/32 with 3 players at goal 15; 17/31, 48/92, 27/35 and 44/47 at goal 25; 21/45, 5/22, 12/26 and 39/51 with 4 players. The AI Recommissioned 0.33, 1.30 and 0.80 times per game.

Findings and open questions:

1. **Players meet 64 to 76 % of the Charges they can hold**, within the 60 to 80 % the design aimed for.
2. **At goal 25 the Charges let games reach the goal.** Without them, 29 of 30 three-player games ended on a full board, the winner at 18.5 Renown; with them, 10 of 30 reached 25, and the winner averaged 22.2. Charges are not enough on their own: 20 games still ended on a full board. Goal 30 was not simulated.
3. **At the default goals, games get shorter**: 14.4 to 13.9 rounds with 3 players and 16.5 to 14.2 with 4, since each met Charge is worth about one and a half rounds of building.
4. **Menace Charges are the easiest for the AI** (76 to 94 % met) and Banner Charges the hardest (23 to 52 %). Three moves of the named Menace, or 2 Grain Regions instead of 3, would even them out; both need a human playtest first, since the AI's play is not a person's.
5. **Seat win rates move within the noise** of 30 games (about ±9 points). The second seat's 40 % with 4 players is above the 30 % target, as the third seat's 43 % is without Charges; a larger run should come before any seat tuning (§129.4).
