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

The standard game ends when a player reaches **12 Renown** and completes their current turn.

The MVP ruleset (no cards, no Quests) uses a target of **10 Renown**, because Holdings are its only Renown source (see §7.1).

The target is `RulesetConfig.targetRenown`.

The winning condition is checked during the End Turn phase of the active player's turn, after all other end-of-turn effects.

In the base game only the active player can gain Renown, because building and Quest claims happen only in their own Main Action phase. The check therefore looks at the active player first. If any player is at or above the target when the check runs, the game ends. If more than one player is at or above the target (possible only through future effects), use the following tie-break order:

1. highest Renown;
2. most completed Royal Quests;
3. most Strongholds;
4. most total resources;
5. player earlier in current turn order.

Simultaneous wins should be rare.

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
| Rare card/story reward | 1 |
| Major landmark objective | 1–2 |

A Manor upgraded to a Stronghold increases the player's Renown by **+1**, because the site moves from 1 total Renown to 2 total Renown.

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
- cannot be upgraded further in the base game.

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
- Use landmark ability (not in base game; see §80);
- Activate hero ability.

Main Actions may be performed in any order.

## 16.3 Phase 3 — Banner Assignment

The player may reposition all eligible Banners.

No resource cost.

The UI must preview next Harvest.

The player explicitly confirms assignments.

## 16.4 Phase 4 — End Turn

Resolve, in order:

1. end-of-turn effects;
2. discard down to the hand limit (§18.3), using a `discard_cards` command if the player is over it;
3. reveal replacement Quests for any claimed this turn (§27);
4. expiration of temporary effects;
5. reset per-turn counters (Market trades, cards played, Writs, Warden hires);
6. victory check (§7).

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

### Story

One-off narrative effect, often symmetrical or unusual.

## 18.2 Card acquisition

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

Implement at least the following 24-card prototype deck.

Recommended copies are shown.

## 19.1 Wizard's Interference ×3

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Move one opponent Banner to another Region that is adjacent to its origin Holding and has free capacity. The moved Banner becomes unsettled.  
**Restrictions:** Must respect Region capacity and the Stronghold restriction (§14.4). Ignores Settled protection.

## 19.2 Counterspell ×2

**Type:** Spell / Reaction  
**Timing:** When another Spell is played  
**Effect:** Cancel that Spell before its effect resolves.

## 19.3 Knight Errant ×3

**Type:** Hero  
**Timing:** Main Action  
**Effect:** Move one Menace to any legal destination.

## 19.4 Druid's Blessing ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Choose one of your Banners. During your next Harvest, if it produces Grain or Timber, gain +1 additional matching resource.

## 19.5 Teleportation Mishap ×2

**Type:** Spell  
**Timing:** Main Action  
**Effect:** Swap the positions of two Menaces if both resulting placements are legal.

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
**Effect:** Choose one Route. Until the start of your next turn, that Route cannot be used for network connectivity. It remains owned.

## 19.11 Dragon Whisperer ×2

**Type:** Hero  
**Timing:** Main Action  
**Requirement:** Young Dragon is active.  
**Effect:** Move the Young Dragon. If its Hoard is non-empty, take one resource from the Hoard.

Total: 24 cards.

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
- at the End Turn phase, each claimed Quest is replaced by the top card of the Quest deck, so 3 unclaimed Quests stay available until the deck runs out.

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

Play 3 Hero cards.

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

---

# 28. Setup

## 28.1 Standard setup

1. Load board.
2. Randomly determine first player.
3. Select active Menaces according to player count.
4. Place Menaces at their configured starting locations.
5. Shuffle card deck using match RNG.
6. Shuffle Quest deck using match RNG.
7. Reveal 3 Quests.
8. Players place initial Holdings in snake order. Each Manor is followed immediately by one free Route and, for a player's second Manor, their starting resources (§28.2–28.3).
9. Players assign initial Banners in **reverse** turn order (§28.4).
10. Begin turn 1.

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

  questDeck: QuestId[];
  publicQuests: PublicQuestState[];

  delayedEffects: DelayedEffect[];
  historyMeta: HistoryMeta;
  winnerId?: PlayerId;
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
  // derived by getRenown() from Holdings + claimed Quests + bonusRenown; it is
  // never stored.
  bonusRenown: number;

  holdingIds: HoldingId[]; // Manors and Strongholds
  routeIds: RouteId[];

  claimedQuestIds: QuestId[];

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
  | EndMainPhaseCommand
  // banner assignment
  | AssignBannersCommand
  // end of turn
  | DiscardCardsCommand
  | EndTurnCommand
  // reaction windows (§109), issued by a non-active player
  | ReactCommand
  | PassReactionCommand;
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
9. Reach 12 Renown to win.

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
- card plays;
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

---

# 82. Card Counterplay

Interference should generally have one or more answers:

- alternate Region;
- Royal Writ (retake a contested Region);
- Hire a Warden (move a Menace off your assets);
- Market or Trading Post exchange;
- Counterspell;
- Knight Errant;
- future defensive card;
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
- number of cards in hand.

Private:

- card identities in hand;
- unrevealed deck order.

This keeps strategy readable while preserving card surprise.

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
  targetRenown: number;            // 12 standard, 10 MVP
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

If a future effect downgrades a Stronghold, specify which Banner is removed. Base game has no downgrade effect.

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

---

# 121. Balance Variables

Centralize tunable values.

Example:

```ts
export const BALANCE = {
  targetRenown: { standard: 12, mvp: 10 },

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
  maxNonReactionCardsPerTurn: 1
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
7. 12 Renown produces acceptable match length;
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

`pnpm simulate` plays AI-vs-AI games on the Greenvale map (normal AI). Results for the current build:

| Mode | Turns per player (avg) | Winner Renown source | Writs / game | Wardens / game | Notes |
|---|---:|---|---:|---:|---|
| MVP, 3 players | ~14–16 | all from Holdings | ~4 | ~12 | Within the 12–16 target |
| Standard, 3 players | ~19 | ~9.5 Holdings + ~3.3 Quests | ~6 | ~19 | Above target |
| Standard, 4 players | ~23 | ~9.8 Holdings + ~2.7 Quests | ~22 | ~27 | Above target; first seat wins more often |

The AI is a heuristic player and is weaker than people at planning. These numbers are therefore an upper bound on game length, not a verdict. Levers to try in human playtests if standard games run long:

1. Target 10 Renown for 4 players (`targetRenown`).
2. Start with 1 extra Grain, or add a third starting Banner (a Stronghold-lite starting Manor).
3. Reveal 4 Quests instead of 3 (`revealedQuestCount`).
4. Harvest averages 2–4 per turn, below the §68 targets (3–5 mid, 4–7 late). Consider a rich-Region share above 20%.

