// @ts-nocheck: string-built SVG art, kept as it was first drawn (plain HTML strings).
/* The wallpapers behind the home page and the scene card: small repeated motifs over the whole page. (The pictures,
   the other kind of backdrop, are chosen on the server: server/backdrop.) */

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb) =>
	`#${rgb
		.map((v) =>
			Math.round(Math.max(0, Math.min(255, v)))
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));

/* A wallpaper: one plain colour over the whole page with small motifs repeated, wide gaps between them, like a
   printed bedsheet. Motifs are cut-paper shapes (almond leaves, petals, a fan, a snowflake) on single even stems. */
const MOTIFS = {
	leaf: (c) => `<path d="M0 -15C8 -7 8 7 0 15C-8 7 -8 -7 0 -15Z" fill="${c}"/>`,
	sprig: (a, b) =>
		`<path d="M0 30Q4 0 -2 -30" fill="none" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>${[
			[-1, 14, -50],
			[2, 0, 48],
			[-1, -14, -46],
			[0, -28, 0],
		]
			.map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) translate(0 -13) scale(0.8)">${MOTIFS.leaf(a)}</g>`)
			.join("")}`,
	blossom: (a, b) =>
		`<path d="M0 32Q-6 4 2 -22" fill="none" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>${[
			[2, -22, 1],
			[-14, -4, 0.8],
			[10, 8, 0.7],
		]
			.map(
				([x, y, k]) =>
					`<g transform="translate(${x} ${y}) scale(${k})">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="0" cy="-7" rx="5" ry="7" fill="${a}" transform="rotate(${r})"/>`).join("")}<circle r="3.5" fill="${b}"/></g>`,
			)
			.join("")}<g transform="translate(-4 20) rotate(-60) translate(0 -11) scale(0.6)">${MOTIFS.leaf(b)}</g>`,
	wheat: (a, b) =>
		`<path d="M0 32V-26" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>${[-20, -11, -2, 7].map((y) => `<ellipse cx="-5" cy="${y}" rx="3.6" ry="6.5" fill="${a}" transform="rotate(-28 -5 ${y})"/><ellipse cx="5" cy="${y}" rx="3.6" ry="6.5" fill="${a}" transform="rotate(28 5 ${y})"/>`).join("")}<ellipse cx="0" cy="-29" rx="3.4" ry="6" fill="${a}"/>`,
	ginkgo: (a, b) =>
		`<path d="M0 26Q2 10 0 0" fill="none" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/><path d="M0 0L-20 -20Q-12 -30 -2 -26L0 -20L2 -26Q12 -30 20 -20Z" fill="${a}"/>`,
	berries: (a, b) =>
		`<path d="M-14 20Q0 4 14 -18" fill="none" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>${[
			[14, -18],
			[6, -6],
			[-4, 6],
			[9, -13],
		]
			.map(([x, y], i) => `<circle cx="${x + (i % 2 ? 5 : -4)}" cy="${y}" r="4.2" fill="${a}"/>`)
			.join("")}`,
	flake: (a) =>
		`<g fill="${a}">${[0, 60, 120].map((r) => `<rect x="-1.6" y="-20" width="3.2" height="40" rx="1.6" transform="rotate(${r})"/>${[-1, 1].map((s) => `<rect x="-1.4" y="-8" width="2.8" height="9" rx="1.4" transform="rotate(${r}) translate(0 ${s * 12}) rotate(${s * 45})"/><rect x="-1.4" y="-8" width="2.8" height="9" rx="1.4" transform="rotate(${r}) translate(0 ${s * 12}) rotate(${-s * 45})"/>`).join("")}`).join("")}<circle r="4"/></g>`,
	needles: (a, b) =>
		`<path d="M0 30V-28" stroke="${b}" stroke-width="1.8" stroke-linecap="round"/>${[-22, -13, -4, 5, 14].map((y) => `<path d="M0 ${y}L-13 ${y - 9}L-12 ${y - 6}Z M0 ${y}L13 ${y - 9}L12 ${y - 6}Z" fill="${a}" stroke="${a}" stroke-width="1.6" stroke-linejoin="round"/>`).join("")}`,
};
// The wallpapers the learner can pick: two inks, the motifs, and how they are laid out.
export const PATTERNS = {
	blossom: { inks: ["#e3a9a9", "#9caf86"], a: "blossom", b: "sprig", layout: "sprig" },
	wheat: { inks: ["#d9a47a", "#8ea36f"], a: "wheat", b: "sprig", layout: "stripes" },
	ginkgo: { inks: ["#d08756", "#a88f62"], a: "ginkgo", b: "berries", layout: "lattice" },
	snow: { inks: ["#9fb6d2", "#8d9ab0"], a: "flake", b: "needles", layout: "sprig" },
};
/** The wallpaper as HTML, in the light or the dark theme's inks. */
export function patternHtml(name, dark) {
	const p = PATTERNS[name] ?? PATTERNS.blossom;
	const layout = p.layout;
	// After dark the inks sink toward the charcoal and the small dots between motifs become stars.
	const night = dark && "#d9d3c0";
	const [a, b] = p.inks.map((c) => (dark ? mix(c, "#18191f", 0.5) : c));
	const dot = (x, y, k = 1) =>
		night
			? `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -7L1.8 -1.8L7 0L1.8 1.8L0 7L-1.8 1.8L-7 0L-1.8 -1.8Z" fill="${night}"/>`
			: `<g transform="translate(${x} ${y}) scale(${k})" fill="${b}"><circle cx="-4" r="2.2"/><circle cx="4" r="2.2"/><circle cy="-6" r="2.2"/></g>`;
	let w = 240;
	let h = 240;
	let body: string;
	if (layout === "stripes") {
		// Columns between fine keylines, one motif and one small mark per column, the next column half a step down.
		w = 140;
		h = 260;
		const line = `<rect x="0" y="0" width="1.2" height="${h}" fill="${b}" opacity="0.55"/><rect x="${w / 2}" y="0" width="1.2" height="${h}" fill="${b}" opacity="0.55"/>`;
		body = `${line}<g transform="translate(${w / 4} 70) scale(0.72)">${MOTIFS[p.a](a, b)}</g>${dot(w / 4, 180, 0.8)}<g transform="translate(${(w * 3) / 4} 200) scale(0.72)">${MOTIFS[p.a](a, b)}</g><g transform="translate(${(w * 3) / 4} -60) scale(0.72)">${MOTIFS[p.a](a, b)}</g>${dot((w * 3) / 4, 70, 0.8)}`;
	} else if (layout === "lattice") {
		// A trellis of fine diagonals, a motif in each diamond and a mark where the lines cross.
		w = 180;
		h = 180;
		body = `<path d="M0 0L${w} ${h}M${w} 0L0 ${h}M${w / 2} -${h / 2}L${w * 1.5} ${h / 2}M-${w / 2} ${h / 2}L${w / 2} ${h * 1.5}M${w / 2} -${h / 2}L-${w / 2} ${h / 2}M${w * 1.5} ${h / 2}L${w / 2} ${h * 1.5}" stroke="${b}" stroke-width="1.2" opacity="0.5"/><g transform="translate(${w / 2} ${h / 2 + 4}) scale(0.62)">${MOTIFS[p.b](a, b)}</g>${dot(0, 0, 0.6)}${dot(w, 0, 0.6)}${dot(0, h, 0.6)}${dot(w, h, 0.6)}<g transform="translate(0 ${h / 2 + 4}) scale(0.5)">${MOTIFS[p.a](a, b)}</g><g transform="translate(${w} ${h / 2 + 4}) scale(0.5)">${MOTIFS[p.a](a, b)}</g>`;
	} else {
		body = `<g transform="translate(60 64) rotate(-14)">${MOTIFS[p.a](a, b)}</g>
		<g transform="translate(180 184) rotate(12)">${MOTIFS[p.b](b, b)}</g>
		<g transform="translate(180 -56) rotate(12)">${MOTIFS[p.b](b, b)}</g>
		${dot(180, 64)}${dot(60, 184)}`;
	}
	const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
	return `<div class="pattern" style="background-size:${w * 1.15}px ${h * 1.15}px;background-image:url('data:image/svg+xml,${encodeURIComponent(tile.replace(/\s+/g, " "))}')"></div>`;
}
