/*
 * The week's seven glasses, Monday first: each a different silhouette (so even the 36px mark tells them apart), a
 * different drink, a different vessel to pour it from and a different last touch. Coordinates are the glass's own:
 * the middle of its foot on the table is (0, 0) and up is negative y; one unit is a pixel at the 64-unit icon.
 */
import { weekdayOf } from "#lib/time/format.ts";

export type GarnishKind = "cherry-pick" | "wheel" | "half-wheel" | "fruit-cube" | "strawberry" | "ice" | "umbrella" | "straw" | "mint" | "crown";
/** How it arrives: dropped in (it falls, splashes and floats), set on the rim, or stood in the glass. */
export type Arrival = "drop" | "rim" | "stand";
export type Garnish = {
	kind: GarnishKind;
	arrive: Arrival;
	/** Where it rests, and at what angle (degrees, clockwise). A dropped one floats at `y` below the surface. */
	x: number;
	y: number;
	a: number;
	/** When it arrives, in seconds after the pour ends. */
	at: number;
	/** A second colour (the straw's stripes, the fruit's flesh). */
	tint?: string;
	/** Drawn mirrored (a straw whose mouth turns the other way). */
	flip?: boolean;
};
export type VesselKind = "shaker" | "beer" | "jug" | "champagne" | "decanter" | "carafe" | "rum";
export type Pour = { vessel: VesselKind; colour: string; until: number };
export type Idle = "jitter" | "tip" | "hop" | "scoot" | "slosh" | "swirl" | "fizz" | "clink" | "twirl" | "bob";

export type Drink = {
	id: string;
	/** The drink's English name (the lab's label; the app shows no name). */
	name: string;
	/** Height to the rim. */
	height: number;
	/** The whole silhouette (the die cut and the glass's fill). */
	body: string;
	/** Ink drawn over it: the outline, the stem, the foot; and a fainter line behind (the far half of the foot). */
	ink: string[];
	far?: string;
	/** The near half of a foot's top: drawn lighter than the outline. */
	lip?: string;
	/** Curves drawn as strokes that thin from the full line to a fine one (where a stem flares onto its foot). */
	flares?: number[][];
	rim: { y: number; rx: number; ry: number };
	/** The inside's floor, a circle seen from a little above (drawn whole, so it reads right upside down too). */
	base?: { y: number; rx: number; ry: number };
	shine: string;
	/** The inside, as [y, half width] from the bottom of the inside up to the rim. */
	inside: [number, number][];
	/** The liquid's top at rest. */
	level: number;
	liquid: string;
	/** The surface (lighter) and, for a layered drink, the colour that sinks to the bottom. */
	surface: string;
	sinks?: { colour: string; depth: number };
	bubbles?: boolean;
	foam?: { depth: number; crown?: boolean };
	/** What it stands on upright (half the foot, the centre of mass's height) and upside down (on its rim). */
	up: [number, number];
	down: [number, number];
	pours: Pour[];
	garnish: Garnish[];
	/** Its own small motions when full, besides the slosh every full glass has. */
	idles: Idle[];
	/** The week's number, coloured by the drink (dark enough to read on paper). */
	ink2: string;
	ink2Dark: string;
};

/*
 * A stemmed glass's lower half: the bowl gathers into the stem with a small waist, the stem flares onto the foot, and
 * the foot is a disc with some thickness, seen from the same eye as the rim. `sil` continues the silhouette from the
 * bowl's left end (-j, yb) round to its right end (j, yb); `ink` is its lines; `far` the foot's far half (fainter).
 */
function stemFoot(j: number, yb: number, s: number, fx: number) {
	const n = (v: number) => Number(v.toFixed(2));
	const fry = fx * 0.25;
	const t = 1.6;
	const yc = n(-(t + fry) + 0.7);
	const yf = n(yc - fry * 0.45);
	const a = n(yb + 2.6);
	const b = n(Math.max(a, yf - 2.2));
	const side = (k: 1 | -1) =>
		`C${n(k * j * 0.55)} ${n(yb + 0.9)} ${k * s} ${n(yb + 1.2)} ${k * s} ${a}L${k * s} ${b}C${k * s} ${n(yf - 0.8)} ${n(k * fx * 0.3)} ${n(yf - 0.25)} ${n(k * fx * 0.62)} ${yf}`;
	const back = (k: 1 | -1) =>
		`C${n(k * fx * 0.3)} ${n(yf - 0.25)} ${k * s} ${n(yf - 0.8)} ${k * s} ${b}L${k * s} ${a}C${k * s} ${n(yb + 1.2)} ${n(k * j * 0.55)} ${n(yb + 0.9)} ${k * j} ${yb}`;
	const sil = `${side(-1)}C${n(-fx * 0.88)} ${n(yf + 0.1)} ${-fx} ${n(yc - fry * 0.3)} ${-fx} ${yc}L${-fx} ${n(yc + t)}A${fx} ${n(fry)} 0 0 0 ${fx} ${n(yc + t)}L${fx} ${yc}C${fx} ${n(yc - fry * 0.3)} ${n(fx * 0.88)} ${n(yf + 0.1)} ${n(fx * 0.62)} ${yf}${back(1)}`;
	// The stems stop where they start to flare; the flares are drawn as strokes that thin towards their ends.
	const stem = (k: 1 | -1) => `M${k * j} ${yb}C${n(k * j * 0.55)} ${n(yb + 0.9)} ${k * s} ${n(yb + 1.2)} ${k * s} ${a}L${k * s} ${b}`;
	const flares: number[][] = [-1, 1].map((k) => [k * s, b, k * s, n(yf - 0.8), n(k * fx * 0.3), n(yf - 0.25), n(k * fx * 0.62), yf]);
	const ink = [stem(-1), stem(1), `M${-fx} ${yc}L${-fx} ${n(yc + t)}A${fx} ${n(fry)} 0 0 0 ${fx} ${n(yc + t)}L${fx} ${yc}`];
	// The top of the foot, its near half: a lighter line, so the disc's edge reads as glass, not a black band.
	const lip = `M${-fx} ${yc}A${fx} ${n(fry)} 0 0 0 ${fx} ${yc}`;
	const far = `M${-fx} ${yc}A${fx} ${n(fry)} 0 0 1 ${fx} ${yc}`;
	return { sil, ink, far, flares, lip };
}
const MARTINI = stemFoot(2.6, -16.6, 1.25, 9.2);
const GOBLET = stemFoot(2.4, -12.4, 1.3, 9.4);
const FLUTE = stemFoot(2.2, -16.2, 1.15, 8.4);
const HURRICANE = stemFoot(2.4, -10.4, 1.6, 9.2);

export const DRINKS: Drink[] = [
	{
		id: "blue-monday",
		name: "Blue Monday",
		height: 30,
		body: `M-17.6 -30C-11.2 -25.6 -5.2 -19.8 -2.6 -16.6${MARTINI.sil}C5.2 -19.8 11.2 -25.6 17.6 -30C10.2 -33.9 -10.2 -33.9 -17.6 -30Z`,
		ink: ["M-17.6 -30C-11.2 -25.6 -5.2 -19.8 -2.6 -16.6M17.6 -30C11.2 -25.6 5.2 -19.8 2.6 -16.6", ...MARTINI.ink],
		far: MARTINI.far,
		flares: MARTINI.flares,
		lip: MARTINI.lip,
		rim: { y: -30, rx: 17.4, ry: 3.13 },
		shine: "M-12.8 -26.6C-11.4 -25.2 -9.9 -23.9 -8.4 -22.6",
		inside: [
			[-17.4, 0.6],
			[-22, 6.4],
			[-26, 11.8],
			[-30, 16.4],
		],
		level: -28.2,
		liquid: "#3d9fbd",
		surface: "#8fd2e0",
		up: [9.2, 14],
		down: [17.4, 10],
		pours: [{ vessel: "shaker", colour: "#3d9fbd", until: 1 }],
		garnish: [{ kind: "cherry-pick", arrive: "drop", x: 2.6, y: -3.6, a: 30, at: 0.15 }],
		idles: ["bob"],
		ink2: "#2c7f99",
		ink2Dark: "#6cc3d8",
	},

	{
		id: "pint",
		name: "Pint",
		height: 41,
		body: "M-9.8 0L-11.4 -28.6C-13.4 -33 -13 -37 -12.6 -41C-6 -43.6 6 -43.6 12.6 -41 13 -37 13.4 -33 11.4 -28.6L9.8 0C4.4 3.2 -4.4 3.2 -9.8 0Z",
		ink: ["M-12.4 -41C-12.8 -37 -13.2 -33 -11.2 -28.6L-9.6 0C-4.3 3.1 4.3 3.1 9.6 0L11.2 -28.6C13.2 -33 12.8 -37 12.4 -41"],
		rim: { y: -41, rx: 12.4, ry: 2.23 },
		base: { y: -3.8, rx: 8.9, ry: 2.1 },
		shine: "M-8.4 -26.4L-7.4 -8.4",
		inside: [
			[-3.8, 8.6],
			[-28.4, 10.2],
			[-33, 11.6],
			[-41, 11.3],
		],
		level: -32,
		liquid: "#e6a133",
		surface: "#f3c66a",
		bubbles: true,
		foam: { depth: 7.4, crown: true },
		up: [9.8, 17],
		down: [12.4, 23],
		pours: [{ vessel: "beer", colour: "#e6a133", until: 1 }],
		garnish: [{ kind: "crown", arrive: "stand", x: 0, y: -41, a: 0, at: 0 }],
		idles: ["fizz"],
		ink2: "#b46d10",
		ink2Dark: "#f0b04f",
	},
	{
		id: "sangria",
		name: "Sangria",
		height: 31,
		body: `M-13 -31C-14 -22 -11.4 -13.6 -2.4 -12.4${GOBLET.sil}C11.4 -13.6 14 -22 13 -31C6.6 -33.7 -6.6 -33.7 -13 -31Z`,
		ink: ["M-13 -31C-14 -22 -11.4 -13.6 -2.4 -12.4M13 -31C14 -22 11.4 -13.6 2.4 -12.4", ...GOBLET.ink],
		far: GOBLET.far,
		flares: GOBLET.flares,
		lip: GOBLET.lip,
		rim: { y: -31, rx: 12.8, ry: 2.3 },
		shine: "M-10.4 -27C-10.8 -22.6 -9.8 -19 -7.6 -16.6",
		inside: [
			[-13, 1],
			[-14, 5.4],
			[-17, 9.4],
			[-22, 11.6],
			[-31, 11.7],
		],
		level: -22.6,
		liquid: "#b5304a",
		surface: "#de6f81",
		up: [9.4, 15],
		down: [12.8, 13],
		pours: [{ vessel: "jug", colour: "#b5304a", until: 1 }],
		garnish: [
			{ kind: "fruit-cube", arrive: "drop", x: -4, y: 1.4, a: 12, at: 0.05, tint: "#f2c14e" },
			{ kind: "fruit-cube", arrive: "drop", x: 4.4, y: 1.8, a: -20, at: 0.3, tint: "#e8833a" },
			{ kind: "wheel", arrive: "rim", x: 11, y: -31.6, a: 22, at: 0.75, tint: "#e3bb2c" },
		],
		idles: ["swirl"],
		ink2: "#9c2338",
		ink2Dark: "#ec7d90",
	},

	{
		id: "flute",
		name: "Champagne",
		height: 40,
		body: `M-8.8 -40C-9.4 -28 -7.6 -17.4 -2.2 -16.2${FLUTE.sil}C7.6 -17.4 9.4 -28 8.8 -40C4.4 -42 -4.4 -42 -8.8 -40Z`,
		ink: ["M-8.8 -40C-9.4 -28 -7.6 -17.4 -2.2 -16.2M8.8 -40C9.4 -28 7.6 -17.4 2.2 -16.2", ...FLUTE.ink],
		far: FLUTE.far,
		flares: FLUTE.flares,
		lip: FLUTE.lip,
		rim: { y: -40, rx: 8.6, ry: 1.55 },
		shine: "M-6.2 -36.4C-6.6 -30.4 -6 -25.6 -4.4 -22.4",
		inside: [
			[-16.6, 0.8],
			[-18, 4],
			[-22, 6.3],
			[-30, 7.6],
			[-40, 7.6],
		],
		level: -34,
		liquid: "#eac35a",
		surface: "#f7e2a0",
		bubbles: true,
		foam: { depth: 1.6 },
		up: [8.4, 18],
		down: [8.6, 17],
		pours: [{ vessel: "champagne", colour: "#eac35a", until: 1 }],
		garnish: [],
		idles: ["fizz"],
		ink2: "#a37d12",
		ink2Dark: "#f1cf6e",
	},

	{
		id: "old-fashioned",
		name: "Whisky",
		height: 24,
		body: "M-14.2 0L-15.4 -24C-7.6 -27.1 7.6 -27.1 15.4 -24L14.2 0C6.4 4.6 -6.4 4.6 -14.2 0Z",
		ink: ["M-15.2 -24L-14 0C-6.3 4.5 6.3 4.5 14 0L15.2 -24"],
		rim: { y: -24, rx: 15.2, ry: 2.74 },
		base: { y: -5.2, rx: 13.1, ry: 3 },
		shine: "M-11.4 -20L-11 -8.6",
		inside: [
			[-5, 13.1],
			[-24, 14],
		],
		level: -16.6,
		liquid: "#c67628",
		surface: "#e7a95e",
		up: [14.2, 10],
		down: [15.2, 14],
		pours: [{ vessel: "decanter", colour: "#c67628", until: 1 }],
		garnish: [
			{ kind: "ice", arrive: "drop", x: -1.5, y: 3, a: 9, at: 0.05 },
			{ kind: "half-wheel", arrive: "rim", x: 12.2, y: -23.4, a: 26, at: 0.65, tint: "#ec8a2c" },
		],
		idles: ["clink"],
		ink2: "#9a5614",
		ink2Dark: "#e7a564",
	},

	{
		id: "sunrise",
		name: "Sunrise",
		height: 47,
		body: `M-10.8 -47C-10.4 -42 -6.8 -39.6 -7 -34.6S-12 -24.4 -10.2 -17C-9.2 -13 -4.4 -11.4 -2.4 -10.4${HURRICANE.sil}C4.4 -11.4 9.2 -13 10.2 -17C12 -24.4 7.2 -29.6 7 -34.6S10.4 -42 10.8 -47C5.4 -49.4 -5.4 -49.4 -10.8 -47Z`,
		ink: [
			"M-10.8 -47C-10.4 -42 -6.8 -39.6 -7 -34.6S-12 -24.4 -10.2 -17C-9.2 -13 -4.4 -11.4 -2.4 -10.4M10.8 -47C10.4 -42 6.8 -39.6 7 -34.6S12 -24.4 10.2 -17C9.2 -13 4.4 -11.4 2.4 -10.4",
			...HURRICANE.ink,
		],
		far: HURRICANE.far,
		flares: HURRICANE.flares,
		lip: HURRICANE.lip,
		rim: { y: -47, rx: 10.6, ry: 1.91 },
		shine: "M-8.4 -25.4C-8.8 -22.4 -8.4 -19.4 -7 -17.2",
		inside: [
			[-13.4, 3],
			[-15.4, 7.2],
			[-18.0, 8.8],
			[-24.0, 9.2],
			[-30.0, 7.4],
			[-34.6, 5.8],
			[-40.0, 6.8],
			[-47.0, 9.5],
		],
		level: -41,
		liquid: "#f08f34",
		surface: "#f8bd6e",
		sinks: { colour: "#d8413a", depth: 0.42 },
		up: [9.2, 23],
		down: [10.6, 21],
		pours: [
			{ vessel: "carafe", colour: "#f08f34", until: 1 },
			{ vessel: "rum", colour: "#d8413a", until: 1 },
		],
		garnish: [
			{ kind: "straw", arrive: "stand", x: 2.6, y: -29.5, a: 12, at: 0.05, tint: "#d8413a", flip: true },
			{ kind: "umbrella", arrive: "stand", x: -3.4, y: -41, a: -14, at: 0.45, tint: "#4f9fb8" },
		],
		idles: ["twirl"],
		ink2: "#c25a12",
		ink2Dark: "#f5a35a",
	},
	{
		id: "mojito",
		name: "Mojito",
		height: 39,
		body: "M-9.8 0L-10.2 -39C-5 -41.4 5 -41.4 10.2 -39L9.8 0C4.4 3.2 -4.4 3.2 -9.8 0Z",
		ink: ["M-10 -39L-9.6 0C-4.3 3.1 4.3 3.1 9.6 0L10 -39"],
		rim: { y: -39, rx: 10, ry: 1.8 },
		base: { y: -4.4, rx: 8.9, ry: 2.1 },
		shine: "M-7.2 -34L-6.8 -10",
		inside: [
			[-4.2, 8.8],
			[-39, 9.2],
		],
		level: -31,
		liquid: "#a9cf63",
		surface: "#d4eaa2",
		bubbles: true,
		up: [9.8, 18],
		down: [10, 21],
		pours: [{ vessel: "rum", colour: "#a9cf63", until: 1 }],
		garnish: [
			{ kind: "ice", arrive: "drop", x: -3.6, y: 2.6, a: -12, at: 0.05 },
			{ kind: "ice", arrive: "drop", x: 3.8, y: 3.4, a: 16, at: 0.28 },
			{ kind: "mint", arrive: "drop", x: 0.5, y: -1.5, a: 0, at: 0.55 },
			{ kind: "straw", arrive: "stand", x: -2.4, y: -21, a: -12, at: 0.8, tint: "#3f8f5a" },
		],
		idles: ["clink"],
		ink2: "#55851f",
		ink2Dark: "#b7dc78",
	},
];

/** Monday is 0. */
/** The drink of a local day (`YYYY-MM-DD`): one per weekday, Monday first. */
export const drinkOf = (day: string) => DRINKS[weekdayOf(day)];

/** Half the inside's width at y (0 below the bottom and above the rim's top it is held at the rim's). */
export function insideHalf(d: Drink, y: number) {
	const p = d.inside;
	if (y >= p[0][0]) return p[0][1];
	for (let i = 1; i < p.length; i++) {
		if (y >= p[i][0]) {
			const t = (y - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
			return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
		}
	}
	return p[p.length - 1][1];
}
/** The inside as a closed path, open upwards so a crown of foam can rise past the rim. */
export function insidePath(d: Drink, open = true) {
	const p = d.inside;
	const top = p[p.length - 1];
	const right = p.map(([y, h]) => `${h.toFixed(2)} ${y}`).join("L");
	const left = [...p]
		.reverse()
		.map(([y, h]) => `${(-h).toFixed(2)} ${y}`)
		.join("L");
	// Open: anything above the rim shows, however wide (a leaning straw, a crown of foam).
	const up = open ? `L60 ${top[0]}L60 ${top[0] - 60}L-60 ${top[0] - 60}L-60 ${top[0]}` : "";
	// The floor is the front of a circle seen from above: it bows towards the viewer.
	const [y0, h0] = p[0];
	const floor = d.base ? `Q0 ${(y0 + d.base.ry * 2).toFixed(2)} ${h0.toFixed(2)} ${y0}` : "";
	return `M${(-h0).toFixed(2)} ${y0}${floor}L${right}${up}L${left}Z`;
}
/** How flat a circle at height y looks (the rim flattest, the table roundest). */
export const flatness = (d: Drink, y: number) => 0.18 + 0.07 * Math.max(0, Math.min(1, (y - d.rim.y) / -d.rim.y));
export const insideBottom = (d: Drink) => d.inside[0][0];
