<script lang="ts">
  // Hot-seat privacy curtain (§56.1). A true modal: GameScreen makes the game
  // behind it inert, focus starts on the button and cannot leave, and Escape
  // does not dismiss it, so nobody reaches the board or a hand by keyboard
  // before the named player has taken the device.
  import { tick } from "svelte";
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { PLAYER_THEMES, emblemPath } from "../theme.js";

  let { session }: { session: GameSession } = $props();
  let button: HTMLButtonElement | undefined = $state();

  const waiting = $derived(session.curtainFor);
  const theme = $derived(PLAYER_THEMES[session.seat(waiting)?.color ?? 0] ?? PLAYER_THEMES[0]!);

  $effect(() => {
    if (waiting) button?.focus();
  });

  function keydown(e: KeyboardEvent) {
    // Nothing behind the curtain may react to keys (shortcuts listen on the window).
    e.stopPropagation();
    if (e.key === "Tab" || e.key === "Escape") {
      e.preventDefault();
      button?.focus();
    }
  }

  async function begin() {
    session.revealForCurtain();
    await tick();
    // Hand focus to the first available action rather than dropping it on <body>.
    document.querySelector<HTMLElement>('.game [role="toolbar"] button:not(:disabled)')?.focus();
  }
</script>

{#if waiting}
  <div class="curtain" role="dialog" aria-modal="true" aria-labelledby="curtain-pass curtain-name" tabindex="-1" onkeydown={keydown}>
    <div class="card" style="--pc: {theme.color}; --pd: {theme.dark}">
      <p class="pass" id="curtain-pass">{t("ui.pass_to")}</p>
      <svg class="emblem" width="56" height="56" viewBox="-14 -14 28 28" aria-hidden="true">
        <path d={emblemPath(theme.shape, 11)} fill={theme.color} stroke="#fffaf0" stroke-width="1.6" />
      </svg>
      <h2 id="curtain-name">{session.authoritative.players[waiting]?.displayName}</h2>
      <button bind:this={button} class="primary big" onclick={begin}>{t("ui.tap_to_begin_turn")}</button>
    </div>
  </div>
{/if}

<style>
  .curtain {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 50% 40%, #3d6b3a, #1d321b);
    display: grid;
    place-items: center;
    z-index: 60;
    padding: 1rem;
    outline: none;
  }
  .card {
    text-align: center;
    color: #fffaf0;
    display: grid;
    justify-items: center;
    animation: rise 0.35s ease-out;
  }
  .pass {
    font-size: 1.2rem;
    opacity: 0.8;
    margin: 0 0 0.6rem;
  }
  .emblem {
    filter: drop-shadow(0 3px 6px #0006);
  }
  h2 {
    font: 700 3rem/1.1 var(--font-display);
    margin: 0.3rem 0 1.2rem;
    overflow-wrap: anywhere;
  }
  .big {
    font-size: 1.2rem;
    padding: 0.8rem 1.6rem;
  }
  .big:focus-visible {
    outline: 3px solid #fffaf0;
    outline-offset: 3px;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
</style>
