<script lang="ts">
  // The Crown's Voice (experimental, §129.7): the virtue the Crown favours
  // this round and the next one. A tap opens the Voice's dialog with the
  // purse and how each virtue scores, which a tooltip could not show on a
  // touch screen. Shown only in games created with the rule.
  import { getVoiceStatus } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { crownsVoiceText, virtueName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session }: { session: GameSession } = $props();
  const gs = $derived(session.draft);
  const voice = $derived(gs.crownsVoice);
  const silent = $derived(getVoiceStatus(gs) !== "speaking");
</script>

{#if voice}
  <button class="voice" class:silent aria-haspopup="dialog" onclick={() => (ui.dialog = "crowns_voice")}>
    <ToolIcon name="crown" size={16} />
    <span class="text">{crownsVoiceText(gs)}</span>
    <!-- Phones: shorter forms keep the top bar on its two rows. -->
    <span class="short" aria-hidden="true">{t("voice.chip_short", { virtue: virtueName(voice.current), next: virtueName(voice.next) })}</span>
    <span class="tiny" aria-hidden="true">{virtueName(voice.current)}</span>
  </button>
{/if}

<style>
  /* Like the scoreboard's chips: a full-height touch target around a
     smaller pill. */
  .voice {
    position: relative;
    isolation: isolate;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    flex: 0 1 auto;
    padding: 0 0.6rem;
    border: none;
    border-radius: 999px;
    background: none;
    box-shadow: none;
    color: inherit;
    font-size: 0.85rem;
    font-weight: inherit;
    line-height: 1.2;
    white-space: nowrap;
  }
  .voice:hover:not(:disabled) {
    background: none;
  }
  .voice::before {
    content: "";
    position: absolute;
    inset: 50% 0 auto;
    z-index: -1;
    height: calc(1.2em + 0.3rem + 2px);
    translate: 0 -50%;
    border-radius: 999px;
    border: 1px solid #fff5;
    background: #fff1;
    transition: background 0.2s;
  }
  .voice:hover::before {
    background: #fff3;
  }
  /* Not yet speaking (§129.7): the Quest deck has Quests left. */
  .voice.silent::before {
    border-style: dashed;
  }
  .voice :global(svg) {
    flex: none;
    color: #e2b93b;
  }
  .text,
  .short,
  .tiny {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .short,
  .tiny {
    display: none;
  }
  /* The sheet layout's top bar (GameScreen) is a size container. On a phone
     only this round's virtue fits beside the buttons. */
  @container topbar (max-width: 40rem) {
    .short {
      display: inline;
    }
    .text {
      position: absolute;
      width: 1px;
      height: 1px;
      clip-path: inset(50%);
    }
  }
  @container topbar (max-width: 28rem) {
    .short {
      display: none;
    }
    .tiny {
      display: inline;
    }
  }
</style>
