// Board camera (spec §48): pan, zoom, reset and zoom-to-selection. The board
// is an SVG whose viewBox is this rectangle.

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const viewport: { box: ViewBox; full: ViewBox } = $state({
  box: { x: 0, y: 0, w: 1600, h: 1000 },
  full: { x: 0, y: 0, w: 1600, h: 1000 },
});

const MIN_W = 320;

export function setFull(w: number, h: number): void {
  viewport.full = { x: 0, y: 0, w, h };
  viewport.box = { ...viewport.full };
}

export function resetView(): void {
  viewport.box = { ...viewport.full };
}

/** Zoom by `factor` (>1 zooms in) around a point in board coordinates. */
export function zoomAt(factor: number, cx: number, cy: number): void {
  const b = viewport.box;
  const w = Math.min(viewport.full.w * 1.2, Math.max(MIN_W, b.w / factor));
  const h = (w * viewport.full.h) / viewport.full.w;
  const nx = cx - ((cx - b.x) * w) / b.w;
  const ny = cy - ((cy - b.y) * h) / b.h;
  viewport.box = clamp({ x: nx, y: ny, w, h });
}

export function panBy(dx: number, dy: number): void {
  const b = viewport.box;
  viewport.box = clamp({ ...b, x: b.x - dx, y: b.y - dy });
}

export function zoomTo(points: { x: number; y: number }[], padding = 140): void {
  if (points.length === 0) return resetView();
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let w = Math.max(...xs) - Math.min(...xs) + padding * 2;
  let h = Math.max(...ys) - Math.min(...ys) + padding * 2;
  const ratio = viewport.full.w / viewport.full.h;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  w = Math.max(MIN_W, w);
  h = w / ratio;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  viewport.box = clamp({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function clamp(b: ViewBox): ViewBox {
  const f = viewport.full;
  const slackX = f.w * 0.25;
  const slackY = f.h * 0.25;
  return {
    w: b.w,
    h: b.h,
    x: Math.min(f.x + f.w - b.w + slackX, Math.max(f.x - slackX, b.x)),
    y: Math.min(f.y + f.h - b.h + slackY, Math.max(f.y - slackY, b.y)),
  };
}
