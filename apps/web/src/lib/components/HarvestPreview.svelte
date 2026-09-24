<script lang="ts">
  // Next-harvest preview (spec §54): updates live as Banners move.
  import { RESOURCE_TYPES, getPlayerBanners, type HarvestPreview } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { regionName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import ResourceIcon from "./ResourceIcon.svelte";

  let { session, playerId, preview }: { session: GameSession; playerId: string; preview: HarvestPreview } = $props();
  const unassigned = $derived(
    getPlayerBanners(session.draft, playerId).filter((b) => (b.id in ui.bannerDraft ? ui.bannerDraft[b.id] : b.regionId) == null).length,
  );
  const notes = $derived(preview.banners.filter((b) => b.notes.length > 0));
</script>

<section class="preview" aria-live="polite" aria-label={t("harvest.next")}>
  <h3>{t("harvest.next")}</h3>
  <ul class="totals">
    {#each RESOURCE_TYPES as r}
      <li class:zero={preview.totals[r] === 0}>
        <ResourceIcon resource={r} size={18} />
        <span class="name">{t(`resource.${r}`)}</span>
        <b>+{preview.totals[r]}</b>
      </li>
    {/each}
  </ul>
  {#if notes.length || unassigned}
    <ul class="warnings">
      {#each notes as b}
        <li>
          <b>{regionName(session.map, b.regionId)}</b>:
          {b.notes.map((n) => t(`harvest.${n}`)).join("; ")}
        </li>
      {/each}
      {#if unassigned}<li>{t("harvest.unassigned", { count: unassigned })}</li>{/if}
    </ul>
  {/if}
</section>

<style>
  .preview h3 {
    margin: 0 0 0.3rem;
    font: 700 0.8rem/1 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .totals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.8rem;
  }
  .totals li {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .totals li.zero {
    opacity: 0.45;
  }
  .name {
    font-size: 0.8rem;
  }
  .warnings {
    margin: 0.35rem 0 0;
    padding-left: 1rem;
    font-size: 0.8rem;
    color: #7a1d10;
  }
</style>
