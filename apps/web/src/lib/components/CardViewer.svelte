<script lang="ts">
  // A card shown at reading size until the player closes it (close button,
  // a tap on the backdrop, Escape). Touch screens have no hover preview,
  // and cards on the table (Charters, set-aside cards) have none either.
  // Modal moves focus in and back to whatever had it before.
  import type { CardRulesDefinition } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import CardFace from "./CardFace.svelte";
  import Modal from "./Modal.svelte";

  let { def, onclose }: { def: CardRulesDefinition; onclose: () => void } = $props();
</script>

<Modal title={t(`card.${def.id}.name`)} {onclose} bare>
  <div class="card-view">
    <CardFace {def} view="read" />
  </div>
</Modal>

<style>
  .card-view {
    border: 2px solid #795b32;
    border-radius: 12px;
    background: #293f32;
    box-shadow: 0 12px 32px #0006;
  }
</style>
