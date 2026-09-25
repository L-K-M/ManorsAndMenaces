import type { MenaceType, ResourceType } from "@manors-menaces/rules";

// Visual encoding (spec §49): every entity uses colour plus a second channel
// (shape, icon or pattern) so nothing depends on colour alone.

export const RESOURCE_COLORS: Record<ResourceType, { fill: string; dark: string; label: string }> = {
  grain: { fill: "#e9cf6a", dark: "#8a6d12", label: "🌾" },
  timber: { fill: "#6fae5a", dark: "#2d5a24", label: "🌲" },
  stone: { fill: "#b9b3a8", dark: "#5a554d", label: "⛰" },
  iron: { fill: "#8d9aab", dark: "#39424f", label: "⚒" },
  essence: { fill: "#b79be0", dark: "#553b86", label: "✦" },
};

/**
 * Resource silhouettes, centred on 0,0 in a ~20px box, drawn so each reads
 * without colour: a tied wheat sheaf, a fir tree, cut stone blocks, an anvil
 * and a faceted crystal. The board fills them (grain is stroked, since its
 * stalks are open lines); ResourceIcon adds RESOURCE_DETAILS on top.
 */
export const RESOURCE_GLYPHS: Record<ResourceType, string> = {
  grain:
    "M-3,10 Q-1.8,4 -4.6,-1.8 M0,10 L0,-2 M3,10 Q1.8,4 4.6,-1.8 M-3.4,4.6 L3.4,4 " +
    "M0,-2 L-2.3,-3.6 L-1.4,-4.6 L-2.6,-6.2 L-1.5,-7.1 L-2.5,-8.6 L-1.2,-9.4 L0,-11.2 " +
    "L1.2,-9.4 L2.5,-8.6 L1.5,-7.1 L2.6,-6.2 L1.4,-4.6 L2.3,-3.6 Z " +
    "M-4.6,-1.8 L-7.4,-2.1 L-7.1,-3.4 L-8.9,-4.3 L-8.3,-5.6 L-9.9,-6.5 L-9.1,-7.8 L-8.9,-9.9 " +
    "L-7,-8.9 L-5.5,-8.8 L-5.7,-7 L-4.3,-6.7 L-4.6,-4.8 L-3.3,-4.3 Z " +
    "M4.6,-1.8 L3.3,-4.3 L4.6,-4.8 L4.3,-6.7 L5.7,-7 L5.5,-8.8 L7,-8.9 L8.9,-9.9 " +
    "L9.1,-7.8 L9.9,-6.5 L8.3,-5.6 L8.9,-4.3 L7.1,-3.4 L7.4,-2.1 Z",
  timber:
    "M0,-11 Q2.2,-7.6 4.4,-5.2 Q3.3,-4.7 2.3,-4.9 Q4.6,-1.6 7.2,0.4 Q5.6,1.2 3.8,0.9 " +
    "Q6.2,4.2 9,6.2 Q4.6,7.4 1.7,6.6 L1.9,10.4 L-1.9,10.4 L-1.7,6.6 Q-4.6,7.4 -9,6.2 " +
    "Q-6.2,4.2 -3.8,0.9 Q-5.6,1.2 -7.2,0.4 Q-4.6,-1.6 -2.3,-4.9 Q-3.3,-4.7 -4.4,-5.2 Q-2.2,-7.6 0,-11 Z",
  stone:
    "M-9.6,1.4 L-1.2,0.9 L-0.8,9 L-9.8,9.2 Z M0.8,0.9 L9.5,1.3 L9.8,9.1 L0.9,9 Z " +
    "M-4.9,-7.9 L4.6,-8.3 L4.9,-0.7 L-4.6,-0.6 Z",
  iron:
    "M-10.6,-5.2 L9.4,-5.6 L9.4,-1.2 L4.2,-1.2 Q2.4,1.4 3.4,4.2 L7.4,5.6 L7.4,8.6 L-7.4,8.6 " +
    "L-7.4,5.6 L-3.4,4.2 Q-2.4,1.4 -4.2,-1.2 L-5.6,-1.2 Q-8.8,-2 -10.6,-5.2 Z",
  essence:
    "M-1,-10.6 L4.6,-4.6 L4.6,4.4 L-1,10.4 L-6.6,4.4 L-6.6,-4.6 Z " +
    "M7.4,-10.6 Q7.9,-7.9 10.6,-7.4 Q7.9,-6.9 7.4,-4.2 Q6.9,-6.9 4.2,-7.4 Q6.9,-7.9 7.4,-10.6 Z",
};

/** Ink highlights drawn over RESOURCE_GLYPHS in ResourceIcon (hand-drawn detail). */
export const RESOURCE_DETAILS: Record<ResourceType, string> = {
  grain: "M0,-3.4 L0,-9.4 M-5.2,-2.9 L-8.1,-8.3 M5.2,-2.9 L8.1,-8.3",
  timber: "M0,-7.4 L0,6 M0,-3.6 L-1.8,-2.4 M0,-0.4 L2.4,1.2 M0,3 L-3.2,4.8",
  stone: "M-7.6,3.4 L-5.2,6.6 M-4.4,3 L-3.2,4.6 M3.2,3.2 L6,6.8 M-2.6,-5.8 L0.2,-2.6 M1.6,-6 L2.6,-4.6",
  iron: "M-8.4,-4 L8.2,-4.3 M-4.8,6.8 L4.8,6.8",
  essence: "M-1,-10.6 L-1,10.4 M-6.6,-4.6 L-1,-2 L4.6,-4.6 M-6.6,4.4 L-1,2 L4.6,4.4",
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

export const MENACE_THEME: Record<MenaceType, { color: string; glyph: string }> = {
  // Troll: horned head.
  toll_troll: {
    color: "#6b7f3a",
    glyph: "M-11,4 C-11,-9 11,-9 11,4 C11,11 -11,11 -11,4 Z M-9,-5 L-14,-13 L-5,-8 Z M9,-5 L14,-13 L5,-8 Z M-5,1 A2,2 0 1,0 -5,1.1 M5,1 A2,2 0 1,0 5,1.1 M-4,7 L4,7",
  },
  // Dragon: wing and tail.
  young_dragon: {
    color: "#c2452d",
    glyph: "M-12,6 C-6,-2 -2,-12 6,-12 C4,-6 10,-6 12,-2 C6,-2 4,2 8,8 C2,6 -2,10 -12,6 Z M4,-10 L9,-15 L8,-8 Z",
  },
  // Witch: pointed hat.
  bog_witch: {
    color: "#4b6b5a",
    glyph: "M-13,7 L13,7 L6,3 L2,-13 L-3,-6 L-6,3 Z M-3,-6 L-8,-9",
  },
  // Highwayman: mask with eye holes.
  highwayman: {
    color: "#3b3b46",
    glyph: "M-12,-3 C-8,-8 8,-8 12,-3 C10,5 3,5 0,2 C-3,5 -10,5 -12,-3 Z M-6,-2 A2.5,2 0 1,0 -6,-1.9 M6,-2 A2.5,2 0 1,0 6,-1.9",
  },
  // Goblin: head with long ears.
  goblin_tinkers: {
    color: "#5c8a2e",
    glyph: "M-7,2 C-7,-8 7,-8 7,2 C7,9 -7,9 -7,2 Z M-7,-2 L-15,-7 L-7,1 Z M7,-2 L15,-7 L7,1 Z M-3,5 L3,5",
  },
};
