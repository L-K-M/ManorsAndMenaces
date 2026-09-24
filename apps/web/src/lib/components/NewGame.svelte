<script lang="ts">
  import type { AiLevel, SeatConfig } from "@manors-menaces/protocol";
  import { mvpRuleset, standardRuleset, type RulesetConfig } from "@manors-menaces/rules";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";

  let { onstart, onback }: { onstart: (opts: { seats: SeatConfig[]; ruleset: RulesetConfig; seed?: string }) => void; onback: () => void } = $props();

  const NAMES = ["Alice", "Bertram", "Cordelia", "Dunstan"];
  let count = $state(3);
  let mode: "standard" | "mvp" = $state("standard");
  let seed = $state("");
  let seats = $state(
    NAMES.map((name, i) => ({ name, kind: (i === 0 ? "human" : "ai") as "human" | "ai", level: "normal" as AiLevel })),
  );

  function start() {
    const chosen: SeatConfig[] = seats.slice(0, count).map((s, i) => ({
      playerId: `P${i + 1}`,
      displayName: s.name.trim() || `Player ${i + 1}`,
      kind: s.kind,
      ...(s.kind === "ai" ? { aiLevel: s.level } : {}),
      color: i,
    }));
    const ruleset = mode === "mvp" ? mvpRuleset() : standardRuleset(count);
    onstart({ seats: chosen, ruleset, ...(seed.trim() ? { seed: seed.trim() } : {}) });
  }
</script>

<section class="panel">
  <h2>New game</h2>
  <form onsubmit={(e) => (e.preventDefault(), start())}>
    <fieldset>
      <legend>Players</legend>
      <div class="count" role="radiogroup" aria-label="Number of players">
        {#each [2, 3, 4] as n}
          <label class:on={count === n}><input type="radio" name="count" value={n} bind:group={count} /> {n}</label>
        {/each}
      </div>
      {#each seats.slice(0, count) as seat, i}
        {@const theme = PLAYER_THEMES[i] ?? PLAYER_THEMES[0]!}
        <div class="seat">
          <svg width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true"><path d={emblemPath(theme.shape, 9)} fill={theme.color} stroke={theme.dark} stroke-width="2" /></svg>
          <input aria-label="Name of player {i + 1}" bind:value={seat.name} maxlength="20" />
          <select aria-label="Player {i + 1} type" bind:value={seat.kind}>
            <option value="human">Human</option>
            <option value="ai">Computer</option>
          </select>
          {#if seat.kind === "ai"}
            <select aria-label="Player {i + 1} difficulty" bind:value={seat.level}>
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
            </select>
          {/if}
        </div>
      {/each}
    </fieldset>
    <fieldset>
      <legend>Rules</legend>
      <label class="rule"><input type="radio" name="mode" value="standard" bind:group={mode} /> <b>Standard</b> — cards, Royal Quests, 12 Renown</label>
      <label class="rule"><input type="radio" name="mode" value="mvp" bind:group={mode} /> <b>Core</b> — Banners, building and the Toll Troll only, 10 Renown</label>
    </fieldset>
    <details>
      <summary>Advanced</summary>
      <label>Seed (for reproducible games) <input bind:value={seed} placeholder="random" /></label>
    </details>
    <div class="row">
      <button type="button" onclick={onback}>Back</button>
      <button type="submit" class="primary">Begin</button>
    </div>
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
    gap: 0.45rem;
  }
  .count {
    display: flex;
    gap: 0.4rem;
  }
  .count label {
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
  .seat {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .seat input {
    flex: 1;
    min-width: 0;
  }
  .rule {
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .row {
    display: flex;
    justify-content: space-between;
    margin-top: 0.8rem;
  }
</style>
