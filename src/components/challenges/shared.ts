// ukuran grid SVG yang konsisten dengan backend
export const PAD = 6;
export const CELL = 56;

export function round(n: number, p = 1) {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

/* =========================
 *  SPATIAL – parser & math
 * ========================= */

// ambil posisi marker merah dari SVG opsi (untuk route/reflect)
export function getMarkerCellFromSvg(svg: string, grid: number) {
  const cx = parseFloat((svg.match(/<circle[^>]*fill="#ef4444"[^>]*cx="([\d.]+)"/)?.[1] || "NaN"));
  const cy = parseFloat((svg.match(/<circle[^>]*fill="#ef4444"[^>]*cy="([\d.]+)"/)?.[1] || "NaN"));
  if (isNaN(cx) || isNaN(cy)) return null;
  const c = Math.round((cx - PAD - CELL / 2) / CELL);
  const r = Math.round((cy - PAD - CELL / 2) / CELL);
  if (r < 0 || c < 0 || r >= grid || c >= grid) return null;
  return [r, c] as [number, number];
}

// ambil pusat landmark (kotak/lingkaran/segitiga) dari SVG opsi rotasi
export function getLandmarkCentersFromSvg(svg: string) {
  const rects = [...svg.matchAll(/<rect[^>]*width="24"[^>]*height="24"[^>]*fill="#eab308"[^>]*x="([\d.]+)".*?y="([\d.]+)"/g)]
    .map(m => [parseFloat(m[1]) + 12, parseFloat(m[2]) + 12]);

  const circs = [...svg.matchAll(/<circle[^>]*fill="#eab308"[^>]*cx="([\d.]+)".*?cy="([\d.]+)".*?r="12"/g)]
    .map(m => [parseFloat(m[1]), parseFloat(m[2])]);

  const polys = [...svg.matchAll(/<polygon[^>]*fill="#eab308"[^>]*points="([^"]+)"/g)].map(m => {
    const pts = m[1].trim().split(/\s+/).map(p => p.split(",").map(Number));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    return [cx, cy] as [number, number];
  });

  return [...rects, ...circs, ...polys].map(p => [round(p[0]), round(p[1])] as [number, number]);
}

export function rot90([r, c]: [number, number], n: number): [number, number] {
  return [c, n - 1 - r];
}

export function rotateGridPoints(pts: [number, number][], n: number, deg: number) {
  const times = Math.floor(deg / 90) % 4;
  const apply = (p: [number, number]) => {
    let cur = p;
    for (let i = 0; i < times; i++) cur = rot90(cur, n);
    return cur;
  };
  return pts.map(apply);
}

export function gridToPixelCenters(pts: [number, number][]) {
  return pts
    .map(([r, c]) => [PAD + c * CELL + CELL / 2, PAD + r * CELL + CELL / 2] as [number, number])
    .map(([x, y]) => [round(x), round(y)] as [number, number]);
}

export function sameCenters(a: [number, number][], b: [number, number][]) {
  if (a.length !== b.length) return false;
  const tol = 2;
  const used = new Array(b.length).fill(false);
  for (const [ax, ay] of a) {
    let ok = false;
    for (let i = 0; i < b.length; i++) {
      if (used[i]) continue;
      const [bx, by] = b[i];
      if (Math.abs(ax - bx) <= tol && Math.abs(ay - by) <= tol) {
        used[i] = true; ok = true; break;
      }
    }
    if (!ok) return false;
  }
  return true;
}

/* =========================
 *  SPATIAL – renderer base
 * ========================= */

// bikin SVG peta dari data "render.base" backend (dipakai di Spatial)
export function buildMapSVG(
  grid: number,
  base: { roads?: [number, number][][]; river?: [number, number][]; landmarks?: any[]; north?: string } = {},
  opts: { marker?: [number, number] | null; axis?: any } = {}
) {
  const size = CELL * grid;
  const pad = PAD, cell = CELL;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`);
  parts.push(`<rect width="${size}" height="${size}" fill="#0B1020" rx="12" ry="12" />`);
  // grid
  for (let i = 0; i <= grid; i++) {
    const y = pad + i * cell, x = pad + i * cell;
    parts.push(`<line x1="${pad}" y1="${y}" x2="${size - pad}" y2="${y}" stroke="#1f2937" stroke-width="1"/>`);
    parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${size - pad}" stroke="#1f2937" stroke-width="1"/>`);
  }
  // roads
  (base.roads || []).forEach(([a, b]) => {
    const [r1, c1] = a, [r2, c2] = b;
    const x1 = pad + c1 * cell + cell / 2, y1 = pad + r1 * cell + cell / 2;
    const x2 = pad + c2 * cell + cell / 2, y2 = pad + r2 * cell + cell / 2;
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="6"/>`);
  });
  // river
  if ((base.river || []).length >= 2) {
    const pts = (base.river || []).map(([r, c]) => {
      const x = pad + c * cell + cell / 2, y = pad + r * cell + cell / 2;
      return `${x},${y}`;
    }).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="#38bdf8" stroke-width="6" opacity="0.9"/>`);
  }
  // axis (refleksi)
  if (opts.axis) {
    if (opts.axis.type === "vertical") {
      const x = pad + opts.axis.x * cell + cell / 2;
      parts.push(`<line x1="${x}" y1="${pad}" x2="${x}" y2="${size - pad}" stroke="#22c55e" stroke-width="2"/>`);
    } else {
      const y = pad + opts.axis.y * cell + cell / 2;
      parts.push(`<line x1="${pad}" y1="${y}" x2="${size - pad}" y2="${y}" stroke="#22c55e" stroke-width="2"/>`);
    }
  }
  // landmarks
  (base.landmarks || []).forEach((lm: any) => {
    const [r, c] = lm.pos;
    const cx = pad + c * cell + cell / 2;
    const cy = pad + r * cell + cell / 2;
    const col = "#eab308";
    if (lm.icon === "circle") {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="12" fill="${col}" />`);
    } else if (lm.icon === "triangle") {
      parts.push(`<polygon points="${cx},${cy - 14} ${cx - 12},${cy + 10} ${cx + 12},${cy + 10}" fill="${col}" />`);
    } else {
      parts.push(`<rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="4" ry="4" fill="${col}" />`);
    }
    parts.push(`<text x="${cx}" y="${cy + 28}" fill="#cbd5e1" font-size="12" text-anchor="middle">${lm.name || ""}</text>`);
  });
  // marker (opsional)
  if (opts.marker) {
    const [r, c] = opts.marker;
    const x = pad + c * cell + cell / 2, y = pad + r * cell + cell / 2;
    parts.push(`<circle cx="${x}" cy="${y}" r="8" fill="#ef4444" />`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

/* =========================
 *  NUMERICAL – helpers
 * ========================= */

export function safeEval(expr: string) {
  const s = expr.replace(/×/g, "*").replace(/÷/g, "/");
  if (!/^[0-9+\-*/().\s]+$/.test(s)) throw new Error("invalid characters");
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${s});`)();
}

export function usesExactly(expr: string, nums: number[]) {
  const lits = (expr.match(/\d+/g) || []).map(Number);
  const need: Record<number, number> = {};
  const got: Record<number, number> = {};
  nums.forEach(v => (need[v] = (need[v] || 0) + 1));
  lits.forEach(v => (got[v] = (got[v] || 0) + 1));
  const keys = new Set([...Object.keys(need), ...Object.keys(got)]);
  for (const k of keys) if ((need as any)[k] !== (got as any)[k]) return false;
  return true;
}
