/*
 * The small physics behind the glass (no dependencies, no DOM): a rigid glass rocking on a table, a liquid surface
 * that lags and ripples, and ballistic drops. Units are the drawing's (one unit is a pixel at the 64-unit icon) and
 * seconds. Everything steps at a fixed rate, so a slow device drops frames, never changes the motion.
 */

export const STEP = 1 / 240;
/** Gravity, in units per second squared: a cartoon table, a little slower than the real one at this scale. */
export const G = 1500;

/**
 * A rigid body rocking on a flat floor about one of the two ends of its base (Housner's rocking block): gravity pulls
 * it back while it leans less than the angle at which it would topple, and each time it lands flat it keeps only a
 * part of its spin. That is what makes a knocked glass rattle faster and faster as it settles. Positive angles lean
 * clockwise (to the right, on its right end).
 */
export class Rocker {
	theta = 0;
	omega = 0;
	/** Half the width it stands on, and the height of its centre of mass above it. */
	half: number;
	height: number;
	/** How fast it falls back (rad/s): the square root of g·R over the radius of gyration about the corner. */
	rate: number;
	/** The part of its spin it keeps on landing flat. */
	keep: number;
	constructor(half: number, height: number, { keep = 0.6, slow = 1 }: { keep?: number; slow?: number } = {}) {
		this.half = half;
		this.height = height;
		this.keep = keep;
		const r = Math.hypot(half, height);
		// A solid block's radius of gyration about its corner is r·√(4/3); a glass is lighter at the foot, close enough.
		this.rate = Math.sqrt((G * r) / ((4 / 3) * r * r)) / slow;
	}
	/** The lean at which it would fall over. */
	get tipping() {
		return Math.atan2(this.half, this.height);
	}
	/** Which end it pivots on: 1 its right, -1 its left, 0 flat. */
	get side() {
		return this.theta > 1e-6 ? 1 : this.theta < -1e-6 ? -1 : 0;
	}
	get resting() {
		return this.theta === 0 && this.omega === 0;
	}
	kick(omega: number) {
		this.omega += omega;
	}
	step(dt = STEP) {
		if (this.resting) return;
		const a = this.tipping;
		const s = this.side || Math.sign(this.omega);
		const was = this.theta;
		// Gravity's torque about the corner, plus a little air and friction.
		const acc = -s * this.rate * this.rate * Math.sin(a - s * this.theta) - 0.35 * this.omega;
		this.omega += acc * dt;
		this.theta += this.omega * dt;
		// Never topple: a lean past nine tenths of the tipping angle is held there (a hand would catch it).
		const cap = a * 0.9;
		if (Math.abs(this.theta) > cap) {
			this.theta = Math.sign(this.theta) * cap;
			this.omega = Math.min(0, this.omega * Math.sign(this.theta)) * Math.sign(this.theta);
		}
		// Landing flat: the spin it keeps carries it onto the other end.
		if (was !== 0 && Math.sign(this.theta) !== Math.sign(was)) {
			this.omega *= this.keep;
			this.theta = 0;
			if (Math.abs(this.omega) < 0.25) this.omega = 0;
		}
		if (Math.abs(this.theta) < 2e-4 && Math.abs(this.omega) < 0.25) {
			this.theta = 0;
			this.omega = 0;
		}
	}
}

/**
 * A liquid surface as columns on springs (the usual 2D water: each column is pulled to its rest height and towards its
 * neighbours, and damped). The rest line stays level in the world while the glass leans; the glass's angular
 * acceleration and sideways acceleration push one side up, so the surface lags and sloshes back.
 */
export class Surface {
	readonly x: number[];
	readonly h: number[];
	readonly v: number[];
	constructor(
		half: number,
		readonly n = 15,
		readonly stiff = 90,
		readonly spread = 0.22,
		readonly damp = 3.2,
	) {
		this.x = Array.from({ length: n }, (_, i) => -half + (2 * half * i) / (n - 1));
		this.h = Array(n).fill(0);
		this.v = Array(n).fill(0);
	}
	get calm() {
		return this.h.every((h, i) => Math.abs(h) < 0.03 && Math.abs(this.v[i]) < 0.3);
	}
	/** A push at x (a drop landing, a cube falling in): downward is positive, as on the page. */
	poke(x: number, speed: number, width = 2.5) {
		for (let i = 0; i < this.n; i++) {
			const d = (this.x[i] - x) / width;
			this.v[i] += speed * Math.exp(-d * d);
		}
	}
	/** The glass's angular acceleration (rad/s², clockwise positive) and sideways acceleration (units/s²). */
	step(dt = STEP, spin = 0, shove = 0) {
		const { n, x, h, v } = this;
		for (let i = 0; i < n; i++) {
			// Leaning faster to the right leaves the liquid behind: its right side drops, its left rises.
			const force = -this.stiff * h[i] - this.damp * v[i] + 0.022 * x[i] * spin + 0.012 * x[i] * shove;
			v[i] += force * dt;
		}
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 0; i < n; i++) {
				if (i > 0) v[i - 1] += this.spread * (h[i] - h[i - 1]) * 60 * dt;
				if (i < n - 1) v[i + 1] += this.spread * (h[i] - h[i + 1]) * 60 * dt;
			}
		}
		for (let i = 0; i < n; i++) {
			h[i] += v[i] * dt;
			// A glass's liquid never climbs far: hold the waves to a few units, losing the push that would have.
			if (Math.abs(h[i]) > 3.2) {
				h[i] = Math.sign(h[i]) * 3.2;
				v[i] *= 0.3;
			}
		}
	}
	/** The offset at x, interpolated between columns. */
	at(px: number) {
		const { n, x, h } = this;
		const f = ((px - x[0]) / (x[n - 1] - x[0])) * (n - 1);
		const i = Math.max(0, Math.min(n - 2, Math.floor(f)));
		const t = Math.max(0, Math.min(1, f - i));
		return h[i] + (h[i + 1] - h[i]) * t;
	}
	reset() {
		this.h.fill(0);
		this.v.fill(0);
	}
}

export type Drop = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	r: number;
	life: number;
	age: number;
	tint: number;
	kind: "drop" | "bubble" | "foam" | "spark" | "stream" | "plume";
	c?: string;
};

/** Ballistic drops: gravity, a little drag, an age. Bubbles rise instead, with a wobble. */
export function stepDrops(drops: Drop[], dt = STEP) {
	for (const d of drops) {
		d.age += dt;
		if (d.kind === "bubble") {
			d.vy -= 140 * dt;
			d.vy *= 1 - 3 * dt;
			d.x += Math.sin(d.age * 17 + d.tint * 9) * 4 * dt;
			d.r = Math.min(d.r + 0.6 * dt, 1.1);
		} else if (d.kind === "plume") {
			// Syrup sinking through juice: heavy, slowed by the liquid, swaying as it goes.
			d.vy += 90 * dt;
			d.vy *= 1 - 2.5 * dt;
			d.x += Math.sin(d.age * 6 + d.tint * 7) * 3 * dt;
			d.r += 0.8 * dt;
		} else if (d.kind === "foam") {
			d.vy += G * 0.15 * dt;
			d.vx *= 1 - 4 * dt;
			d.vy *= 1 - 4 * dt;
		} else if (d.kind === "spark") {
			d.vx *= 1 - 5 * dt;
			d.vy *= 1 - 5 * dt;
		} else {
			d.vy += G * dt;
			d.vx *= 1 - 0.3 * dt;
		}
		d.x += d.vx * dt;
		d.y += d.vy * dt;
	}
}

/** A damped spring towards a target: returns the new value and speed. */
export function spring(value: number, speed: number, target: number, stiffness: number, damping: number, dt = STEP): [number, number] {
	const s = speed + (-stiffness * (value - target) - damping * speed) * dt;
	return [value + s * dt, s];
}

/* Easing for the scripted moments (the motion a hand gives; physics takes over when it lets go). */
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t: number) => clamp01(t) ** 3;
export const easeInOut = (t: number) => {
	const u = clamp01(t);
	return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};
/** Overshoots its end a little, then settles (a hand placing something firmly). */
export const easeBack = (t: number, s = 1.6) => {
	const u = clamp01(t) - 1;
	return 1 + u * u * ((s + 1) * u + s);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A seeded random stream, so a moment plays the same way each time in tests and recordings. */
export function seeded(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return (s >>> 0) / 4294967296;
	};
}
