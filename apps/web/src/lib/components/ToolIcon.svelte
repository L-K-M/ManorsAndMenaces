<script lang="ts">
  // Inline SVG tool icons, so they render without emoji/symbol fonts.
  let { name, size = 22 }: { name: "route" | "manor" | "stronghold" | "market" | "writ" | "warden" | "card"; size?: number } = $props();
  const PATHS: Record<string, string> = {
    route: "M3 20 L9 4 M15 4 L21 20 M11 7 L13 7 M10.5 11 L13.5 11 M10 15 L14 15 M9.5 19 L14.5 19",
    manor: "M3 11 L12 3 L21 11 M5 10 V21 H19 V10 M10 21 V15 H14 V21",
    stronghold: "M4 21 V7 H7 V4 H10 V7 H14 V4 H17 V7 H20 V21 Z M10 21 V15 A2 2 0 0 1 14 15 V21",
    market: "M12 3 V21 M5 21 H19 M4 7 H20 M4 7 L1.5 13 A2.8 2.8 0 0 0 6.5 13 Z M20 7 L17.5 13 A2.8 2.8 0 0 0 22.5 13 Z",
    writ: "M6 3 H17 A2 2 0 0 1 19 5 V18 A3 3 0 0 1 16 21 H6 A3 3 0 0 1 3 18 V17 H14 V19 M6 3 A2 2 0 0 0 4 5 V17 M8 7 H15 M8 10 H15 M8 13 H13",
    warden: "M5 19 L19 5 M15 5 H19 V9 M4 14 L10 20 M7 17 L4 20",
    card: "M6 3 H18 A1.5 1.5 0 0 1 19.5 4.5 V19.5 A1.5 1.5 0 0 1 18 21 H6 A1.5 1.5 0 0 1 4.5 19.5 V4.5 A1.5 1.5 0 0 1 6 3 Z M12 8 L15 12 L12 16 L9 12 Z",
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d={PATHS[name]} />
</svg>
