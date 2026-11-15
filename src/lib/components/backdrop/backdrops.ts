// @ts-nocheck: string-built SVG art, kept as it was first drawn (plain HTML strings).
/* The backdrop behind the home page and the scene card, as the learner set it in their preferences: nothing, a
   wallpaper of small repeated motifs, or an old print, a different one each day. Neither follows the clock or the
   season. (The drawn landscapes they replace are kept on the archive/drawn-backdrops branch.) */

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

/* Old prints: public-domain (CC0) etchings from Wikimedia Commons, linked rather than copied while we choose. Each is
   printed into the paper (multiply), its sky fading out (`ink` lightens one darker than the rest); in the dark theme it is inverted and screened so its lines
   turn pale on the charcoal. `bottom` and `zoom` push the plate's edge and caption past the page's edges. Most are
   from one series (Diverses paisages, Rijksmuseum), so the days change the picture, not the hand. */
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb";
const PRINTS = [
	{
		file: "a/a6/Rembrandt_van_Rijn%2C_Landscape_with_a_View_toward_Haarlem_%28The_Goldweigher%27s_Field%29%2C_1651%2C_NGA_35129.jpg",
		bottom: 3,
		zoom: 1.05,
		credit: "Rembrandt, The Goldweigher's Field, 1651 (NGA, CC0)",
	},
	{
		file: "1/13/Windmolen_in_vlak_landschap_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.045.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Windmill in a flat landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "9/92/Kustlandschap_met_schepen_voor_kust_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.043.jpg",
		bottom: 27,
		zoom: 1.1,
		credit: "Coast with ships, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "f/f2/Boerinnen_steken_met_kudde_rivier_over_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.037.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Shepherdesses crossing a river with their flock, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "b/b4/Kustlandschap_met_boten_op_de_kant_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.042.jpg",
		bottom: 25,
		zoom: 1.1,
		credit: "Coast with boats drawn up on the shore, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "6/66/Landschap_met_brug_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.029.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Landscape with a bridge, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "0/08/Landschap_met_hertenjacht_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.040.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Landscape with a stag hunt, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "f/f1/Landschap_met_visser%2C_boom_en_ruiters_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.041.jpg",
		bottom: 23,
		zoom: 1.1,
		credit: "Landscape with an angler, a tree and riders, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "d/d1/Spinnende_herderin_met_kudde_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.046.jpg",
		bottom: 19,
		zoom: 1.1,
		credit: "Shepherdess spinning with her flock, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "c/ce/Tekenaar_en_herder_in_landschap_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.047.jpg",
		bottom: 28,
		zoom: 1.1,
		credit: "Draughtsman and shepherd in a landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "1/18/Twee_galopperende_ruiters_in_een_landschap_Verschillende_landschappen_%28serietitel%29_Diverses_paisages_%28serietitel%29%2C_RP-P-OB-35.044.jpg",
		bottom: 31,
		zoom: 1.1,
		credit: "Two riders galloping through a landscape, Diverses paisages (Rijksmuseum, CC0)",
	},
	{
		file: "0/07/Rembrandt_van_Rijn_-_Landscape_with_a_Cottage_and_Haybarn.jpg",
		bottom: 9,
		zoom: 1.04,
		ink: 0.7,
		credit: "Rembrandt, Landscape with a Cottage and Haybarn, 1641 (public domain)",
	},
];
// One picture a day from a series, the same all day (the main app picks it on the server); consecutive days are far
// apart in the list (5 shares no factor with either series' length).
export function ofDay(list, date = new Date()) {
	const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
	const n = list.length;
	return list[(((day * 5) % n) + n) % n];
}
function printHtml(p) {
	const src = `${COMMONS}/${p.file}/1920px-${p.file.split("/")[2]}`;
	return `<div class="print" style="--drop:${p.bottom}%;--zoom:${p.zoom};--ink:${p.ink ?? 1}"><img src="${src}" alt="" title="${p.credit}"></div>`;
}

/* Paintings: public-domain landscapes in colour, light and quiet, of many kinds (orchards, fields, villages, snow, a
   few shores), laid faintly over the whole page; seeing the whole picture shows it at full strength. `x` and `fy` are
   where its interest lies across and down, kept in view when the screen's shape crops it. Light theme only. Found on
   landscapes.directory and Wikimedia Commons. */
const PAINTINGS = [
	{
		file: "a/a9/Thomas_moran_near_east_hampton_long_island093746%29.jpg",
		x: 30,
		fy: 50,
		credit: "Thomas Moran, Near East Hampton, Long Island, 1894 (public domain)",
	},
	{
		file: "f/f5/Albert_marquet_les_toits_douchy_et_le_leman.jpg",
		x: 50,
		fy: 40,
		credit: "Albert Marquet, Les toits d'Ouchy et le Léman, 1936 (public domain)",
	},
	{
		file: "6/6d/Camille_Pissarro%2C_Le_verger_%28The_Orchard%29%2C_1872.jpg",
		x: 45,
		fy: 50,
		credit: "Camille Pissarro, The Orchard, 1872 (public domain)",
	},
	{
		file: "9/90/Camille_Pissarro_-_Le_jardin_%C3%A0_%C3%89ragny.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, The Garden at Éragny, c. 1895 (public domain)",
	},
	{
		file: "d/d2/%27Louveciennes_in_the_Snow%27_by_Alfred_Sisley%2C_Norton_Simon_Museum.JPG",
		x: 50,
		fy: 65,
		credit: "Alfred Sisley, Louveciennes in the Snow, c. 1874 (public domain)",
	},
	{
		file: "7/78/Alfred_Sisley%2C_First_Snow_at_Veneux-Nadon%2C_1878%2C_NGA_62641.jpg",
		x: 60,
		fy: 55,
		credit: "Alfred Sisley, First Snow at Veneux-Nadon, 1878 (NGA, CC0)",
	},
	{ file: "e/e8/Alfred_Sisley_-_Moret-sur-Loing_%281891%29.jpg", x: 60, fy: 42, credit: "Alfred Sisley, Moret-sur-Loing, 1891 (public domain)" },
	{
		file: "2/21/1880%2C_Sisley%2C_On_the_Hills_of_Moret_in_the_Spring_-_Morning.jpg",
		x: 55,
		fy: 35,
		credit: "Alfred Sisley, On the Hills of Moret in Spring, Morning, 1880 (public domain)",
	},
	{
		file: "f/ff/Claude_Monet_-_Haystacks%2C_end_of_Summer_-_Google_Art_Project.jpg",
		x: 55,
		fy: 55,
		credit: "Claude Monet, Haystacks, End of Summer, 1891 (public domain)",
	},
	{ file: "3/37/Claude_Monet_-_Meadow_at_Giverny_%28Princeton%29.jpg", x: 55, fy: 50, credit: "Claude Monet, Meadow at Giverny (public domain)" },
	{
		file: "7/76/Claude_Monet_-_Poppy_Field_%28Giverny%29_-_1922.4465_-_Art_Institute_of_Chicago.jpg",
		x: 50,
		fy: 55,
		credit: "Claude Monet, Poppy Field (Giverny), 1890 (public domain)",
	},
	{
		file: "0/0d/Vilhelm_Hammersh%C3%B8i_-_Landscape%2C_view_from_Lejre.jpg",
		x: 50,
		fy: 40,
		credit: "Vilhelm Hammershøi, Landscape, View from Lejre (public domain)",
	},
	{ file: "3/35/Paul_C%C3%A9zanne_-_Landscape_-_Google_Art_Project.jpg", x: 50, fy: 55, credit: "Paul Cézanne, Landscape (public domain)" },
	{
		file: "5/5b/Vincent_van_Gogh_-_The_white_orchard_-_Google_Art_Project.jpg",
		x: 50,
		fy: 45,
		credit: "Vincent van Gogh, The White Orchard, 1888 (public domain)",
	},
	{
		file: "f/ff/Camille_Pissarro_-_Boulevard_Montmartre%2C_Spring_-_Google_Art_Project.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, Boulevard Montmartre, Spring, 1897 (public domain)",
	},
	{
		file: "f/fa/Camille_Pissarro_-_View_from_Louveciennes_-_National_Gallery_London.jpg",
		x: 50,
		fy: 55,
		credit: "Camille Pissarro, View from Louveciennes, c. 1870 (public domain)",
	},
	{
		file: "7/7a/Jean-Baptiste-Armand_Guillaumin%2C_Landscape%2C_1882%2C_NGA_48203.jpg",
		x: 50,
		fy: 55,
		credit: "Armand Guillaumin, Landscape, 1882 (NGA, CC0)",
	},
	{ file: "0/02/Morisot_-_Bougival%2C_1884.jpg", x: 55, fy: 40, credit: "Berthe Morisot, Bougival, 1884 (public domain)" },
	{ file: "a/a5/Ivan_Ivanovich_Shishkin_-_Rye_field%2C_1878.jpg", x: 55, fy: 55, credit: "Ivan Shishkin, Rye, 1878 (public domain)" },
	{
		file: "3/32/John_Frederick_Kensett_-_Almy%27s_Pond%2C_Newport%2C_Rhode_Island_%281859%29.jpg",
		x: 65,
		fy: 60,
		credit: "John Frederick Kensett, Almy's Pond, Newport, 1859 (public domain)",
	},
	{
		file: "5/56/Martin_Johnson_Heade_-_Newburyport_Meadows_ATC.jpg",
		x: 40,
		fy: 60,
		credit: "Martin Johnson Heade, Newburyport Meadows, c. 1876–81 (public domain)",
	},
	{
		file: "8/88/Fitz_Henry_Lane_-_Owl%27s_Head%2C_Penobscot_Bay%2C_Maine_-_Google_Art_Project.jpg",
		x: 55,
		fy: 60,
		credit: "Fitz Henry Lane, Owl's Head, Penobscot Bay, 1862 (public domain)",
	},
	{
		file: "7/7c/LaneFitzHughBracesRockEasternPointGloucester.jpg",
		x: 45,
		fy: 60,
		full: true,
		credit: "Fitz Henry Lane, Brace's Rock, Eastern Point, c. 1864 (public domain)",
	},
];
function paintingHtml(p) {
	// Files narrower than 1920px have no 1920px copy (Commons does not upscale): those are linked whole (`full`).
	const src = p.full ? `${COMMONS.replace("/thumb", "")}/${p.file}` : `${COMMONS}/${p.file}/1920px-${p.file.split("/")[2]}`;
	return `<div class="painting" style="--x:${p.x}%;--y:${p.fy ?? 50}%"><img src="${src}" alt="" title="${p.credit}"></div>`;
}
/** The day's picture in a series ("image": the prints, "painting": the paintings). */
export const SERIES = { image: () => PRINTS, painting: () => PAINTINGS };

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
function patternHtml(name, dark) {
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

/* The learner's choice (their settings, lib/account/app.svelte.ts), put on <html> so the page can lay itself out for
   it (the server puts it there first). */
export function renderBackdrop(host, choice, dark) {
	// Paintings are for the light theme only; at night the choice stands but nothing is shown.
	const backdrop = choice.backdrop === "painting" && dark ? "none" : choice.backdrop;
	document.documentElement.dataset.backdrop = backdrop;
	const key = `${backdrop}:${choice.pattern}:${dark}`;
	if (host.dataset.key === key) return;
	host.dataset.key = key;
	host.classList.toggle("full", backdrop === "pattern" || backdrop === "painting");
	host.innerHTML =
		backdrop === "image"
			? printHtml(ofDay(PRINTS, new Date()))
			: backdrop === "painting"
				? paintingHtml(ofDay(PAINTINGS, new Date()))
				: backdrop === "pattern"
					? patternHtml(choice.pattern, dark)
					: "";
}
