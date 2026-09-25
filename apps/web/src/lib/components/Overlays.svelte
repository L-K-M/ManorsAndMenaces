<script lang="ts">
  // Victory screen and the entity inspector. The privacy curtain lives in
  // PrivacyCurtain.svelte, outside the game root that it makes inert.
  import { getPlayerHoldings, getRenown } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { regionName } from "../game/log.js";
  import type { GameSession } from "../game/session.svelte.js";
  import { ui } from "../stores/ui.svelte.js";
  import Modal from "./Modal.svelte";

  let { session, onexit, onrematch }: { session: GameSession; onexit: () => void; onrematch: () => void } = $props();
  const gs = $derived(session.authoritative);
  const standings = $derived(
    [...gs.turnOrder].sort((a, b) => getRenown(session.ctx, gs, b) - getRenown(session.ctx, gs, a)),
  );

  const inspectText = $derived.by(() => {
    const p = ui.inspect;
    if (!p) return null;
    const s = session.draft;
    switch (p.kind) {
      case "region": {
        const r = session.map.regions.find((x) => x.id === p.id);
        if (!r) return null;
        const occ = Object.values(s.banners).filter((b) => b.regionId === r.id);
        const menace = Object.values(s.menaces).find((m) => m.location.kind === "region" && m.location.regionId === r.id);
        return {
          title: r.name,
          lines: [
            `${t(`resource.${r.resource}`)} · capacity ${r.capacity}${r.capacity > 1 ? " (rich)" : ""}`,
            occ.length ? `Banners: ${occ.map((b) => `${s.players[b.ownerId]?.displayName}${b.settled ? "" : " (unsettled)"}`).join(", ")}` : "No Banners",
            ...(menace ? [`${t(`menace.${menace.type}.name`)}: ${t(`menace.${menace.type}.rules`)}`] : []),
          ],
        };
      }
      case "site": {
        const site = session.map.sites.find((x) => x.id === p.id);
        if (!site) return null;
        const h = Object.values(s.holdings).find((x) => x.siteId === site.id);
        return {
          title: site.landmarkId ? t(`landmark.${site.landmarkId}`) : h ? t(`holding.${h.type}`) : "Site",
          lines: [
            h ? `${t(`holding.${h.type}`)} of ${s.players[h.ownerId]?.displayName}` : "Empty site",
            `Touches: ${site.adjacentRegionIds.map((r) => regionName(session.map, r)).join(", ")}`,
            ...(site.tradePost ? [`Trading Post: 2 ${t(`resource.${site.tradePost.resource}`)} → 1 of anything`] : []),
          ],
        };
      }
      case "menace": {
        const m = s.menaces[p.id];
        if (!m) return null;
        const hoard = Object.entries(m.state.hoard ?? {}).filter(([, n]) => (n ?? 0) > 0);
        return {
          title: t(`menace.${m.type}.name`),
          lines: [t(`menace.${m.type}.rules`), `“${t(`menace.${m.type}.flavor`)}”`, ...(hoard.length ? [`Hoard: ${hoard.map(([r, n]) => `${n} ${t(`resource.${r}`)}`).join(", ")}`] : [])],
        };
      }
      case "banner": {
        const b = s.banners[p.id];
        if (!b) return null;
        return {
          title: `${s.players[b.ownerId]?.displayName}'s Banner`,
          lines: [b.regionId ? `In ${regionName(session.map, b.regionId)}` : "At home (unassigned)", b.settled ? "Settled — can be targeted by a Royal Writ" : "Unsettled — protected from Royal Writs until it harvests"],
        };
      }
      case "route": {
        const owner = s.routeOwners[p.id];
        return { title: "Route", lines: [owner ? `Owned by ${s.players[owner]?.displayName}` : "Unowned", t("cost.route")] };
      }
      default:
        return null;
    }
  });
</script>

{#if gs.status === "finished"}
  <Modal title={t("ui.victory")}>
    <p class="winner">
      <b>{gs.players[gs.winnerId ?? ""]?.displayName}</b> wins with {getRenown(session.ctx, gs, gs.winnerId ?? "")} Renown in round {gs.round}.
    </p>
    <ol class="standings">
      {#each standings as pid}
        <li>
          {gs.players[pid]?.displayName} — {getRenown(session.ctx, gs, pid)} Renown,
          {getPlayerHoldings(gs, pid).length} Holdings, {gs.players[pid]?.claimedQuestIds.length} Quests
        </li>
      {/each}
    </ol>
    <div class="row">
      <button class="primary" onclick={onrematch}>{t("ui.play_again")}</button>
      <button onclick={onexit}>{t("ui.main_menu")}</button>
    </div>
  </Modal>
{/if}

{#if inspectText}
  <aside class="inspect" aria-live="polite">
    <header>
      <strong>{inspectText.title}</strong>
      <button class="close" aria-label={t("ui.close")} onclick={() => (ui.inspect = null)}>✕</button>
    </header>
    {#each inspectText.lines as line}<p>{line}</p>{/each}
  </aside>
{/if}

<style>
  .winner {
    font-size: 1.1rem;
  }
  .standings {
    padding-left: 1.2rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .inspect {
    position: absolute;
    left: 0.75rem;
    top: 0.75rem;
    max-width: 19rem;
    background: var(--paper);
    border: 2px solid #8a7650;
    border-radius: 10px;
    padding: 0.5rem 0.7rem;
    box-shadow: 0 6px 20px #0003;
    z-index: 5;
    font-size: 0.88rem;
  }
  .inspect header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .inspect p {
    margin: 0.2rem 0;
  }
  .close {
    min-height: 32px;
    min-width: 32px;
    padding: 0;
  }
</style>
