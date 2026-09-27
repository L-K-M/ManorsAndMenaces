<script lang="ts">
  // A whole card at reading size (name, art, rules and flavour), for dialogs
  // that show a card someone played.
  import type { CardRulesDefinition } from "@manors-menaces/rules";
  import CardFace from "./CardFace.svelte";

  let { def }: { def: CardRulesDefinition } = $props();
</script>

<div class="full-card"><CardFace {def} view="read" /></div>

<style>
  .full-card {
    width: min(22rem, 100%);
    margin: 0.2rem auto 0.7rem;
    filter: drop-shadow(0 6px 12px #38231855);
  }
</style>
