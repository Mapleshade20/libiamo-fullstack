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
