<script lang="ts">
  import { t } from "../i18n.js";
  import type { Snippet } from "svelte";
  import ToolIcon from "./ToolIcon.svelte";

  let { title, onclose, children, wide = false }: { title: string; onclose?: () => void; children: Snippet; wide?: boolean } = $props();
  let el: HTMLDivElement | undefined = $state();

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = el?.querySelector<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])");
    first?.focus();
    return () => previous?.focus?.();
  });

  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape" && onclose) {
      e.stopPropagation();
      onclose();
    }
    if (e.key === "Tab" && el) {
      const items = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, select, [tabindex]:not([tabindex='-1'])")];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose?.()}>
  <div class="modal" class:wide bind:this={el} role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={keydown}>
    <header>
      <h2>{title}</h2>
      {#if onclose}<button class="close" aria-label={t("ui.close")} onclick={onclose}><ToolIcon name="close" size={20} /></button>{/if}
    </header>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: #1c160d88;
    display: grid;
    place-items: center;
    z-index: 50;
    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom))
      max(1rem, env(safe-area-inset-left));
  }
  .modal {
    background: var(--paper-sheet);
    border: 2px solid var(--edge);
    border-radius: var(--radius-l);
    padding: 1rem 1.2rem 1.2rem;
    width: min(28rem, 100%);
    max-height: 90vh;
    overflow: auto;
    box-shadow: var(--sheet-rule), 0 20px 60px #0006;
  }
  .modal.wide {
    width: min(46rem, 100%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid color-mix(in srgb, var(--edge) 35%, transparent);
  }
  h2 {
    margin: 0;
    font: 700 1.3rem/1.1 var(--font-display);
  }
  .close {
    min-width: 44px;
  }
</style>
