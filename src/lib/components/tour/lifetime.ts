let epoch = 0;
export const invalidateTourState = () => {
	epoch++;
};
/** A callback belongs to the chapter (or real page) that created it, never the next sandbox. */
export const captureTourState = () => {
	const was = epoch;
	return () => epoch === was;
};
