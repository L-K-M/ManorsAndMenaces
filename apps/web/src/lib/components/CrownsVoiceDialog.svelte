<script lang="ts">
  // The Crown's Voice (experimental, §129.7), opened from its chip in the top
  // bar: what the Crown favours and when, the rule, the purse and how each
  // virtue scores. All of it is public.
  import { BALANCE, CROWNS_VIRTUES } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { crownsVoiceText, virtueName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import Modal from "./Modal.svelte";

  let { session, onclose }: { session: GameSession; onclose: () => void } = $props();
  const gs = $derived(session.draft);
  const voice = $derived(gs.crownsVoice);
</script>

{#if voice}
  <Modal title={t("voice.title")} {onclose}>
    <p class="status">{crownsVoiceText(gs)}</p>
    <p>{t("voice.rule", { max: BALANCE.crownsVoice.maxGainPerRound })}</p>
    <p class="purse">{t("voice.purse", { count: voice.purse })}</p>
    <dl>
      {#each CROWNS_VIRTUES as v (v)}
        <dt>{virtueName(v)}</dt>
        <dd>{t(`voice.virtue.${v}.help`)}</dd>
      {/each}
    </dl>
  </Modal>
{/if}

<style>
  p {
    margin: 0 0 0.6rem;
  }
  .status,
  .purse {
    font-weight: 700;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.8rem;
    margin: 0;
  }
  dt {
    font-weight: 700;
  }
  dd {
    margin: 0;
  }
</style>
