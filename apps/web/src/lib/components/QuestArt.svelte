<script lang="ts">
  import type { QuestConditionId } from "@manors-menaces/rules";
  import { settings } from "../stores/settings.svelte.js";
  import CardGlyph from "./CardGlyph.svelte";

  let { id }: { id: QuestConditionId } = $props();
  let failedId = $state<QuestConditionId | null>(null);
</script>

<span class="quest-art" data-quest-art={id} aria-hidden="true">
  {#if !settings.highContrast && failedId !== id}
    <img src={`${import.meta.env.BASE_URL}art/quests/${id}.webp`} alt="" loading="lazy" decoding="async" onerror={() => (failedId = id)} />
  {:else}
    <CardGlyph type="story" />
  {/if}
</span>

<style>
  .quest-art {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 2;
    overflow: hidden;
    border-radius: 6px;
    background: var(--parchment);
    border: 1px solid var(--edge);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
