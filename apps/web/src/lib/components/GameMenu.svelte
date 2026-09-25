<script lang="ts">
  // In-game menu behind the ☰ button: nothing here ends the game without a
  // confirmation, and leaving first writes the pending autosave.
  import { t } from "../i18n.js";
  import type { GameSession } from "../game/session.svelte.js";
  import Modal from "./Modal.svelte";

  let {
    session,
    tutorial = false,
    onexit,
    onsettings,
    onclose,
  }: { session: GameSession; tutorial?: boolean; onexit: () => void; onsettings: () => void; onclose: () => void } = $props();

  const local = $derived(session.transport.kind === "local");
  let confirmingExit = $state(false);
  let stayButton: HTMLButtonElement | undefined = $state();
  // The pressed button disappears when the confirmation replaces the menu:
  // move focus to the safe choice.
  $effect(() => {
    if (confirmingExit) stayButton?.focus();
  });
  let busy = $state(false);
  let note: { text: string; ok: boolean } | null = $state(null);

  async function run(action: () => Promise<string | null>, failure: string) {
    busy = true;
    note = null;
    try {
      const text = await action();
      if (text) note = { text, ok: true };
    } catch {
      note = { text: failure, ok: false };
    } finally {
      busy = false;
    }
  }
  const save = () =>
    run(async () => {
      await session.save();
      return t("ui.saved");
    }, t("ui.save_failed"));
  const exportSave = () => run(async () => ((await session.exportSave()) ? t("ui.exported") : null), t("ui.export_failed"));

  /** Leaving now would lose the game: the last autosave did not land. */
  const unsaved = $derived(local && !tutorial && session.autosaveFailed);

  async function leave() {
    const warned = unsaved;
    busy = true;
    await session.flushAutosave();
    busy = false;
    // Never claim the game is kept when the final write failed: stay and
    // show the warning (with Export) so the player decides with the facts.
    if (session.autosaveFailed && local && !tutorial && !warned) return;
    onexit();
  }

  const leaveMessage = $derived(
    !local ? t("ui.leave_online") : tutorial ? t("ui.leave_tutorial") : unsaved ? t("ui.leave_unsaved") : t("ui.leave_autosaved"),
  );
</script>

<Modal title={confirmingExit ? t("ui.leave_game") : t("ui.game_menu")} {onclose}>
  {#if confirmingExit}
    <p class="message" class:bad={unsaved} role={unsaved ? "alert" : undefined}>{leaveMessage}</p>
    <div class="confirm">
      <button bind:this={stayButton} onclick={() => (confirmingExit = false)} disabled={busy}>{t("ui.stay")}</button>
      <!-- When leaving would lose the game, Export is the recommended choice. -->
      {#if unsaved}<button class="primary" onclick={exportSave} disabled={busy}>{t("ui.export_save")}</button>{/if}
      <button class:primary={!unsaved} onclick={leave} disabled={busy}>{unsaved ? t("ui.exit_without_saving") : t("ui.exit_to_title")}</button>
    </div>
    {#if note}<p class="note" class:bad={!note.ok} role="status">{note.text}</p>{/if}
  {:else}
    <nav class="menu" aria-label={t("ui.game_menu")}>
      <button class="primary" onclick={onclose}>{t("ui.resume")}</button>
      {#if local && !tutorial}
        <button onclick={save} disabled={busy}>{t("ui.save_game")}</button>
        <button onclick={exportSave} disabled={busy}>{t("ui.export_save")}</button>
      {/if}
      <button onclick={onsettings}>{t("ui.settings")}</button>
      <button class="exit" onclick={() => (confirmingExit = true)}>{t("ui.exit_to_title")}</button>
    </nav>
    {#if note}<p class="note" class:bad={!note.ok} role="status">{note.text}</p>{/if}
    {#if local && !tutorial && session.autosaveFailed}<p class="note bad" role="alert">{t("ui.autosave_failed")}</p>{/if}
  {/if}
</Modal>

<style>
  .menu {
    display: grid;
    gap: 0.5rem;
  }
  .menu button {
    font-size: 1.05rem;
    padding: 0.55rem 1rem;
  }
  .menu .exit {
    margin-top: 0.4rem;
    border-style: dashed;
  }
  .note {
    margin: 0.8rem 0 0;
    padding: 0.45rem 0.7rem;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 12%, var(--paper));
    border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .note.bad {
    background: #fbe3dc;
    border-color: #c8403a;
    color: #7a1a10;
  }
  .message {
    margin: 0 0 1rem;
  }
  .message.bad {
    color: #7a1a10;
    font-weight: 600;
  }
  .confirm {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
