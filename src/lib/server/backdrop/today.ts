import meta from "#lib/assets/backdrops/meta.json";
import type { PaintingShown, Pictures, PrintShown } from "#lib/backdrop/picture.ts";
import { localDay } from "#lib/time/local-day.ts";
import { PAINTINGS, PRINTS } from "./pictures.ts";

/*
 * The learner's picture of the day, chosen here so no list of pictures reaches the browser. The files are Vite assets
 * (src/lib/assets/backdrops, scripts/backdrops.ts), served from _app/immutable with a year's cache.
 */
const FILES = import.meta.glob<string>("/src/lib/assets/backdrops/*.webp", { query: "?url", import: "default", eager: true });
const urlOf = (id: string, width: number) => {
	const url = FILES[`/src/lib/assets/backdrops/${id}-${width}.webp`];
	if (!url) throw new Error(`backdrop ${id}-${width}.webp is missing: run scripts/backdrops.ts`);
	return url;
};
function shown(id: string, credit: string) {
	const m = (meta as Record<string, { width: number; height: number; color: string }>)[id];
	if (!m) throw new Error(`backdrop ${id} is not in meta.json: run scripts/backdrops.ts`);
	const [big, small] = [urlOf(id, 1600), urlOf(id, 800)];
	return { src: big, srcset: `${small} 800w, ${big} ${m.width}w`, width: m.width, height: m.height, color: m.color, credit };
}

/** One of a series for a local day (`YYYY-MM-DD`), the same all day; consecutive days are far apart in the list (5
 * shares no factor with either series' length). */
export function ofDay<T>(list: readonly T[], day: string): T {
	const n = Math.round(Date.parse(`${day}T00:00:00Z`) / 864e5);
	return list[(((n * 5) % list.length) + list.length) % list.length];
}

/** The day's print and painting for a learner in `timeZone`. */
export function picturesOf(at: Date | number, timeZone: string): Pictures {
	const day = localDay(at, timeZone);
	const p = ofDay(PRINTS, day);
	const q = ofDay(PAINTINGS, day);
	const image: PrintShown = { kind: "image", ...shown(p.id, p.credit), drop: p.bottom, zoom: p.zoom, ink: p.ink ?? 1 };
	const painting: PaintingShown = { kind: "painting", ...shown(q.id, q.credit), x: q.x, y: q.fy ?? 50 };
	return { image, painting };
}
