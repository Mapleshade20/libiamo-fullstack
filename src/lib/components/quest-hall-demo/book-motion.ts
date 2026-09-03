export const CARTE_BOOK_SPIN_DURATION = 1.18;
export const CARTE_BOOK_FULL_TURN = -360;

export interface CarteBookMotionTiming {
	spinDuration: number;
	coverStart: number;
	coverDuration: number;
	totalDuration: number;
}

function boundedUnit(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

/**
 * A CARTE left on the bureau is never quite still. The two axes wander on
 * their own periods so the composite never repeats and never swings back
 * through a neutral pose, which is what tells the eye it is a resting object
 * rather than a looping animation.
 */
export const CARTE_IDLE_SWAY = {
	/** Nodding about the horizontal axis, in degrees either side of flat. */
	pitch: 5,
	pitchPeriod: 3.3,
	/** Turning about the vertical axis, in degrees either side of flat. */
	yaw: 6.6,
	yawPeriod: 2.8,
} as const;

export interface CarteCoverLight {
	/** Centre of the satin lobe, in % of the board. */
	sheenX: number;
	sheenY: number;
	/** Strength of the lobe and of the far-corner falloff, 1 at rest. */
	gloss: number;
	shade: number;
}

// The bureau's one source: a soft window high on the front-left, about ten
// o'clock and some 35° above the desk. Screen axes, x right, y down, z out.
const KEY_LIGHT = { x: -0.45, y: -0.6, z: 0.66 } as const;
// Where the lobe sits when the board lies square to the reader.
const SHEEN_REST_X = 32;
const SHEEN_REST_Y = 26;
// Book board is never flat — it bows a little toward the reader — so the lobe
// is broad and travels this far, in % of the board, per degree of rotation.
const SHEEN_YAW_TRAVEL = -4;
const SHEEN_PITCH_TRAVEL = 3.6;

/**
 * Models what that single window does to the closed cover as it sways. The
 * board is a slightly bowed sheet of cloth, so the window lays a broad satin
 * lobe on it rather than a mirror point: the lobe slides across the board as
 * the normal turns, while the whole face brightens or dims with how squarely
 * it still faces the window.
 */
export function createCarteCoverLight(rotateX: number, rotateY: number): CarteCoverLight {
	const yaw = Math.sin((rotateY * Math.PI) / 180);
	const pitch = Math.sin((rotateX * Math.PI) / 180);
	// N = (yaw, -pitch, ~1) for a board turned by these angles; this is N·L
	// read relative to its resting value, so it is 0 when the board lies flat.
	const lit = (KEY_LIGHT.x * yaw - KEY_LIGHT.y * pitch) / KEY_LIGHT.z;

	return {
		sheenX: SHEEN_REST_X + SHEEN_YAW_TRAVEL * rotateY,
		sheenY: SHEEN_REST_Y + SHEEN_PITCH_TRAVEL * rotateX,
		// The lobe is laid down faint, so it has to swing proportionally harder
		// for the sway to still read on the cloth.
		gloss: clamp(1 + lit * 3.1, 0.35, 1.6),
		shade: clamp(1 - lit * 2.2, 0.3, 1.7),
	};
}

export const CARTE_COVER_LIGHT_REST = createCarteCoverLight(0, 0);

/**
 * Keeps the choreography organic while preserving its physical hand-off points.
 * Passing a value makes the geometry deterministic for tests and replay tooling.
 */
export function createCarteBookOpenTiming(randomValue = Math.random()): CarteBookMotionTiming {
	const random = boundedUnit(randomValue);
	const remainingSpinDegrees = 46 + random * 10;
	// The whole book uses power2.inOut. In its second half, the remaining
	// rotation is 4(1-t)³, so schedule from the visible angle rather than
	// from linear timeline progress.
	const coverStart = CARTE_BOOK_SPIN_DURATION * (1 - Math.cbrt(remainingSpinDegrees / 1440));
	const totalDuration = CARTE_BOOK_SPIN_DURATION + 0.06 + random * 0.18;

	return {
		spinDuration: CARTE_BOOK_SPIN_DURATION,
		coverStart,
		coverDuration: totalDuration - coverStart,
		totalDuration,
	};
}

/**
 * Matches the cover's take-off velocity to the whole book's power2.inOut
 * velocity at the hand-off, then eases the cover naturally to rest.
 */
export function createCarteBookOpenEase(timing: CarteBookMotionTiming): (progress: number) => number {
	const spinProgress = boundedUnit(timing.coverStart / timing.spinDuration);
	const spinProgressPerSecond = (12 * (1 - spinProgress) ** 2) / timing.spinDuration;
	const initialSlope = 2 * spinProgressPerSecond * timing.coverDuration;

	return (value: number) => {
		const progress = boundedUnit(value);
		return (-2 + initialSlope) * progress ** 3 + (3 - 2 * initialSlope) * progress ** 2 + initialSlope * progress;
	};
}

export function createCarteBookCloseTiming(randomValue = Math.random()): CarteBookMotionTiming {
	const random = boundedUnit(randomValue);
	const coverDuration = 0.68 + random * 0.12;
	const joinedAfterDegrees = 20 + random * 15;
	// The cover uses power1.inOut. During its first half GSAP's eased
	// progress is 2t², so convert the physical angle back to timeline time.
	const coverStart = coverDuration * Math.sqrt(joinedAfterDegrees / 360);

	return {
		spinDuration: CARTE_BOOK_SPIN_DURATION,
		coverStart,
		coverDuration,
		totalDuration: coverStart + CARTE_BOOK_SPIN_DURATION,
	};
}
