<script lang="ts" module>
  // Inline SVG icons, so they render the same everywhere without emoji or
  // symbol fonts. 24px grid, 2px ink stroke, round ends; a few strokes are
  // slightly bowed to keep the hand-inked feel of the resource icons.
  const PATHS = {
    route: "M3 20 L9 4 M15 4 L21 20 M11 7 L13 7 M10.5 11 L13.5 11 M10 15 L14 15 M9.5 19 L14.5 19",
    manor: "M3 11 L12 3 L21 11 M5 10 V21 H19 V10 M10 21 V15 H14 V21",
    stronghold: "M4 21 V7 H7 V4 H10 V7 H14 V4 H17 V7 H20 V21 Z M10 21 V15 A2 2 0 0 1 14 15 V21",
    market: "M12 3 V21 M5 21 H19 M4 7 H20 M4 7 L1.5 13 A2.8 2.8 0 0 0 6.5 13 Z M20 7 L17.5 13 A2.8 2.8 0 0 0 22.5 13 Z",
    writ: "M6 3 H17 A2 2 0 0 1 19 5 V18 A3 3 0 0 1 16 21 H6 A3 3 0 0 1 3 18 V17 H14 V19 M6 3 A2 2 0 0 0 4 5 V17 M8 7 H15 M8 10 H15 M8 13 H13",
    warden: "M5 19 L19 5 M15 5 H19 V9 M4 14 L10 20 M7 17 L4 20",
    card: "M6 3 H18 A1.5 1.5 0 0 1 19.5 4.5 V19.5 A1.5 1.5 0 0 1 18 21 H6 A1.5 1.5 0 0 1 4.5 19.5 V4.5 A1.5 1.5 0 0 1 6 3 Z M12 8 L15 12 L12 16 L9 12 Z",
    menu: "M4 6.5 Q12 5.6 20 6.5 M4 12 Q12 12.8 20 12 M4 17.5 Q12 16.6 20 17.5",
    gear:
      "M12 2.8 V5.2 M12 18.8 V21.2 M2.8 12 H5.2 M18.8 12 H21.2 M5.5 5.5 L7.2 7.2 M16.8 16.8 L18.5 18.5 M5.5 18.5 L7.2 16.8 M16.8 7.2 L18.5 5.5 " +
      "M18.8 12 A6.8 6.8 0 1 1 5.2 12 A6.8 6.8 0 1 1 18.8 12 Z M14.6 12 A2.6 2.6 0 1 1 9.4 12 A2.6 2.6 0 1 1 14.6 12 Z",
    plus: "M12 5 V19 M5 12 H19",
    minus: "M5 12 H19",
    fit: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15",
    locate: "M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5 M18 12 A6 6 0 1 1 6 12 A6 6 0 1 1 18 12 Z M13.2 12 A1.2 1.2 0 1 1 10.8 12 A1.2 1.2 0 1 1 13.2 12 Z",
    close: "M6 6 Q12 12.4 18 18 M18 6 Q12 11.6 6 18",
    crown: "M3.5 18 L4.5 7.5 L9 11.5 L12 4.5 L15 11.5 L19.5 7.5 L20.5 18 Z M4 21 H20",
    hourglass: "M5 3 H19 M5 21 H19 M7 3 V6 Q7 9 12 12 Q17 15 17 18 V21 M17 3 V6 Q17 9 12 12 Q7 15 7 18 V21 M9 6 H15 M9 18 L12 15 L15 18",
    refresh: "M19.5 12.5 A7.5 7.5 0 1 1 16.8 6.2 M20 3.5 V8 H15.5",
    undo: "M9 14 L4 9 L9 4 M4 9 H14 A6 6 0 0 1 14 21 H10",
    home: "M3.5 11.5 L12 4 L20.5 11.5 M6.5 9.5 V20 H17.5 V9.5 M10.5 20 V15 H13.5 V20",
    check: "M4.5 12.5 L9.5 17.5 L19.5 6.5",
    sparkle: "M12 3 L13.9 10.1 L21 12 L13.9 13.9 L12 21 L10.1 13.9 L3 12 L10.1 10.1 Z",
    "arrow-up": "M12 19.5 V5 M6 11 L12 5 L18 11",
    "arrow-down": "M12 4.5 V19 M6 13 L12 19 L18 13",
  } as const;

  export type ToolIconName = keyof typeof PATHS;

  /** Icons drawn as solid shapes rather than outlines. */
  const FILLED: ReadonlySet<ToolIconName> = new Set(["crown", "sparkle"]);
</script>

<script lang="ts">
  let { name, size = 22, label }: { name: ToolIconName; size?: number; label?: string } = $props();
</script>

<svg
  class="tool-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
  fill={FILLED.has(name) ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d={PATHS[name]} />
</svg>

<style>
  .tool-icon {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>
