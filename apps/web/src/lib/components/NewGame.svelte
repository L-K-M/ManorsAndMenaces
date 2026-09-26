<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "../i18n.js";
  import type { AiLevel, SeatConfig } from "@manors-menaces/protocol";
  import { BALANCE, mvpRuleset, standardRuleset, type RulesetConfig } from "@manors-menaces/rules";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";
  import { ISLANDS, RIVALS, rivalById } from "@manors-menaces/content";
  import { assignRivals, distinctRivals, freeRival, rivalName, rivalsTakenBy } from "../game/rivals.js";
  import RivalPicker from "./RivalPicker.svelte";
  import RivalPortrait from "./RivalPortrait.svelte";
  import type { BoardChoice, NewGameOptions } from "../game/session.svelte.js";
  import { rememberName, rememberedName } from "../game/playerName.js";

  let { onstart, onback }: { onstart: (opts: NewGameOptions) => void; onback: () => void } = $props();

  const NAMES = ["Alice", "Bertram", "Cordelia", "Dunstan"];
  // Your seat starts with the name you last played under.
  const yourName = rememberedName().slice(0, 20);
  const defaultName = (i: number): string => (i === 0 && yourName) || (NAMES[i] ?? "");
  let count = $state(3);
  let mode: "standard" | "mvp" = $state("standard");
  let seed = $state("");
  /** An island id, or "" for any island. */
  let island = $state("");
  // Quest expiry (§27.2) is part of the Standard rules; unchecking it keeps
  // every Quest on offer until claimed.
  let questExpiry = $state(true);
  const KINDS = NAMES.map((_, i) => (i === 0 ? "human" : "ai") as "human" | "ai");
  // Start the line-up at a random rival so new games meet different faces.
  const initialRivals = assignRivals(KINDS, Math.floor(Math.random() * RIVALS.length));
  let seats = $state(
    NAMES.map((_, i) => {
      const rival = rivalById(initialRivals[i]);
      return { name: rival ? rivalName(rival) : defaultName(i), kind: KINDS[i] ?? "ai", level: "normal" as AiLevel, rivalId: rival?.id };
    }),
  );

  /** Rivals seated at the other AI seats in play; seats left out do not hold theirs. */
  function rivalsOtherThan(i: number): (string | undefined)[] {
    return rivalsTakenBy(seats, i, count);
  }
  // A seat brought back by raising the count may hold a rival picked since.
  $effect(() => {
    const ids = distinctRivals(seats, count);
    untrack(() => ids.forEach((id, i) => id !== seats[i]?.rivalId && setRival(i, id)));
  });
  /** A name nobody typed: blank, the seat's default, or its rival's name. */
  function isAutoName(i: number): boolean {
    const s = seats[i];
    const rival = rivalById(s?.rivalId);
    return !!s && (!s.name.trim() || s.name === defaultName(i) || (!!rival && s.name === rivalName(rival)));
  }
  function setRival(i: number, id: string | undefined) {
    const s = seats[i];
    if (!s) return;
    const auto = isAutoName(i);
    s.rivalId = id;
    const rival = rivalById(id);
    if (auto && rival) s.name = rivalName(rival);
  }
  function kindChanged(i: number) {
    const s = seats[i];
    if (!s) return;
    if (s.kind === "ai") {
      const others = rivalsOtherThan(i);
      setRival(i, s.rivalId && !others.includes(s.rivalId) ? s.rivalId : freeRival(others, i));
    } else if (isAutoName(i)) s.name = defaultName(i) || s.name;
  }

  function start() {
    const you = seats.slice(0, count).findIndex((s) => s.kind === "human");
    if (you >= 0 && !isAutoName(you)) rememberName(seats[you]?.name ?? "");
    const chosen: SeatConfig[] = seats.slice(0, count).map((s, i) => ({
      playerId: `P${i + 1}`,
      displayName: s.name.trim() || `Player ${i + 1}`,
      kind: s.kind,
      ...(s.kind === "ai" ? { aiLevel: s.level, ...(s.rivalId ? { rivalId: s.rivalId } : {}) } : {}),
      color: i,
    }));
    const ruleset: RulesetConfig =
      mode === "mvp" ? mvpRuleset() : { ...standardRuleset(count), questExpiryRounds: questExpiry ? BALANCE.questExpiryRounds : 0 };
    const board: BoardChoice = island ? { kind: "drawn", islandId: island } : { kind: "drawn" };
    onstart({ seats: chosen, ruleset, board, ...(seed.trim() ? { seed: seed.trim() } : {}) });
  }

  // With no human seat the computers play the whole game; say so, but allow it
  // (a watchable demo, and the harness for the all-computer e2e tests).
  const humanCount = $derived(seats.slice(0, count).filter((s) => s.kind === "human").length);
</script>

<section class="panel">
  <h2>{t("ui.new_game")}</h2>
  <form onsubmit={(e) => (e.preventDefault(), start())}>
    <fieldset class="players">
      <legend>{t("ui.players")}</legend>
      <div class="count" role="radiogroup" aria-label={t("ui.number_of_players")}>
        {#each [2, 3, 4] as n}
          <label class:on={count === n}><input type="radio" name="count" value={n} bind:group={count} /> {n}</label>
        {/each}
      </div>
      {#each seats.slice(0, count) as seat, i}
        {@const theme = PLAYER_THEMES[i] ?? PLAYER_THEMES[0]!}
        {@const rival = seat.kind === "ai" ? rivalById(seat.rivalId) : undefined}
        <fieldset class="player-seat" style:--seat-color={theme.color}>
          <legend>
            <span class="seat-heading">
              <span aria-hidden="true">
                {#if rival}<RivalPortrait portrait={rival.portrait} {theme} size={34} />
                {:else}<svg width="34" height="26" viewBox="-17 -13 34 26"><path d={emblemPath(theme.shape, 9)} fill={theme.color} stroke={theme.dark} stroke-width="2" /></svg>{/if}
              </span>
              {t("ui.player_number", { n: i + 1 })}
            </span>
          </legend>
          <div class="seat">
            <input aria-label="Name of player {i + 1}" bind:value={seat.name} maxlength="20" />
            <select aria-label="Player {i + 1} type" bind:value={seat.kind} onchange={() => kindChanged(i)}>
              <option value="human">{t("ui.human")}</option>
              <option value="ai">{t("ui.computer")}</option>
            </select>
            {#if seat.kind === "ai"}
              <select aria-label="Player {i + 1} difficulty" bind:value={seat.level}>
                <option value="easy">{t("ui.easy")}</option>
                <option value="normal">{t("ui.normal")}</option>
                <option value="hard">{t("ui.hard")}</option>
              </select>
            {/if}
          </div>
          {#if seat.kind === "ai"}
            <RivalPicker rivalId={seat.rivalId} taken={rivalsOtherThan(i)} label={t("ui.rival_of_player", { n: i + 1 })} onpick={(id) => setRival(i, id)} />
          {/if}
        </fieldset>
      {/each}
    </fieldset>
    <fieldset>
      <legend>{t("ui.island")}</legend>
      <select aria-label={t("ui.island")} bind:value={island}>
        <option value="">{t("ui.any_island")}</option>
        {#each ISLANDS as i (i.id)}<option value={i.id}>{i.name}</option>{/each}
      </select>
      <p class="hint">{t("ui.island_hint")}</p>
    </fieldset>
    <fieldset>
      <legend>{t("ui.rules")}</legend>
      <label class="rule"><input type="radio" name="mode" value="standard" bind:group={mode} /> <b>{t("ui.standard")}</b> {t("ui.cards_royal_quests_renown", { target: standardRuleset(count).targetRenown })}</label>
      <label class="rule"><input type="radio" name="mode" value="mvp" bind:group={mode} /> <b>{t("ui.core")}</b> {t("ui.banners_building_and_the_toll", { target: mvpRuleset().targetRenown })}</label>
    </fieldset>
    <details>
      <summary>{t("ui.advanced")}</summary>
      <label>{t("ui.seed_for_reproducible_games")} <input bind:value={seed} placeholder={t("ui.random")} /></label>
      {#if mode === "standard"}
        <label class="check"><input type="checkbox" bind:checked={questExpiry} /> {t("ui.quest_expiry_option", { rounds: BALANCE.questExpiryRounds })}</label>
      {/if}
    </details>
    <div class="row">
      <button type="button" onclick={onback}>{t("ui.back")}</button>
      <button type="submit" class="primary" aria-describedby={humanCount === 0 ? "no-humans-note" : undefined}>{t("ui.begin")}</button>
    </div>
    {#if humanCount === 0}<p class="hint" id="no-humans-note">{t("ui.no_human_seats")}</p>{/if}
  </form>
</section>

<style>
  .panel {
    background: var(--paper);
    border: 3px solid #8a7650;
    border-radius: 16px;
    padding: 1.2rem 1.4rem;
    width: min(34rem, 100%);
  }
  h2 {
    margin-top: 0;
    font: 700 1.6rem/1 var(--font-display);
  }
  fieldset {
    border: 1px solid #0002;
    border-radius: 10px;
    margin: 0 0 0.8rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.45rem;
    /* Fieldsets default to min-width: min-content, which pushed the form
       past the edge of small phones. */
    min-width: 0;
  }
  .count {
    display: flex;
    gap: 0.4rem;
  }
  .count label {
    display: grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    border: 2px solid #8a7650;
    border-radius: 8px;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }
  .count label.on {
    background: var(--accent);
    color: #fff;
  }
  .count input {
    position: absolute;
    opacity: 0;
  }
  .players {
    gap: 0.85rem;
  }
  .player-seat {
    margin: 0;
    padding: 0.4rem 0.7rem 0.7rem;
    border: 1px solid var(--edge);
    border-inline-start: 4px solid var(--seat-color);
    background: var(--paper-sheet);
    gap: 0.55rem;
  }
  .player-seat legend {
    color: var(--ink);
    font-size: 0.95rem;
  }
  .seat-heading {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .seat-heading > span {
    display: flex;
  }
  .seat {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .seat input {
    flex: 1 1 9rem;
    min-width: 0;
  }
  .seat select {
    flex: 1 1 6.5rem;
    min-width: 0;
  }
  @media (max-width: 480px) {
    .seat input {
      flex-basis: 100%;
    }
  }
  .rule {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .check {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.5rem;
  }
  .check input {
    min-height: 0;
    width: 1.1rem;
    height: 1.1rem;
    margin: 0;
    accent-color: var(--accent);
  }
  .row {
    display: flex;
    justify-content: space-between;
    margin-top: 0.8rem;
  }
  .hint {
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }
</style>
