<script lang="ts">
  // The Crown's Voice (experimental, §129.7): the virtue the Crown favours
  // this round and the next one. The purse and how each virtue scores are in
  // the tooltip. Shown only in games created with the rule.
  import { CROWNS_VIRTUES, isVoiceSpeaking } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { virtueName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import ToolIcon from "./ToolIcon.svelte";

  let { session }: { session: GameSession } = $props();
  const gs = $derived(session.draft);
  const voice = $derived(gs.crownsVoice);
  const text = $derived(
    voice ? t(isVoiceSpeaking(gs) ? "voice.chip" : "voice.chip_waiting", { virtue: virtueName(voice.current), next: virtueName(voice.next) }) : "",
  );
  const purse = $derived(voice ? t("voice.purse", { count: voice.purse }) : "");
  const help = $derived([purse, ...CROWNS_VIRTUES.map((v) => t("voice.virtue_help", { virtue: virtueName(v), help: t(`voice.virtue.${v}.help`) }))].join("\n"));
</script>

{#if voice}
  <span class="voice" title={`${text}\n${help}`}>
    <ToolIcon name="crown" size={16} />
    <span class="text">{text}</span>
    <!-- Phones: the short form keeps the top bar on its rows. -->
    <span class="short" aria-hidden="true">{t("voice.chip_short", { virtue: virtueName(voice.current), next: virtueName(voice.next) })}</span>
    <span class="sr">{purse}</span>
  </span>
{/if}

<style>
  .voice {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    flex: 0 1 auto;
    padding: 0.15rem 0.6rem;
    border: 1px solid #fff5;
    border-radius: 999px;
    background: #fff1;
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .voice :global(svg) {
    flex: none;
    color: #e2b93b;
  }
  .text,
  .short {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .short {
    display: none;
  }
  /* The sheet layout's top bar (GameScreen) is a size container. */
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
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
