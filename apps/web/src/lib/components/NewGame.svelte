<script lang="ts">
  import { t } from "../i18n.js";
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
  <h2>{t("ui.new_game")}</h2>
  <form onsubmit={(e) => (e.preventDefault(), start())}>
    <fieldset>
      <legend>{t("ui.players")}</legend>
      <div class="count" role="radiogroup" aria-label={t("ui.number_of_players")}>
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
      {/each}
    </fieldset>
    <fieldset>
      <legend>{t("ui.rules")}</legend>
      <label class="rule"><input type="radio" name="mode" value="standard" bind:group={mode} /> <b>{t("ui.standard")}</b> {t("ui.cards_royal_quests_12_renown", { target: standardRuleset(count).targetRenown })}</label>
      <label class="rule"><input type="radio" name="mode" value="mvp" bind:group={mode} /> <b>{t("ui.core")}</b> {t("ui.banners_building_and_the_toll")}</label>
    </fieldset>
    <details>
      <summary>{t("ui.advanced")}</summary>
      <label>{t("ui.seed_for_reproducible_games")} <input bind:value={seed} placeholder={t("ui.random")} /></label>
    </details>
    <div class="row">
      <button type="button" onclick={onback}>{t("ui.back")}</button>
      <button type="submit" class="primary">{t("ui.begin")}</button>
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
