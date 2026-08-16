export type HallTaskKind = "task" | "translate";
export type HallTaskCardKey = `${HallTaskKind}:${number}`;

export function hallTaskCardKey(kind: HallTaskKind, id: number): HallTaskCardKey {
	return `${kind}:${id}`;
}

export function toggleHallTaskCard(current: HallTaskCardKey | null, kind: HallTaskKind, id: number): HallTaskCardKey | null {
	const next = hallTaskCardKey(kind, id);
	return current === next ? null : next;
}
