<script lang="ts">
  // A rival's speech bubble. `tail` says where the speaker is: above (on a
  // player card) or to the left (next to a portrait on the board).
  import { scale } from "svelte/transition";
  import { backOut } from "svelte/easing";
  import { animationScale } from "../stores/settings.svelte.js";
  import type { PlayerTheme } from "../theme.js";

  let { text, theme, name, tail = "top" }: { text: string; theme: PlayerTheme; name?: string; tail?: "top" | "left" } = $props();

  // Reduced motion or animation off: appear without the pop.
  const duration = animationScale() === 0 ? 0 : 220;
</script>

<div class="bubble tail-{tail}" style="--pc: {theme.color}; --pd: {theme.dark}" transition:scale={{ duration, start: 0.6, easing: backOut }} aria-hidden="true">
  {#if name}<b>{name}</b>{/if}
  <q>{text}</q>
</div>

<style>
  .bubble {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: #fffdf6;
    color: #2b1d12;
    border: 2px solid var(--pc);
    border-radius: 12px;
    padding: 0.35rem 0.65rem;
    box-shadow: 0 4px 14px #0003;
    font-size: 0.86rem;
    line-height: 1.25;
    pointer-events: none;
  }
  .tail-top {
    transform-origin: 1rem -0.5rem;
  }
  .tail-left {
    transform-origin: -0.5rem 50%;
  }
  .bubble::before,
  .bubble::after {
    content: "";
    position: absolute;
    border: solid transparent;
  }
  .tail-top::before {
    left: 0.7rem;
    bottom: 100%;
    border-width: 0 8px 9px;
    border-bottom-color: var(--pc);
  }
  .tail-top::after {
    left: calc(0.7rem + 3px);
    bottom: calc(100% - 1px);
    border-width: 0 5px 6px;
    border-bottom-color: #fffdf6;
  }
  .tail-left::before {
    right: 100%;
    top: 0.9rem;
    border-width: 8px 9px 8px 0;
    border-right-color: var(--pc);
  }
  .tail-left::after {
    right: calc(100% - 1px);
    top: calc(0.9rem + 3px);
    border-width: 5px 6px 5px 0;
    border-right-color: #fffdf6;
  }
  b {
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--pd);
  }
  q {
    font-style: italic;
    quotes: "“" "”";
  }
</style>
