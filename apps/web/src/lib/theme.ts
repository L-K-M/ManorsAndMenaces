import type { ResourceType } from "@manors-menaces/rules";

// Visual encoding (spec §49): every entity uses colour plus a second channel
// (shape, icon or pattern) so nothing depends on colour alone.

export const RESOURCE_COLORS: Record<ResourceType, { fill: string; dark: string; label: string }> = {
  grain: { fill: "#e9cf6a", dark: "#8a6d12", label: "🌾" },
  timber: { fill: "#6fae5a", dark: "#2d5a24", label: "🌲" },
  stone: { fill: "#b9b3a8", dark: "#5a554d", label: "⛰" },
  iron: { fill: "#8d9aab", dark: "#39424f", label: "⚒" },
  essence: { fill: "#b79be0", dark: "#553b86", label: "✦" },
};

/** Small SVG glyph paths for resources, centred on 0,0 in a ~20px box. */
export const RESOURCE_GLYPHS: Record<ResourceType, string> = {
  grain: "M0,9 L0,-6 M0,-6 C-4,-8 -5,-3 0,-1 M0,-6 C4,-8 5,-3 0,-1 M0,-1 C-4,-3 -5,2 0,4 M0,-1 C4,-3 5,2 0,4 M0,-6 L0,-10",
  timber: "M0,-10 L7,2 L3,2 L8,8 L-8,8 L-3,2 L-7,2 Z M0,8 L0,11",
  stone: "M-9,7 L-4,-4 L0,1 L4,-7 L9,7 Z",
  iron: "M-8,-3 L4,-3 L4,-7 L8,-7 L8,5 L4,5 L4,1 L-8,1 Z M-2,1 L-2,9 L1,9 L1,1",
  essence: "M0,-10 L2.5,-2.5 L10,0 L2.5,2.5 L0,10 L-2.5,2.5 L-10,0 L-2.5,-2.5 Z",
};

export interface PlayerTheme {
  color: string;
  light: string;
  dark: string;
  /** Heraldic shape of the player's emblem. */
  shape: "shield" | "circle" | "diamond" | "square";
  name: string;
}

export const PLAYER_THEMES: PlayerTheme[] = [
  { color: "#c8403a", light: "#f3b6ad", dark: "#6e1b16", shape: "shield", name: "Crimson" },
  { color: "#2f6fd6", light: "#aecaf5", dark: "#153a78", shape: "circle", name: "Azure" },
  { color: "#d19a12", light: "#f5dc98", dark: "#6b4c00", shape: "diamond", name: "Gold" },
  { color: "#7d43b0", light: "#d4b8ee", dark: "#3d1a5e", shape: "square", name: "Violet" },
];

export function emblemPath(shape: PlayerTheme["shape"], r = 6): string {
  switch (shape) {
    case "shield":
      return `M${-r},${-r} L${r},${-r} L${r},${r * 0.2} Q${r},${r} 0,${r * 1.3} Q${-r},${r} ${-r},${r * 0.2} Z`;
    case "circle":
      return `M${-r},0 A${r},${r} 0 1,0 ${r},0 A${r},${r} 0 1,0 ${-r},0 Z`;
    case "diamond":
      return `M0,${-r * 1.25} L${r * 1.1},0 L0,${r * 1.25} L${-r * 1.1},0 Z`;
    case "square":
      return `M${-r},${-r} L${r},${-r} L${r},${r} L${-r},${r} Z`;
  }
}
