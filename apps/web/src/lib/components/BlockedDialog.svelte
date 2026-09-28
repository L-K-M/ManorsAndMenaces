<script lang="ts">
  // Why a tap did nothing (interaction.ts showBlocked): a Banner with nowhere
  // to go, a card that can't be played now, a build where none may stand.
  import { t } from "../i18n.js";
  import { ui } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";

  function close() {
    ui.dialog = null;
    ui.blocked = null;
  }
</script>

{#if ui.dialog === "blocked" && ui.blocked}
  <Modal title={ui.blocked.title} onclose={close}>
    <p>{ui.blocked.text}</p>
    <div class="end">
      <button class="primary" data-autofocus onclick={(e) => e.detail <= 1 && close()}>{t("blocked.ok")}</button>
    </div>
  </Modal>
{/if}

<style>
  p {
    margin: 0 0 0.9rem;
  }
  .end {
    display: flex;
    justify-content: flex-end;
  }
  .end button {
    min-width: 6rem;
  }
</style>
