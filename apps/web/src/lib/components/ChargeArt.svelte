<script lang="ts">
  import type { ChargeId } from "@manors-menaces/rules";
  import { chargePainting } from "../chargePaintings.js";
  import { settings } from "../stores/settings.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { id }: { id: ChargeId } = $props();
  let failedId = $state<ChargeId | null>(null);
  const painting = $derived(chargePainting(id));
</script>

<span class="charge-art" data-charge-art={id} aria-hidden="true">
  {#if painting && !settings.highContrast && failedId !== id}
    <img class:miniature={painting.endsWith(".png")} src={`${import.meta.env.BASE_URL}art/${painting}`} alt="" decoding="async" onerror={() => (failedId = id)} />
  {:else}
    <ToolIcon name="seal" size={32} />
  {/if}
</span>

<style>
  .charge-art {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--edge);
    border-radius: 8px;
    background: radial-gradient(circle, #fff9e8, #e5ce99);
    color: var(--ink);
    box-shadow: inset 0 0 0 2px #fff9e8;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  img.miniature {
    object-fit: contain;
    padding: 3px;
    box-sizing: border-box;
  }
</style>
