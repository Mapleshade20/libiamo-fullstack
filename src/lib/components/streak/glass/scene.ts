import { type Drink, flatness, type Garnish, type Idle, insideBottom, insideHalf, type Pour } from "./drinks";
import { clamp01, type Drop, easeBack, easeIn, easeInOut, easeOut, G, lerp, Rocker, STEP, Surface, seeded, spring, stepDrops } from "./physics";

/*
 * One glass on its table, stepped at a fixed rate. A moment (turning over, pouring, throwing the drink out) is a hand:
 * it moves the glass, the vessel and the garnish along scripted paths; when it lets go, the physics carries on (the
 * glass rocks to rest, the liquid sloshes, the drops fly). The component only draws what this holds.
 */

export type Look = "down" | "up" | "full";
export type Moment = "flip" | "unflip" | "pour" | "spill" | "swap" | Idle;

export type Item = {
	g: Garnish;
	on: boolean;
	/** In the glass's frame until it is thrown out; then in the world's. */
	world: boolean;
	x: number;
	y: number;
	a: number;
	vx: number;
	vy: number;
	va: number;
	/** How far it has opened or risen (the umbrella, the crown), and how far it has turned (the umbrella's spin). */
	s: number;
	sv: number;
	spin: number;
	mode: "off" | "fall" | "float" | "place" | "stand" | "rest" | "fly";
	t: number;
};
export type Vessel = {
	pour: Pour;
	x: number;
	y: number;
	a: number;
	on: boolean;
	cork: { x: number; y: number; a: number; vx: number; vy: number; va: number; on: boolean; out: boolean };
};
export type Flash = { x: number; y: number; age: number; size: number; life: number };

const DEG = Math.PI / 180;
const FOAM = "#fbf5e8";

export class Scene {
	drink: Drink;
	look: Look;
	/* The glass: where it is, how it is turned (about its middle), how squashed; and its rocking on the table. */
	x = 0;
	y = 0;
	a = 0;
	sq = 1;
	private sqv = 0;
	rock: Rocker;
	private holdRock = false;
	/* The drink: how full (0 to 1 of the way to its level), how much has sunk (a layered drink), its foam. */
	fill = 0;
	sink = 0;
	foam = 0;
	surface: Surface;
	drops: Drop[] = [];
	stream: Drop[] = [];
	items: Item[] = [];
	vessel: Vessel | null = null;
	sparkles: Flash[] = [];
	marks: Flash[] = [];
	moment: Moment | null = null;
	/** The moment's clock, and the scene's own (for waves that are not physics). */
	t = 0;
	clock = 0;
	private next: Drink | null = null;
	private ended: (() => void) | null = null;
	private acc = 0;
	private rand = seeded(7);
	private last = { tilt: 0, omega: 0, x: 0, vx: 0 };
	private flags = new Set<string>();
	private script: ((t: number) => boolean) | null = null;
	private prev = { a: 0, x: 0, y: 0 };

	constructor(drink: Drink, look: Look) {
		this.drink = drink;
		this.look = look;
		this.rock = new Rocker(1, 1);
		this.surface = new Surface(1);
		this.setLook(look);
	}

	/** The glass at rest in a look, with nothing moving. */
	setLook(look: Look, drink = this.drink) {
		this.drink = drink;
		this.look = look;
		this.moment = null;
		this.script = null;
		this.x = this.y = 0;
		this.a = look === "down" ? 180 : 0;
		this.sq = 1;
		this.sqv = 0;
		this.fill = look === "full" ? 1 : 0;
		this.sink = look === "full" ? 1 : 0;
		this.foam = look === "full" ? 1 : 0;
		this.drops = [];
		this.stream = [];
		this.vessel = null;
		this.sparkles = [];
		this.marks = [];
		this.dress(drink, look);
	}
	/** The glass's own parts for a drink: its surface, its rocking, its garnish (on only when full). */
	private dress(drink: Drink, look: Look) {
		this.drink = drink;
		this.surface = new Surface(Math.max(...drink.inside.map(([, h]) => h)) + 8);
		this.ground();
		// Garnish still flying from a thrown drink keeps flying.
		const flying = this.items?.filter((i) => i.on && i.world) ?? [];
		this.items = [
			...flying,
			...drink.garnish.map(
				(g) =>
					({
						g,
						on: look === "full",
						world: false,
						x: g.x,
						y: g.arrive === "drop" ? drink.level + g.y : g.y,
						a: g.a,
						vx: 0,
						vy: 0,
						va: 0,
						s: 1,
						sv: 0,
						spin: g.kind === "crown" && look === "full" ? 1 : 0,
						mode: look === "full" ? "rest" : "off",
						t: 0,
					}) as Item,
			),
		];
		this.last = { tilt: this.tilt, omega: 0, x: this.x, vx: 0 };
		this.prev = { a: this.a, x: this.x, y: this.y };
	}
	/** Rebuild the rocking for the way the glass now stands (its foot, or upside down on its rim). */
	private ground() {
		const [half, height] = Math.abs((((this.a % 360) + 360) % 360) - 180) < 90 ? this.drink.down : this.drink.up;
		const slow = 1;
		this.rock = new Rocker(half, height, { keep: 0.58, slow });
	}
	get upsideDown() {
		return Math.abs((((this.a % 360) + 360) % 360) - 180) < 90;
	}
	/** The glass's lean in the world (radians, clockwise). */
	get tilt() {
		return this.a * DEG + this.rock.theta;
	}
	/** The liquid's top at rest, in the glass's frame. */
	get levelY() {
		const b = insideBottom(this.drink);
		return lerp(b, this.drink.level, this.fill);
	}
	/** The surface at x (glass frame): level in the world, plus the waves. */
	surfaceY(x: number) {
		return this.levelY - x * Math.tan(this.tilt) + this.surface.at(x);
	}
	get busy() {
		return (
			this.moment !== null ||
			!this.rock.resting ||
			(this.fill > 0 && !this.surface.calm) ||
			this.drops.length > 0 ||
			this.stream.length > 0 ||
			this.sparkles.length > 0 ||
			this.marks.length > 0 ||
			Math.abs(this.sq - 1) > 1e-3 ||
			this.items.some((i) => i.on && i.mode !== "rest")
		);
	}

	/** Start a moment; `done` runs when it lets go (the physics may still be settling). */
	play(moment: Moment, done?: () => void, next?: Drink) {
		this.ended?.();
		this.ended = done ?? null;
		this.moment = moment;
		this.t = 0;
		this.flags.clear();
		this.next = next ?? null;
		this.rand = seeded(moment.length * 977 + this.drink.id.length * 131 + Math.floor(this.clock * 10));
		this.script = this.scriptFor(moment);
	}
	/** Jump to the end of what is playing (reduced motion, or a page that is going away). */
	finish() {
		const m = this.moment;
		if (!m) return;
		const to: Look = m === "flip" ? "up" : m === "pour" ? "full" : m === "unflip" || m === "spill" || m === "swap" ? "down" : this.look;
		const drink = m === "swap" && this.next ? this.next : this.drink;
		const done = this.ended;
		this.ended = null;
		this.setLook(to, drink);
		done?.();
	}

	/** Advance by real time; returns whether anything still moves. */
	tick(seconds: number) {
		this.acc += Math.min(seconds, 0.1);
		while (this.acc >= STEP) {
			this.step();
			this.acc -= STEP;
		}
		return this.busy;
	}

	private step() {
		this.clock += STEP;
		this.prev = { a: this.a, x: this.x, y: this.y };
		if (this.script) {
			const going = this.script(this.t);
			this.t += STEP;
			if (!going) {
				this.script = null;
				this.moment = null;
				const done = this.ended;
				this.ended = null;
				done?.();
			}
		}
		if (!this.holdRock) this.rock.step();
		[this.sq, this.sqv] = spring(this.sq, this.sqv, 1, 520, 16);
		if (Math.abs(this.sq - 1) < 1e-3 && Math.abs(this.sqv) < 0.01) {
			this.sq = 1;
			this.sqv = 0;
		}
		// The liquid feels the glass's angular and sideways acceleration.
		const tilt = this.tilt;
		const omega = (tilt - this.last.tilt) / STEP;
		const spin = Math.max(-600, Math.min(600, (omega - this.last.omega) / STEP));
		const vx = (this.x - this.last.x) / STEP;
		const shove = Math.max(-8000, Math.min(8000, (vx - this.last.vx) / STEP));
		this.last = { tilt, omega, x: this.x, vx };
		if (this.fill > 0) this.surface.step(STEP, spin, shove);
		this.stepStream();
		this.stepDropsAll();
		this.stepItems();
		for (const s of this.sparkles) s.age += STEP;
		for (const s of this.marks) s.age += STEP;
		this.sparkles = this.sparkles.filter((s) => s.age < s.life);
		this.marks = this.marks.filter((s) => s.age < s.life);
	}

	/* ---------- Points between the glass's frame and the world ---------- */
	/** Where a point of the glass is in the world. */
	toWorld(px: number, py: number): [number, number] {
		const h = this.drink.height / 2;
		const c = Math.cos(this.a * DEG);
		const s = Math.sin(this.a * DEG);
		let x = px * c - (py + h) * s;
		let y = px * s + (py + h) * c - h;
		x *= 1 / Math.sqrt(this.sq);
		y *= this.sq;
		const th = this.rock.theta;
		if (th !== 0) {
			const pv = this.rock.side * this.rock.half;
			const ct = Math.cos(th);
			const st = Math.sin(th);
			const dx = x - pv;
			[x, y] = [pv + dx * ct - y * st, dx * st + y * ct];
		}
		return [x + this.x, y + this.y];
	}
	/** The transform that draws the glass (SVG). */
	get transform() {
		const th = this.rock.theta / DEG;
		const pv = this.rock.side * this.rock.half;
		const sx = 1 / Math.sqrt(this.sq);
		return `translate(${f(this.x)} ${f(this.y)}) rotate(${f(th)} ${f(pv)} 0) scale(${f(sx)} ${f(this.sq)}) rotate(${f(this.a)} 0 ${f(-this.drink.height / 2)})`;
	}
	/** Fold the rocking into the free pose, so a hand can pick the glass up from where it leans. */
	private absorbRock() {
		if (this.rock.theta === 0) return;
		const h = this.drink.height / 2;
		const [cx, cy] = this.toWorld(0, -h);
		this.a += this.rock.theta / DEG;
		this.rock.theta = 0;
		this.rock.omega = 0;
		this.x = cx;
		this.y = cy + h;
	}
	private kickTo(degrees: number) {
		const r = this.rock;
		const a = r.tipping;
		const m = Math.min(Math.abs(degrees) * DEG, a * 0.85);
		const w = r.rate * Math.sqrt(Math.max(0, 2 * (Math.cos(a - m) - Math.cos(a))));
		// A little more than the frictionless figure: the air and the table take their share on the way up.
		r.kick(Math.sign(degrees) * w * 1.08);
	}
	private land(soft = 1) {
		this.sq = 1 - 0.1 * soft;
		this.sqv = 0;
		const half = this.rock.half;
		this.marks.push({ x: this.x - half - 3, y: 0, age: 0, size: -soft, life: 0.32 }, { x: this.x + half + 3, y: 0, age: 0, size: soft, life: 0.32 });
	}

	/* ---------- The liquid's parts ---------- */
	private stepStream() {
		stepDrops(this.stream);
		const d = this.drink;
		this.stream = this.stream.filter((p) => {
			const lx = p.x - this.x;
			const ly = p.y - this.y;
			if (Math.abs(lx) < d.rim.rx && ly >= this.surfaceY(lx) - 0.4) {
				this.surface.poke(lx, this.fill > 0.05 ? 0.7 : 0, 3);
				if (this.rand() < 0.035 && this.fill > 0.08) this.splash(lx, this.surfaceY(lx), 1, p.c);
				return false;
			}
			return p.age < 1.2;
		});
	}
	private splash(x: number, y: number, n: number, c?: string, speed = 1) {
		x = Math.max(-1, Math.min(1, x / Math.max(1, insideHalf(this.drink, y)))) * insideHalf(this.drink, y) * 0.6;
		for (let i = 0; i < n; i++) {
			const [wx, wy] = this.toWorld(x, y - 0.5);
			const room = Math.min(1, insideHalf(this.drink, y) / 10);
			this.drops.push({
				x: wx,
				y: wy,
				vx: (this.rand() - 0.5) * 90 * speed * room,
				vy: -(70 + this.rand() * 90) * speed,
				r: 0.55 + this.rand() * 0.45,
				life: 0.8,
				age: 0,
				tint: 0,
				kind: "drop",
				c: c ?? this.drink.liquid,
			});
		}
	}
	private stepDropsAll() {
		stepDrops(this.drops);
		const d = this.drink;
		this.drops = this.drops.filter((p) => {
			if (p.kind === "plume") return p.age < p.life && p.y < insideBottom(d) - 1;
			if (p.kind === "bubble") {
				// Bubbles live in the glass's frame and burst at the surface.
				return p.age < p.life && p.y > this.surfaceY(p.x) + 0.6 && this.fill > 0;
			}
			if (p.kind === "drop" && p.vy > 0 && !this.upsideDown && this.fill > 0.1 && p.age > 0.08) {
				const lx = p.x - this.x;
				const ly = p.y - this.y;
				if (Math.abs(lx) < insideHalf(d, this.levelY) && Math.abs(ly - this.surfaceY(lx)) < 2.5) {
					this.surface.poke(lx, 4, 1.6);
					return false;
				}
			}
			return p.age < p.life && p.y < 30;
		});
	}
	private bubble(n: number, spread = 1) {
		const d = this.drink;
		const b = insideBottom(d);
		for (let i = 0; i < n; i++) {
			const y = b - 1 - this.rand() * (this.levelY - b) * -0.3;
			const w = insideHalf(d, y) * 0.75 * spread;
			this.drops.push({
				x: (this.rand() * 2 - 1) * w,
				y,
				vx: 0,
				vy: -10 - this.rand() * 20,
				r: 0.35 + this.rand() * 0.3,
				life: 3,
				age: -this.rand() * 0.8,
				tint: this.rand(),
				kind: "bubble",
			});
		}
	}

	/* ---------- Garnish ---------- */
	private arrive(it: Item) {
		it.on = true;
		it.t = 0;
		it.world = false;
		const g = it.g;
		if (g.arrive === "drop") {
			it.mode = "fall";
			it.x = g.x + (this.rand() - 0.5) * 2;
			it.y = this.drink.level - this.drink.height * 0.55 - 6;
			it.a = g.a - 40;
			it.vx = 0;
			it.vy = 40;
			it.va = 120;
		} else if (g.arrive === "rim") {
			it.mode = "place";
			it.s = 1;
		} else {
			it.mode = "stand";
			it.s = g.kind === "umbrella" || g.kind === "crown" ? 0 : 1;
		}
	}
	private stepItems() {
		for (const it of this.items) {
			if (!it.on) continue;
			it.t += STEP;
			const g = it.g;
			if (it.mode === "fly") {
				it.vy += G * STEP;
				it.x += it.vx * STEP;
				it.y += it.vy * STEP;
				it.a += it.va * STEP;
				if (it.t > 1.4) it.on = false;
			} else if (it.mode === "fall") {
				it.vy += G * STEP;
				it.y += it.vy * STEP;
				it.a += it.va * STEP;
				const top = this.surfaceY(it.x);
				if (it.y + 2 >= top) {
					this.surface.poke(it.x, Math.min(60, it.vy * 0.16), 3);
					this.splash(it.x, top, 6, undefined, 1.2);
					it.mode = "float";
					it.vy *= 0.2;
				}
			} else if (it.mode === "rest" && g.arrive !== "drop") {
				// Stood or set on the rim: fixed to the glass, nudged back if an idle moved it.
				it.x = g.x;
				it.y = g.y;
				[it.a, it.va] = spring(it.a, it.va, g.a, 160, 9);
				it.s = 1;
			} else if (it.mode === "float" || it.mode === "rest") {
				// Floating: held under the surface by buoyancy, carried by its waves, turned back to its angle.
				const top = this.fill > 0 ? this.surfaceY(it.x) : this.drink.level;
				const want = top + g.y;
				[it.y, it.vy] = spring(it.y, it.vy, want, 140, 9);
				[it.a, it.va] = spring(it.a, it.va, g.a + this.surface.at(it.x) * 8, 90, 8);
				const drift = Math.sin(this.tilt - (this.upsideDown ? Math.PI : 0)) * 6;
				[it.x, it.vx] = spring(it.x, it.vx, g.x + drift, 50, 8);
				if (it.mode === "float" && Math.abs(it.y - want) < 0.05 && Math.abs(it.vy) < 0.3 && it.t > 0.6) it.mode = "rest";
			} else if (it.mode === "place") {
				// Set on the rim by a hand: down and in from above-right, a little past its angle, then back.
				const u = clamp01(it.t / 0.42);
				it.x = lerp(g.x + 10, g.x, easeOut(u));
				it.y = lerp(g.y - 22, g.y, easeBack(u, 1.2));
				it.a = g.a + (1 - easeBack(u, 2.2)) * -70;
				if (u >= 1) {
					it.mode = "rest";
					this.kickTo(g.x > 0 ? 2.5 : -2.5);
					this.surface.poke(g.x * 0.6, 3);
				}
			} else if (it.mode === "stand") {
				const u = clamp01(it.t / 0.32);
				if (g.kind === "crown") {
					it.s = easeBack(clamp01(it.t / 0.55), 1.4);
					it.spin = clamp01((it.t - 0.4) / 1.1);
					if (it.t > 1.6) it.mode = "rest";
				} else {
					// Stood in the glass: it slides down in, then leans to rest against the rim; the umbrella opens.
					it.x = g.x;
					it.y = lerp(g.y - 30, g.y, easeIn(u));
					if (u < 1) it.a = g.a * 0.15;
					else [it.a, it.va] = spring(it.a, it.va, g.a, 160, 7);
					if (g.kind === "umbrella" && u >= 1 && it.t > 0.42) [it.s, it.sv] = spring(it.s, it.sv, 1, 260, 10);
					if (u >= 1 && !it.vx) {
						it.vx = 1;
						this.surface.poke(g.x, 6);
						this.splash(g.x, this.surfaceY(g.x), 3);
					}
					if (u >= 1 && Math.abs(it.a - g.a) < 0.05 && Math.abs(it.va) < 0.3 && (g.kind !== "umbrella" || Math.abs(it.s - 1) < 0.01)) {
						it.mode = "rest";
						it.a = g.a;
						it.s = 1;
						it.vx = 0;
					}
				}
			}
		}
	}

	/* ---------- The moments ---------- */
	private once(key: string, when: boolean, fn: () => void) {
		if (when && !this.flags.has(key)) {
			this.flags.add(key);
			fn();
		}
	}
	private settled(t: number, after: number) {
		// Drops fly on by themselves; a moment waits only for the glass.
		return t < after || !(Math.abs(this.rock.theta) < 0.01 && Math.abs(this.rock.omega) < 0.6 && Math.abs(this.sq - 1) < 0.01);
	}

	private scriptFor(m: Moment): (t: number) => boolean {
		switch (m) {
			case "flip":
				return this.turnOver(0);
			case "unflip":
				return this.turnOver(180);
			case "pour":
				return this.pourScript();
			case "spill":
				return this.spillScript();
			case "swap":
				return this.swapScript();
			case "jitter":
				return (t) => {
					for (let i = 0; i < 5; i++)
						this.once(`k${i}`, t >= i * 0.11, () => this.kickTo((i % 2 ? -1 : 1) * (2.2 + this.rand() * 1.4) * (i === 0 ? 1 : 1.6)));
					return this.settled(t, 0.6);
				};
			case "tip": {
				const side = this.rand() < 0.5 ? -1 : 1;
				return (t) => {
					// It leans as if to fall, then gravity takes it back and it rattles flat.
					this.once("k", true, () => this.kickTo(side * (this.rock.tipping / DEG) * 0.72));
					return this.settled(t, 0.4);
				};
			}
			case "hop":
				return this.hopScript();
			case "scoot":
				return (t) => {
					const u = clamp01(t / 0.9);
					this.x = Math.sin(u * Math.PI) * 3.5 * (1 - u * 0.3);
					this.once("stop", t >= 0.45, () => this.kickTo(4));
					this.once("back", t >= 0.9, () => {
						this.x = 0;
						this.kickTo(-4);
					});
					return this.settled(t, 1);
				};
			case "slosh":
				return (t) => {
					this.once("k", true, () => this.kickTo((this.rand() < 0.5 ? -1 : 1) * Math.min(9, (this.rock.tipping / DEG) * 0.4)));
					this.once("k2", t > 0.55, () => this.kickTo(-Math.sign(this.rock.theta || 1) * 4));
					return t < 1.6 || !this.surface.calm;
				};
			case "swirl":
				return (t) => {
					// Swirled on the table: the foot slides in small circles and the wine climbs the bowl.
					const env = Math.sin(clamp01(t / 1.6) * Math.PI);
					this.x = Math.sin(t * Math.PI * 2 * 2.4) * 1.8 * env;
					this.holdRock = true;
					this.rock.theta = Math.cos(t * Math.PI * 2 * 2.4) * 2.5 * DEG * env;
					if (t >= 1.6) {
						this.x = 0;
						this.rock.theta = 0;
						this.holdRock = false;
					}
					return t < 1.6 || !this.surface.calm;
				};
			case "fizz":
				return (t) => {
					this.once("b", true, () => this.bubble(16));
					this.once("b2", t > 0.4, () => this.bubble(10));
					this.foam = 1 + 0.35 * Math.sin(clamp01(t / 1.4) * Math.PI);
					const crown = this.items.find((i) => i.g.kind === "crown");
					if (crown) crown.spin = t < 1.5 ? Math.max(crown.spin, clamp01(t / 1.5)) : crown.spin;
					if (t >= 1.4) this.foam = 1;
					return t < 1.8;
				};
			case "clink":
				return (t) => {
					const ice = this.items.filter((i) => i.g.kind === "ice");
					ice.forEach((it, i) => {
						this.once(`c${i}`, t >= i * 0.18, () => {
							it.vy += 18;
							it.va += i % 2 ? -60 : 60;
							this.surface.poke(it.x, 5);
						});
					});
					this.once("s", t >= 0.22, () => {
						const r = this.drink.rim;
						this.sparkles.push({ x: r.rx * 0.7, y: r.y - 3, age: 0, size: 2.6, life: 0.55 });
					});
					this.once("k", true, () => this.kickTo(3));
					return t < 1.4;
				};
			case "twirl":
				return (t) => {
					const u = this.items.find((i) => i.g.kind === "umbrella");
					if (u) u.spin = easeInOut(clamp01(t / 1.3)) * Math.PI * 4;
					this.once("k", t > 0.2, () => this.kickTo(-3));
					return t < 1.5;
				};
			case "bob":
				return (t) => {
					const c = this.items.find((i) => i.g.kind === "cherry-pick");
					this.once("d", true, () => {
						if (c) {
							c.vy += 28;
							c.va += 40;
						}
						this.surface.poke(c?.x ?? 0, 6);
					});
					this.once("d2", t > 0.7, () => {
						if (c) c.vy += 14;
					});
					return t < 1.6;
				};
		}
	}

	/** Turned over by a flick: it crouches, jumps, turns half a circle in the air and lands, rattling. */
	private turnOver(to: 0 | 180) {
		const from = to === 0 ? 180 : 0;
		const crouch = 0.16;
		const v = Math.sqrt(2 * G * 24);
		const air = (2 * v) / G;
		return (t: number) => {
			if (t < crouch) {
				this.sq = 1 - 0.09 * easeOut(t / crouch);
				this.sqv = 0;
				return true;
			}
			const u = t - crouch;
			if (u < air) {
				this.once("up", true, () => {
					this.absorbRock();
					this.sq = 1.07;
					this.sqv = 0;
				});
				this.y = -v * u + (G * u * u) / 2;
				this.a = from + 180 * (u / air);
				return true;
			}
			this.once("land", true, () => {
				this.y = 0;
				this.x = 0;
				this.a = to;
				this.look = to === 0 ? "up" : "down";
				this.ground();
				this.land(1);
				this.kickTo((this.rand() < 0.5 ? -1 : 1) * Math.min(7, (this.rock.tipping / DEG) * 0.3));
			});
			return this.settled(u - air, 0.5);
		};
	}

	private hopScript() {
		const v = Math.sqrt(2 * G * 6);
		const air = (2 * v) / G;
		const side = this.rand() < 0.5 ? -1 : 1;
		return (t: number) => {
			if (t < 0.12) {
				this.sq = 1 - 0.06 * easeOut(t / 0.12);
				this.sqv = 0;
				return true;
			}
			const u = t - 0.12;
			if (u < air) {
				this.once("up", true, () => this.absorbRock());
				this.y = -v * u + (G * u * u) / 2;
				this.a = (this.look === "down" ? 180 : 0) + side * 7 * Math.sin((u / air) * Math.PI);
				return true;
			}
			this.once("land", true, () => {
				this.y = 0;
				this.a = this.look === "down" ? 180 : 0;
				this.land(0.6);
				this.kickTo(side * 5);
			});
			return this.settled(u - air, 0.4);
		};
	}

	/** Poured from its vessel (or two: a layered drink), then garnished, then a small flourish. */
	private pourScript() {
		const d = this.drink;
		const stages: { pour: Pour; start: number; open: number; stop: number; end: number }[] = [];
		let at = 0;
		for (const [i, pour] of d.pours.entries()) {
			const dash = i > 0;
			const cork = pour.vessel === "champagne";
			const open = at + 0.74 + (cork ? 0.4 : 0);
			const stop = open + (dash ? 0.45 : 1.15);
			stages.push({ pour, start: at, open, stop, end: stop + 0.8 });
			at = stop + 0.35;
		}
		const garnishAt = stages[stages.length - 1].end - 0.05;
		const lastGarnish = Math.max(0, ...d.garnish.map((g) => g.at));
		const flourish = garnishAt + lastGarnish + 0.75;
		const rim = d.rim;
		const mouth = { x: Math.min(5, rim.rx * 0.45) + 1.5, y: rim.y - 15 };
		return (t: number) => {
			const stage = stages.find((s) => t >= s.start && t < s.end + 0.05) ?? null;
			if (stage) this.vesselAt(stage, t, mouth);
			else if (this.vessel) this.vessel.on = false;
			// The liquid rises as the stream lands (it takes a moment to fall).
			const main = stages[0];
			const flow = clamp01((t - main.open - 0.12) / (main.stop - main.open));
			this.fill = Math.max(this.fill, easeOut(flow) * 0.98 + (flow >= 1 ? 0.02 : 0));
			if (d.sinks && stages[1]) {
				const s = stages[1];
				this.sink = easeInOut(clamp01((t - s.open - 0.1) / (s.stop - s.open + 0.7)));
				this.once("plume", t > s.open + 0.15, () => {
					for (let i = 0; i < 7; i++)
						this.drops.push({
							x: (this.rand() - 0.5) * 5,
							y: d.level + 1.5,
							vx: 0,
							vy: 10,
							r: 0.9 + this.rand() * 0.8,
							life: 1.1,
							age: -i * 0.07,
							tint: this.rand(),
							kind: "plume",
							c: d.sinks?.colour,
						});
				});
			}
			if (d.foam) {
				const target = d.foam.crown ? 1 : 1;
				const surge = d.foam.crown ? 0 : 2.6 * Math.sin(clamp01((t - main.open) / (main.stop - main.open + 0.9)) * Math.PI);
				this.foam = Math.min(target, flow * 1.3) + Math.max(0, surge);
			}
			if (d.bubbles && t > main.open + 0.2 && t < flourish && Math.floor(t / 0.09) !== Math.floor((t - STEP) / 0.09)) this.bubble(1);
			for (const it of this.items) if (!it.world) this.once(`g${d.garnish.indexOf(it.g)}`, t >= garnishAt + it.g.at, () => this.arrive(it));
			this.once("full", t >= garnishAt, () => (this.look = "full"));
			this.once("flourish", t >= flourish, () => {
				this.kickTo(this.rand() < 0.5 ? -4 : 4);
				const h = d.height;
				const pts: [number, number, number][] = [
					[-rim.rx - 7, -h * 0.75, 3.2],
					[rim.rx + 8, -h * 0.9, 2.6],
					[-rim.rx - 2, -h - 8, 2.2],
					[rim.rx + 4, -h * 0.4, 2],
					[rim.rx * 0.2 + 2, -h - 13, 2.8],
				];
				pts.forEach(([x, y, size], i) => {
					this.sparkles.push({ x, y, age: -i * 0.07, size, life: 0.75 });
				});
			});
			return t < flourish + 0.3 || this.items.some((i) => i.on && i.mode !== "rest") || this.sparkles.length > 0;
		};
	}
	private vesselAt(s: { pour: Pour; start: number; open: number; stop: number; end: number }, t: number, mouth: { x: number; y: number }) {
		if (!this.vessel || this.vessel.pour !== s.pour) {
			this.vessel = {
				pour: s.pour,
				x: 0,
				y: 0,
				a: 0,
				on: true,
				cork: { x: 0, y: 0, a: 0, vx: 0, vy: 0, va: 0, on: s.pour.vessel === "champagne", out: false },
			};
		}
		const v = this.vessel;
		v.on = true;
		const pourA = s.pour.vessel === "jug" || s.pour.vessel === "carafe" ? -78 : -116;
		const enterEnd = s.start + 0.5;
		const cork = s.pour.vessel === "champagne";
		// Where it comes from and goes back to: well outside the stage, up and to the right, so it is carried in and
		// out of view, never popping up or vanishing in plain sight.
		const off = { x: mouth.x + 78, y: mouth.y - 80 };
		if (t < enterEnd) {
			// In from above right, a little past its place, then back.
			const u = (t - s.start) / 0.5;
			v.x = lerp(off.x, mouth.x + 5, easeBack(u, 1.1));
			v.y = lerp(off.y, mouth.y - 9, easeOut(u));
			v.a = lerp(10, cork ? -40 : -48, easeOut(u));
		} else if (t < s.open) {
			if (cork) {
				// Shaken, then the cork goes.
				const shake = t - enterEnd;
				v.a = -40 + Math.sin(shake * 70) * 5 * clamp01(shake / 0.2);
				this.once("pop", t > s.open - 0.22, () => {
					v.cork.out = true;
					v.cork.vx = -60;
					v.cork.vy = -420;
					v.cork.va = -900;
					for (let i = 0; i < 14; i++) {
						const ang = -Math.PI / 2 + (this.rand() - 0.5) * 1.2;
						const sp = 120 + this.rand() * 160;
						this.drops.push({
							x: v.x,
							y: v.y,
							vx: Math.cos(ang) * sp,
							vy: Math.sin(ang) * sp,
							r: 0.7 + this.rand() * 0.9,
							life: 0.7,
							age: 0,
							tint: 0,
							kind: "foam",
							c: FOAM,
						});
					}
					this.sparkles.push({ x: v.x - 3, y: v.y - 8, age: 0, size: 3.4, life: 0.4 });
				});
			} else {
				// A breath before it tips (the hand's anticipation).
				const u = (t - enterEnd) / (s.open - enterEnd);
				v.a = lerp(-48, pourA, easeInOut(u)) + Math.sin(u * Math.PI) * 9;
			}
			v.x = lerp(v.x, mouth.x, 0.06);
			v.y = lerp(v.y, mouth.y, 0.06);
		} else if (t < s.stop) {
			const u = clamp01((t - s.open) / 0.18);
			v.a = cork ? lerp(-40, pourA, easeInOut(u)) : pourA;
			v.x = lerp(v.x, mouth.x, 0.08) + Math.sin(t * 9) * 0.04;
			v.y = lerp(v.y, mouth.y, 0.08);
			if (!cork || u >= 0.8) this.emit(v, s.pour, t);
		} else {
			// Back up, a last drip, and away.
			const u = (t - s.stop) / (s.end - s.stop);
			v.a = lerp(pourA, 22, easeInOut(clamp01(u * 1.6)));
			const w = clamp01((u - 0.22) / 0.78) ** 2;
			v.x = lerp(mouth.x, off.x, w);
			v.y = lerp(mouth.y, off.y, w);
			this.once(`drip${s.start}`, u > 0.12, () => this.stream.push(this.streamDrop(v, s.pour, 0.25)));
		}
		const c = v.cork;
		if (c.out) {
			c.vy += G * STEP;
			c.x += c.vx * STEP;
			c.y += c.vy * STEP;
			c.a += c.va * STEP;
			if (c.y > 60) c.on = false;
		} else {
			c.x = v.x;
			c.y = v.y;
			c.a = v.a;
		}
	}
	private streamDrop(v: Vessel, pour: Pour, speed = 1): Drop {
		const a = v.a * DEG;
		const sp = 34 * speed * (1 + 0.1 * Math.sin(this.clock * 31));
		return { x: v.x, y: v.y, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, r: 1, life: 1.2, age: 0, tint: 0, kind: "stream", c: pour.colour };
	}
	private emit(v: Vessel, pour: Pour, _t: number) {
		this.stream.push(this.streamDrop(v, pour));
	}

	/** Yesterday's drink, thrown out: a lean back, a quick swing up and to the right that lets the drink fly, and the
	 * glass falls back upside down. */
	private spillScript() {
		const d = this.drink;
		let from: { a: number; x: number; y: number } | null = null;
		return (t: number) => {
			if (t < 0.24) {
				this.holdRock = true;
				this.rock.theta = -easeOut(t / 0.24) * Math.min(9, (this.rock.tipping / DEG) * 0.6) * DEG;
				this.sq = 1 - 0.04 * easeOut(t / 0.24);
				return true;
			}
			this.once("lift", true, () => {
				this.absorbRock();
				this.holdRock = false;
			});
			if (from === null) from = { a: this.a, x: this.x, y: this.y };
			const { a: a0, x: x0, y: y0 } = from;
			const u = t - 0.24;
			if (u < 0.2) {
				// The throw: fast, up and right, turning clockwise.
				const w = u / 0.2;
				this.a = lerp(a0, 62, w * w * (2 - w));
				this.x = lerp(x0, 7, easeIn(w));
				this.y = lerp(y0, -10, w * w);
				return true;
			}
			this.once("release", true, () => this.release());
			if (u < 0.62) {
				// It turns on over the top and falls back to the table, upside down.
				const w = (u - 0.2) / 0.42;
				this.a = lerp(62, 180, easeOut(w));
				this.x = lerp(7, 0, easeInOut(w));
				this.y = lerp(-12, 0, easeIn(w)) + -10 * Math.sin(w * Math.PI) * (1 - w);
				// Whatever is still in it pours off the rim.
				if (w < 0.4 && Math.floor(u / 0.025) !== Math.floor((u - STEP) / 0.025)) {
					const [rx, ry] = this.toWorld(d.rim.rx, d.rim.y);
					this.drops.push({
						x: rx,
						y: ry,
						vx: 30 + this.rand() * 40,
						vy: -40 + this.rand() * 40,
						r: 0.7 + this.rand() * 0.6,
						life: 1,
						age: 0,
						tint: 0,
						kind: "drop",
						c: d.liquid,
					});
				}
				return true;
			}
			this.once("land", true, () => {
				this.a = 180;
				this.x = 0;
				this.y = 0;
				this.look = "down";
				this.ground();
				this.land(1);
				this.kickTo(-Math.min(8, (this.rock.tipping / DEG) * 0.4));
			});
			return this.settled(u - 0.62, 0.3);
		};
	}
	/** The drink leaves the glass with the glass's speed: drops sampled through the liquid, each moving as the point
	 * of the glass it was at, plus the throw's push; the garnish goes with it, spinning. */
	private release() {
		const d = this.drink;
		const b = insideBottom(d);
		const top = this.levelY;
		const prev = this.prev;
		const at = (px: number, py: number) => this.toWorld(px, py);
		const before = (px: number, py: number) => {
			const keep = { a: this.a, x: this.x, y: this.y };
			Object.assign(this, prev);
			const p = this.toWorld(px, py);
			Object.assign(this, keep);
			return p;
		};
		const n = 56;
		for (let i = 0; i < n; i++) {
			const fy = this.rand();
			const py = lerp(top, b, fy * 0.9);
			const half = insideHalf(d, py) * 0.85;
			const px = (this.rand() * 2 - 1) * half;
			const [wx, wy] = at(px, py);
			const [ox, oy] = before(px, py);
			const k = 1 / STEP;
			const lag = fy * 0.5;
			const sinks = d.sinks && fy > 1 - d.sinks.depth;
			this.drops.push({
				x: wx,
				y: wy,
				vx: (wx - ox) * k * 0.45 + 125 + this.rand() * 40 - lag * 40,
				vy: (wy - oy) * k * 0.3 - 250 - this.rand() * 50 + lag * 120,
				r: 1.3 + this.rand() * 1.3 * (1 - fy * 0.4),
				life: 1.3,
				age: -lag * 0.12,
				tint: 0,
				kind: "drop",
				c: sinks ? d.sinks?.colour : this.rand() < 0.15 && d.foam ? FOAM : d.liquid,
			});
		}
		for (const it of this.items) {
			if (!it.on) continue;
			if (it.g.kind === "crown") {
				// Foam goes as foam, not as a lid.
				it.on = false;
				for (let i = 0; i < 10; i++) {
					const [fx, fy] = at((this.rand() * 2 - 1) * d.rim.rx, d.rim.y - 2);
					this.drops.push({
						x: fx,
						y: fy,
						vx: 130 + this.rand() * 40,
						vy: -230 - this.rand() * 60,
						r: 1.4 + this.rand(),
						life: 1.2,
						age: 0,
						tint: 0,
						kind: "drop",
						c: FOAM,
					});
				}
				continue;
			}
			const [wx, wy] = at(it.x, it.y);
			it.world = true;
			it.mode = "fly";
			it.x = wx;
			it.y = wy;
			it.a += this.a;
			it.vx = 160 + this.rand() * 60;
			it.vy = -280 - this.rand() * 100;
			it.va = (this.rand() < 0.5 ? -1 : 1) * (400 + this.rand() * 500);
			it.t = 0;
		}
		this.fill = 0;
		this.sink = 0;
		this.foam = 0;
		this.surface.reset();
		this.drops = this.drops.filter((p) => p.kind !== "bubble");
	}

	/** A new day's glass: the old one is slid away to the left, the new one slides in from the right and, stopping,
	 * tips forward and rattles. */
	private swapScript() {
		return (t: number) => {
			if (t < 0.36) {
				this.holdRock = true;
				const u = t / 0.36;
				this.x = lerp(0, -66, u * u);
				this.rock.theta = Math.sin(u * Math.PI) * 3 * DEG;
				return true;
			}
			this.once("change", true, () => {
				this.x = 70;
				this.dress(this.next ?? this.drink, "down");
				this.holdRock = true;
			});
			const u = (t - 0.36) / 0.46;
			if (u < 1) {
				this.x = lerp(70, 0, easeOut(u));
				this.rock.theta = -Math.sin(u * Math.PI) * 2 * DEG;
				return true;
			}
			this.once("stop", true, () => {
				this.x = 0;
				this.rock.theta = 0;
				this.holdRock = false;
				this.kickTo(-Math.min(12, (this.rock.tipping / DEG) * 0.55));
			});
			return this.settled(u - 1, 0.3);
		};
	}

	/* ---------- Drawing: paths in the glass's frame ---------- */
	/** The liquid's body: from the surface down past the bottom (the inside clips it). */
	liquidPath() {
		const xs = this.surface.x;
		const pts = xs.map((x) => `${f(x)} ${f(this.surfaceY(x))}`).join("L");
		const w = xs[xs.length - 1];
		const b = insideBottom(this.drink) + 30;
		return `M${pts}L${f(w)} ${b}L${f(-w)} ${b}Z`;
	}
	/** The layer that has sunk, with a soft wavy top and a band of the colours between. */
	sinkPath(offset = 0) {
		const d = this.drink;
		if (!d.sinks || this.sink <= 0) return "";
		const b = insideBottom(d);
		const depth = (this.levelY - b) * d.sinks.depth * this.sink - offset;
		const xs = this.surface.x;
		const lean = Math.tan(this.tilt);
		const pts = xs
			.map((x) => `${f(x)} ${f(b + depth - x * lean + 0.7 * Math.sin(x * 0.55 + this.clock * 2.4) + this.surface.at(x) * 0.4)}`)
			.join("L");
		const w = xs[xs.length - 1];
		return `M${pts}L${f(w)} ${b + 30}L${f(-w)} ${b + 30}Z`;
	}
	/** The foam: a band over the liquid, bumpy along its top. */
	foamPath() {
		const d = this.drink;
		if (!d.foam || this.foam <= 0.01 || this.fill <= 0) return "";
		const depth = d.foam.depth * this.foam;
		const xs = this.surface.x;
		const top = xs.map((x) => `${f(x)} ${f(this.surfaceY(x) - depth + 0.55 * Math.sin(x * 1.4 + this.clock * 1.5))}`).join("L");
		const bottom = [...xs]
			.reverse()
			.map((x) => `${f(x)} ${f(this.surfaceY(x) + 0.4)}`)
			.join("L");
		return `M${top}L${bottom}Z`;
	}
	/** The surface seen from a little above: an ellipse riding the waves (or the foam's top). */
	topPath() {
		if (this.fill <= 0.02) return "";
		const d = this.drink;
		const foam = d.foam && this.foam > 0.01 ? d.foam.depth * this.foam : 0;
		const y0 = this.levelY - foam;
		const rx = insideHalf(d, Math.max(y0, d.rim.y)) * 0.97;
		const ry = rx * flatness(d, y0);
		const n = 28;
		const top: string[] = [];
		const bottom: string[] = [];
		for (let i = 0; i <= n; i++) {
			const x = -rx + (2 * rx * i) / n;
			const yc = this.surfaceY(x) - foam;
			const e = ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
			top.push(`${f(x)} ${f(yc - e)}`);
			bottom.unshift(`${f(x)} ${f(yc + e)}`);
		}
		return `M${top.join("L")}L${bottom.join("L")}Z`;
	}
	/** Everything above the surface (glass frame): what stands in the drink shows here as itself, and below it through the drink. */
	abovePath() {
		const xs = this.surface.x;
		const pts = xs.map((x) => `${f(x)} ${f(this.surfaceY(x))}`).join("L");
		const w = xs[xs.length - 1];
		return `M${f(-w)} -120L${f(w)} -120L${pts.split("L").reverse().join("L")}Z`;
	}
	/** The darker depth of the drink, low in the glass, its top bowing like the floor. */
	deepPath() {
		const d = this.drink;
		const b = insideBottom(d);
		const top = lerp(b, this.levelY, 0.45);
		const w = insideHalf(d, top) + 4;
		const bow = (d.base?.ry ?? 1) * 1.6;
		return `M${f(-w - 6)} ${f(top)}Q0 ${f(top + bow * 2)} ${f(w + 6)} ${f(top)}L${f(w + 6)} ${b + 30}L${f(-w - 6)} ${b + 30}Z`;
	}
	/** The stream, world coordinates, newest at the mouth. */
	streamPath() {
		if (this.stream.length < 2) return "";
		return `M${this.stream.map((p) => `${f(p.x)} ${f(p.y)}`).join("L")}`;
	}
}

const f = (n: number) => (Math.abs(n) < 1e-4 ? "0" : n.toFixed(2));
