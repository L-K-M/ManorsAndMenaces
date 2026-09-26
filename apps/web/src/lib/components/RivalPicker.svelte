<script lang="ts">
  // New Game: choose which named rival plays an AI seat. Rivals already
  // seated elsewhere are listed but disabled, so every rival appears once.
  import { RIVALS, rivalById } from "@manors-menaces/content";
  import { t } from "../i18n.js";

  let { rivalId, taken, label, onpick }: { rivalId: string | undefined; taken: readonly (string | undefined)[]; label: string; onpick: (id: string) => void } = $props();

  const rival = $derived(rivalById(rivalId));
</script>

<div class="picker">
  <select aria-label={label} value={rivalId ?? ""} onchange={(e) => onpick((e.currentTarget as HTMLSelectElement).value)}>
    {#each RIVALS as r (r.id)}
      <option value={r.id} disabled={r.id !== rivalId && taken.includes(r.id)}>{t("ui.rival_label", { name: t(r.nameKey), title: t(r.titleKey) })}</option>
    {/each}
  </select>
  {#if rival}<q class="motto">{t(rival.mottoKey)}</q>{/if}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.6rem;
    margin: 0;
  }
  select {
    width: 100%;
    font-size: 0.85rem;
    max-width: 100%;
    min-width: 0;
  }
  .motto {
    flex: 1 1 9rem;
    min-width: 0;
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.75;
    quotes: "“" "”";
  }
</style>
