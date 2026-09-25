// In-game layout selection (spec §53). GameScreen sets the result as
// `data-layout` and its CSS keys off that attribute instead of media queries,
// so the layout rules live in one place and scripts (focus handling, the
// action sheet) always agree with what is on screen.
//
//   wide  ┌──────────── top ────────────┐   rail  ┌──────── top ────────┐
//         │ board              │ panels │         │ board        │ dock │
//         ├──────────── dock ──────────-┤         └──────────────┴──────┘
//
//   sheet ┌──── top ────┐   The dock is a bottom action sheet: a fixed peek
//         │ board       │   row, with a tray (harvest preview and hand) that
//         ├─── dock ────┤   expands upward over the board on demand.
//
// In `rail` and `sheet` the panels (players, quests, log) are a slide-over.

export type GameLayout = "wide" | "rail" | "sheet";

/** At or below this width there is no room for a panel column. */
export const NARROW_MAX_WIDTH = 900;
/** At or below this height a landscape screen cannot afford a bottom dock. */
export const SHORT_MAX_HEIGHT = 560;

export function layoutFor(width: number, height: number): GameLayout {
  if (height <= SHORT_MAX_HEIGHT && width > height) return "rail";
  if (width <= NARROW_MAX_WIDTH) return "sheet";
  return "wide";
}

/** Whether the players/quests/log panel slides over the board. */
export function hasSlideOverPanel(layout: GameLayout): boolean {
  return layout !== "wide";
}
