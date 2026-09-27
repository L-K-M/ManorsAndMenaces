<script lang="ts">
  // §16.3: ending a turn while another placement of the player's Banners
  // would harvest more asks first. The advice follows the draft, so it stays
  // current while the dialog is open.
  import { computeBannerHarvest, type BannerMove, type LegalActionSummary } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { applyBannerAdvice, bannerWarningFor, confirmBannersAndEndTurn } from "../game/interaction.js";
  import { regionName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { saveSettings, settings } from "../stores/settings.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";

  let { session, legal }: { session: GameSession; legal: LegalActionSummary | null } = $props();
  const advice = $derived(bannerWarningFor(session, legal));

  // Nothing left to warn about (the phase ended, or the gap closed): close.
  $effect(() => {
    if (!advice) close();
  });

  function close() {
    ui.dialog = null;
  }
  // The dialog opens under the pointer of a double-clicked End Turn: its
  // buttons ignore the follow-up clicks, as the action bar's do.
  const once = (fn: () => unknown) => (e: MouseEvent) => {
    if (e.detail > 1) return;
    void fn();
  };

  /** Back to the board, with the first Banner to move picked up. */
  function place() {
    ui.selectedBannerId = advice?.moves[0]?.bannerId ?? null;
    close();
  }
  function placeForMe() {
    if (advice) applyBannerAdvice(advice);
    close();
  }
  async function endAnyway() {
    // Closing unmounts the dialog; keep what the turn's end needs.
    const s = session;
    const l = legal;
    close();
    if (l?.mode === "banner_assignment") await confirmBannersAndEndTurn(s, l);
  }
  function dontWarn(e: Event) {
    settings.bannerWarning = !(e.currentTarget as HTMLInputElement).checked;
    saveSettings();
  }

  const where = (regionId: string | null): string => (regionId ? regionName(session.map, regionId) : t("banner_warning.home"));
  function moveText(m: BannerMove): string {
    const banner = session.draft.banners[m.bannerId];
    const h = banner && m.to ? computeBannerHarvest(session.ctx, session.draft, banner, m.to) : null;
    const params = { from: where(m.from), to: where(m.to) };
    if (!h?.produced || h.amount <= 0) return t("banner_warning.move", params);
    return t("banner_warning.move_gain", { ...params, count: h.amount, resource: t(`resource.${h.produced}`) });
  }
  const reasonText = (m: BannerMove): string =>
    m.reason === "blocked_by_troll" || m.reason === "taken_by_dragon" ? t(`harvest.${m.reason}`) : t(`banner_warning.reason.${m.reason}`);
</script>

{#if advice}
  <Modal title={t("banner_warning.title")} onclose={close}>
    <p class="help">{t("banner_warning.summary", { current: advice.current, best: advice.best })}</p>
    <ul class="moves">
      {#each advice.moves as m (m.bannerId)}
        <li>
          <b>{moveText(m)}</b>
          <small>{reasonText(m)}</small>
        </li>
      {/each}
    </ul>
    <div class="buttons">
      <button class="primary" data-autofocus onclick={once(place)}>{t("banner_warning.place")}</button>
      <button onclick={once(placeForMe)}>{t("banner_warning.place_for_me")}</button>
      <button onclick={once(endAnyway)}>{t("banner_warning.end_anyway")}</button>
    </div>
    <label class="dont">
      <input type="checkbox" checked={!settings.bannerWarning} onchange={dontWarn} />
      {t("banner_warning.dont_warn")}
    </label>
  </Modal>
{/if}

<style>
  .help {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
  }
  .moves {
    margin: 0 0 0.8rem;
    padding-left: 1.2rem;
    font-size: 0.9rem;
  }
  .moves li + li {
    margin-top: 0.3rem;
  }
  .moves small {
    display: block;
    opacity: 0.8;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .dont {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-height: 44px;
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }
  .dont input {
    width: 1.3rem;
    height: 1.3rem;
  }
</style>
