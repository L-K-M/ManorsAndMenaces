<script lang="ts">
  import type { CardEffectId, CardType } from "@manors-menaces/rules";
  import { settings } from "../stores/settings.svelte.js";
  import CardGlyph from "./CardGlyph.svelte";

  let { id, type }: { id: CardEffectId; type: CardType } = $props();
  // Track the failed identity, so moving between previews can still load
  // another card's painting without resetting state in an effect.
  let failedId = $state<CardEffectId | null>(null);
</script>

<span class="card-art" data-card-art={id} aria-hidden="true">
  {#if !settings.highContrast && failedId !== id}
    <img src={`${import.meta.env.BASE_URL}art/cards/${id}.webp`} alt="" loading="lazy" decoding="async" onerror={() => (failedId = id)} />
  {:else}
    <CardGlyph {type} />
  {/if}
</span>

<style>
  .card-art {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 5px;
    background: #e8d8b5;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
