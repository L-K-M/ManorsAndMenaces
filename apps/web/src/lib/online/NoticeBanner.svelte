<script lang="ts">
  // Notices about online matches that are not on screen (spec §85), on top of
  // whatever screen is showing: open the match, or dismiss the notice.
  import { t } from "../i18n.js";
  import ToolIcon from "../components/ToolIcon.svelte";
  import { dismissNotice, notices } from "./notices.svelte.js";

  /** `canOpen` is false while leaving the current game would lose it (a tutorial, an unsaved game). */
  let { onopen, canOpen = true }: { onopen: (matchId: string) => void; canOpen?: boolean } = $props();
</script>

{#if notices.list.length}
  <section class="notices" aria-label={t("ui.notices")}>
    {#each notices.list as n (n.matchId)}
      <div class="notice" role="status">
        <p><strong>{n.title}</strong> {n.body}</p>
        {#if canOpen}<button class="primary" onclick={() => onopen(n.matchId)}>{t("ui.notice_open")}</button>{/if}
        <button class="dismiss" aria-label={t("ui.notice_dismiss")} onclick={() => dismissNotice(n.matchId)}><ToolIcon name="close" size={18} /></button>
      </div>
    {/each}
  </section>
{/if}

<style>
  .notices {
    position: fixed;
    top: max(0.6rem, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    display: grid;
    gap: 0.4rem;
    width: min(30rem, calc(100vw - 1.2rem));
  }
  .notice {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem 0.5rem 0.9rem;
    background: var(--paper);
    border: 2px solid #8a7650;
    border-radius: 12px;
    box-shadow: 0 6px 18px #0004;
  }
  p {
    flex: 1;
    margin: 0;
    font-size: 0.9rem;
  }
  .dismiss {
    min-width: 36px;
    min-height: 36px;
    padding: 0;
    display: grid;
    place-items: center;
  }
</style>
