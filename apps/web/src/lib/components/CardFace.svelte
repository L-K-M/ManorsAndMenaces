<script lang="ts">
  import type { CardRulesDefinition } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import ToolIcon from "./ToolIcon.svelte";
  import CardArt from "./CardArt.svelte";

  /**
   * How much of the card to draw, and at what size:
   * - "glance": title, painting and type ribbon, filling the box it is given
   *   (the desktop dock, the play flourish). Rules are left to a preview
   *   rather than cut down to an unreadable fragment.
   * - "full": the whole card, rules and flavour included (a phone's hand).
   * - "read": the whole card at reading size (previews, the card viewer).
   */
  let { def, view = "full" }: { def: CardRulesDefinition; view?: "glance" | "full" | "read" } = $props();
</script>

<span class="face {def.type} {view}">
  <strong class="title">{t(`card.${def.id}.name`)}</strong>
  <span class="illustration"><CardArt id={def.effectId} type={def.type} /></span>
  <span class="ribbon"><span aria-hidden="true"><ToolIcon name="sparkle" size={8} /></span> {t(`card.type.${def.type}`)}{def.timing.includes("reaction") ? t("card.reaction_suffix") : ""} <span aria-hidden="true"><ToolIcon name="sparkle" size={8} /></span></span>
  {#if view !== "glance"}
    <span class="paper">
      <span class="rules">{t(`card.${def.id}.rules`)}</span>
      <em class="flavor">{t(`card.${def.id}.flavor`)}</em>
      <span class="ornament" aria-hidden="true"><ToolIcon name="sparkle" size={6} /></span>
    </span>
  {/if}
</span>

<style>
  /* Text sizes are floors for legibility: at the default Text size, rules
     14 px and titles 15 px, and 16 px rules when reading a card. A box too
     small for them shows less of the card rather than smaller text.
     A flex column: each part spans the card's width, so a long title wraps
     inside it; a dropped part leaves no gap; and a painting keeps its
     aspect ratio. */
  .face {
    --suit: #843d35;
    display: flex;
    flex-direction: column;
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
  /* A column flexbox stretches the text to the plate's width, so a word
     longer than a narrow card breaks instead of spilling past the edge. */
  .title {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: safe center;
    min-height: 2.5em;
    padding: 0.2rem 0.25rem;
    border: 1px solid #d7b775;
    border-radius: 6px 6px 2px 2px;
    background: linear-gradient(110deg, #dfc891, #fff3cf 45%, #e5ca92);
    font: 700 0.95rem/1.1 var(--font-display);
    text-align: center;
    text-wrap: balance;
    overflow-wrap: break-word;
  }
  .illustration {
    flex: none;
    display: block;
    min-height: 0;
    overflow: hidden;
    border: 1px solid #d7b775;
    border-radius: 3px 3px 12% 12%;
  }
  .ribbon {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.15rem;
    padding: 0.08rem 0.2rem;
    color: #fff0c5;
    font: 700 0.7rem/1.2 var(--font-body);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
  }
  .ribbon > span { color: #dfbd6f; }
  /* A taller neighbour in the hand stretches the parchment, not the art. */
  .paper {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    padding: 0.45rem 0.5rem 0.15rem;
    background: var(--paper-sheet);
    border: 1px solid #d7b775;
    border-radius: 2px 2px 6px 6px;
  }
  .rules {
    font: 400 0.875rem/1.3 var(--font-body);
  }
  /* The label face's true italic: the display face has small capitals only,
     which made whole sentences hard to read. */
  .flavor {
    margin-top: 0.45rem;
    padding-top: 0.35rem;
    border-top: 1px solid #ae8b4955;
    color: #655342;
    font: italic 400 0.85rem/1.3 var(--font-label);
  }
  .ornament {
    color: #94703d;
    font-size: 0.5rem;
    margin-top: auto;
    text-align: center;
  }

  /* The painting takes whatever height the title and ribbon leave. A dock
     too short for them (HandPanel) drops the ribbon, then the painting: a
     half-clipped ribbon or a sliver of art would look broken, and the
     card's colour still shows its type. Only these narrow cards may need
     to hyphenate a long word; the browser hyphenates only words of ten
     letters or more, where it has a dictionary. */
  .glance { padding: 0.3rem; }
  .glance .title {
    -webkit-hyphens: auto;
    hyphens: auto;
    hyphenate-limit-chars: 10 4 4;
  }
  .glance .illustration { flex: 1 1 0; display: var(--glance-art, block); }
  .glance .ribbon { display: var(--glance-ribbon, flex); }

  /* The painting keeps its proportions as phone cards widen. */
  .full .illustration { aspect-ratio: 16 / 9; }

  .read {
    height: auto;
    padding: 0.5rem;
    gap: 0.3rem;
  }
  .read .illustration { height: clamp(2rem, 20dvh, 11rem); }
  .read .title { min-height: 0; font-size: 1.25rem; }
  .read .ribbon { font-size: 0.75rem; }
  .read .paper { padding: 0.6rem 0.7rem 0.2rem; }
  .read .rules { font-size: 1rem; line-height: 1.35; }
  .read .flavor { font-size: 0.95rem; }
</style>
