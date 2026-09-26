<script lang="ts">
  // Turn emails (spec §85): an address this guest confirmed gets a notice
  // whenever it becomes their turn while the game is closed. Shown only when
  // the server can send mail.
  import type { EmailSettings } from "@manors-menaces/protocol";
  import { t } from "../i18n.js";
  import type { OnlineClient } from "./client.js";

  /** `guard` is the lobby's: it shows errors and renews an expired session. */
  let { client, guard, busy }: { client: OnlineClient; guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>; busy: boolean } = $props();

  let settings: EmailSettings | null = $state(null);
  let address = $state("");

  /** Bumped by every change of settings, so an answer that was already on its way cannot undo it. */
  let generation = 0;
  async function load() {
    const asked = ++generation;
    // Quietly: an older server, or a moment offline, just leaves this as it was.
    const next = await client.emailSettings().catch(() => null);
    if (next && asked === generation) settings = next;
  }
  $effect(() => {
    void load();
    // The confirmation link opens in the mail app: look again on the way back.
    const onFocus = () => void load();
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });

  async function send() {
    const next = await guard(() => client.requestEmail(address.trim()));
    if (next) update(next);
  }
  async function remove() {
    const next = await guard(() => client.removeEmail());
    if (next) update(next);
  }
  function update(next: EmailSettings) {
    generation++;
    settings = next;
  }
</script>

{#if settings?.available}
  <!-- Live: the form, "check your inbox" and "emails go to" replace each other here. -->
  <div class="emails" aria-live="polite">
    {#if settings.address}
      <p>{settings.confirmed ? t("ui.turn_emails_on", { address: settings.address }) : t("ui.turn_emails_pending", { address: settings.address })}</p>
      <button type="button" disabled={busy} onclick={remove}>{settings.confirmed ? t("ui.turn_emails_stop") : t("ui.turn_emails_cancel")}</button>
    {:else}
      <form onsubmit={(e) => (e.preventDefault(), send())}>
        <label>{t("ui.turn_emails")} <input type="email" bind:value={address} required maxlength="254" autocomplete="email" /></label>
        <button disabled={busy}>{t("ui.turn_emails_send")}</button>
      </form>
      <small>{t("ui.turn_emails_hint")}</small>
    {/if}
  </div>
{/if}

<style>
  .emails {
    margin-top: 0.8rem;
  }
  .emails p {
    margin: 0 0 0.4rem;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0.4rem 0.6rem;
  }
  label {
    display: flex;
    flex-direction: column;
    flex: 1 1 16rem;
  }
  small {
    opacity: 0.7;
  }
</style>
