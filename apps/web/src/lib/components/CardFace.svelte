<script lang="ts">
  import type { CardRulesDefinition } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import ToolIcon from "./ToolIcon.svelte";
  import CardArt from "./CardArt.svelte";

  let { def, expanded = false }: { def: CardRulesDefinition; expanded?: boolean } = $props();
</script>

<span class="face {def.type}" class:expanded>
  <strong class="title">{t(`card.${def.id}.name`)}</strong>
  <span class="illustration"><CardArt id={def.effectId} type={def.type} /></span>
  <span class="ribbon"><span aria-hidden="true"><ToolIcon name="sparkle" size={8} /></span> {t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""} <span aria-hidden="true"><ToolIcon name="sparkle" size={8} /></span></span>
  <span class="paper">
    <span class="rules">{t(`card.${def.id}.rules`)}</span>
    <em class="flavor">{t(`card.${def.id}.flavor`)}</em>
    <span class="ornament" aria-hidden="true"><ToolIcon name="sparkle" size={6} /></span>
  </span>
</span>

<style>
  .face {
    --suit: #843d35;
    display: grid;
    grid-template-rows: var(--card-rows, auto minmax(0, 1fr) auto auto);
    height: 100%;
    min-height: 0;
    padding: 0.4rem;
    gap: 0.2rem;
    border-radius: 10px;
    background: radial-gradient(ellipse at top left, #ffffff20, transparent 65%), var(--suit);
    box-shadow: inset 0 0 0 2px #251d23, inset 0 0 0 3px #d0b16c;
    color: #35291e;
    overflow: hidden;
  }
  .spell { --suit: #513e70; }
  .hero { --suit: #785322; }
  .trick { --suit: #334e37; }
  .charter { --suit: #304e65; }
  .title {
    display: grid;
    place-content: center;
    min-height: 2.5em;
    padding: 0.2rem 0.25rem;
    border: 1px solid #d7b775;
    border-radius: 6px 6px 2px 2px;
    background: linear-gradient(110deg, #dfc891, #fff3cf 45%, #e5ca92);
    font: 700 0.9rem/1.1 var(--font-display);
    text-align: center;
    text-wrap: balance;
  }
  .illustration {
    display: block;
    min-height: var(--hand-art-min, 0);
    overflow: hidden;
    border: 1px solid #d7b775;
    border-radius: 3px 3px 12% 12%;
  }
  .ribbon {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.15rem;
    padding: 0.08rem 0.2rem;
    color: #fff0c5;
    font: 700 0.62rem/1.2 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
  }
  .ribbon > span { color: #dfbd6f; }
  .paper {
    display: flex;
    flex-direction: column;
    padding: 0.4rem 0.45rem 0.1rem;
    background: var(--paper-sheet);
    border: 1px solid #d7b775;
    border-radius: 2px 2px 6px 6px;
  }
  .rules {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--rules-lines, 3);
    line-clamp: var(--rules-lines, 3);
    overflow: hidden;
    font: 400 0.76rem/1.25 var(--font-body);
  }
  .flavor {
    display: var(--flavor-display, none);
    font: italic 0.78rem/1.25 var(--font-display);
    margin-top: 0.45rem;
    padding-top: 0.35rem;
    border-top: 1px solid #ae8b4955;
    color: #655342;
  }
  .ornament {
    color: #94703d;
    font-size: 0.5rem;
    margin-top: auto;
    text-align: center;
  }
  .expanded { height: auto; grid-template-rows: auto auto auto auto; }
  .expanded .illustration { min-height: 0; height: clamp(2rem, 20dvh, 11rem); }
  .expanded .title { font-size: 1.05rem; min-height: 0; }
  .expanded .rules { display: block; font-size: 0.85rem; }
  .expanded .flavor { display: block; }
  @container cards (max-height: 11rem) {
    .face:not(.expanded) .title { font-size: 0.7rem; }
    .face:not(.expanded) .rules { font-size: 0.68rem; }
    .face:not(.expanded) .paper { padding: 0.25rem; }
    .face:not(.expanded) .rules { -webkit-line-clamp: 2; line-clamp: 2; }
    .face:not(.expanded) .ornament { display: none; }
  }
  @container cards (max-height: 8rem) {
    .face:not(.expanded) .paper { display: none; }
  }
</style>
