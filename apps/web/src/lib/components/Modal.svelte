<script lang="ts">
  import { t } from "../i18n.js";
  import type { Snippet } from "svelte";
  import ToolIcon from "./ToolIcon.svelte";

  // `bare` is for content that brings its own surface, such as a card: no
  // sheet around it, and the heading (which the content repeats) is kept
  // for screen readers only.
  let {
    title,
    onclose,
    children,
    wide = false,
    bare = false,
  }: { title: string; onclose?: () => void; children: Snippet; wide?: boolean; bare?: boolean } = $props();
  let el: HTMLDivElement | undefined = $state();

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // A dialog may name its main control (data-autofocus); otherwise the
    // first control takes focus, the close button when there is one.
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("button, [href], input, select, [tabindex]:not([tabindex='-1'])");
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

<!-- The follow-up clicks of a double click that opened the dialog land on
     the backdrop; they must not close it again. -->
<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && e.detail <= 1 && onclose?.()}>
  <div class="modal" class:wide class:bare bind:this={el} role="dialog" aria-modal="true" aria-label={title} tabindex="-1" onkeydown={keydown}>
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
  .modal.bare {
    width: min(22rem, 100%);
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
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
  /* The close button stays in reach while a tall card scrolls under it. */
  .bare header {
    position: sticky;
    top: 0;
    z-index: 1;
    justify-content: flex-end;
    margin-bottom: 0.4rem;
    padding-bottom: 0;
    border-bottom: none;
  }
  .bare h2 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .close {
    min-width: 44px;
  }
</style>
