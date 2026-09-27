<script lang="ts">
  // Permanent ruins and a rebuildable burned site have different silhouettes,
  // not just different colours. Keep both within the empty site's hit area.
  let { kind }: { kind: "ruined" | "razed" } = $props();
</script>

<g class="site-remains {kind}" aria-hidden="true">
  <ellipse cx="1.5" cy="8" rx="14" ry="4.5" fill="#241c12" opacity="0.25" />
  <path d="M-14,4 L-8,-1 L9,-2 L14,4 L9,9 L-9,10 Z" fill="#d9c9a4" stroke="#493a28" stroke-width="1.3" stroke-linejoin="round" />
  {#if kind === "ruined"}
    <!-- A roofless, broken arch with ivy: this site is lost for good. -->
    <path d="M-11,6 V-6 L-8,-9 L-6,-6 L-3,-8 L-2,-3 V6 Z" fill="#ead9b4" stroke="#493a28" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M2,6 V-7 L5,-10 L5,-14 L10,-14 V-8 L12,-6 V6 Z" fill="#c7b48e" stroke="#493a28" stroke-width="1.6" stroke-linejoin="round" />
    <path d="M-3,-3 Q0,-9 4,-6 M6,-10 H9 M7,-6 H11 M-10,-2 H-6 M-9,3 H-4 M8,0 H11" fill="none" stroke="#806d50" stroke-width="1.1" />
    <path d="M4,-3 L6,-1 L4,2 L6,5" fill="none" stroke="#493a28" stroke-width="1.2" />
    <path d="M-13,6 Q-6,5 -7,-3 M-7,1 Q-3,0 -2,2" fill="none" stroke="#36502c" stroke-width="1.6" stroke-linecap="round" />
    <path d="M-7,-1 Q-13,-4 -10,1 Q-8,3 -7,-1 M-6,3 Q-2,-1 -1,3 Q-3,5 -6,3" fill="#678644" stroke="#36502c" stroke-width="0.8" />
    <path d="M-2,6 L0,3 L4,4 L5,7 Z M8,8 L10,5 L13,6 L12,8 Z M-12,8 L-10,6 L-7,7 L-8,9 Z" fill="#b5a588" stroke="#493a28" stroke-width="1" />
  {:else}
    <!-- An open foundation, charred rafters and embers: rebuilding is possible. -->
    <path d="M-10,5 L-9,-4 L-7,-5 L-6,4 M5,5 L7,-6 L10,-7 L9,4" fill="#534538" stroke="#30271f" stroke-width="1.8" stroke-linejoin="round" />
    <path d="M-10,3 L9,-2 M-8,-2 L10,5" fill="none" stroke="#3e3026" stroke-width="2.8" stroke-linecap="round" />
    <path d="M-8,3 L-5,2 M5,0 L8,-1 M5,3 L8,4" stroke="#e68b42" stroke-width="1.2" stroke-linecap="round" />
    <path d="M-4,3 C-9,-2 -3,-5 -4,-11 C2,-8 0,-5 3,-6 C8,0 4,5 -1,5 Z" fill="#e66d2d" stroke="#71351d" stroke-width="1.3" />
    <path d="M-2,3 Q-4,0 -1,-4 Q-1,-1 1,-2 Q4,3 -2,3" fill="#ffe092" />
    <path d="M-11,7 L-8,5 M6,7 L10,6 M-3,8 L0,7" stroke="#f19b4a" stroke-width="1.8" stroke-linecap="round" />
  {/if}
</g>
