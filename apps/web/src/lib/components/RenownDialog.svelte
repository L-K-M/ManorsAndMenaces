<script lang="ts">
  // Where a player's Renown comes from (§7): Holdings, claimed Royal Quests
  // and bonus Renown. All of it is public, so any player can be inspected.
  import { getRenownSources, type PlayerId } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import Modal from "./Modal.svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { session, playerId, onclose }: { session: GameSession; playerId: PlayerId; onclose: () => void } = $props();
  const gs = $derived(session.draft);
  const player = $derived(gs.players[playerId]);
  const sources = $derived(getRenownSources(session.ctx, gs, playerId));

  interface Row {
    icon: "manor" | "stronghold" | "writ" | "sparkle";
    label: string;
    count?: number;
    renown: number;
  }
  const rows = $derived.by((): Row[] => {
    const all: Row[] = [
      { icon: "manor", label: t("stat.renown_manors"), count: sources.manors.count, renown: sources.manors.renown },
      { icon: "stronghold", label: t("stat.renown_strongholds"), count: sources.strongholds.count, renown: sources.strongholds.renown },
      ...sources.quests.map((q): Row => ({ icon: "writ", label: t(`quest.${q.questId}.name`), renown: q.renown })),
      { icon: "sparkle", label: t("ui.bonus_renown"), renown: sources.bonus },
    ];
    return all.filter((r) => r.renown !== 0);
  });
</script>

{#if player}
  <Modal title={t("ui.renown_sources_title", { name: player.displayName })} {onclose}>
    <p class="total">
      <ToolIcon name="crown" size={18} />
      {t("ui.renown_count", { renown: sources.total, target: gs.ruleset.targetRenown })}
    </p>
    {#if rows.length}
      <table class="sources">
        <caption class="sr">{t("ui.renown_sources_caption", { name: player.displayName })}</caption>
        <tbody>
          {#each rows as r, i (i)}
            <tr>
              <th scope="row"><ToolIcon name={r.icon} size={16} />{r.label}</th>
              <td class="count">{r.count === undefined ? "" : t("ui.renown_sources_count", { count: r.count })}</td>
              <td class="renown">{r.renown > 0 ? `+${r.renown}` : r.renown}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="none">{t("ui.renown_sources_none")}</p>
    {/if}
  </Modal>
{/if}

<style>
  .total {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0 0 0.6rem;
    font-weight: 700;
    font-size: 1.1rem;
  }
  .total :global(svg) {
    color: #b08500;
  }
  .sources {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.35rem 0.2rem;
    border-top: 1px solid color-mix(in srgb, var(--edge) 25%, transparent);
  }
  th {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    text-align: left;
    font-weight: 500;
  }
  .count {
    text-align: right;
    opacity: 0.7;
  }
  .renown {
    text-align: right;
    font-weight: 700;
    width: 3rem;
  }
  .none {
    margin: 0;
    opacity: 0.75;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
