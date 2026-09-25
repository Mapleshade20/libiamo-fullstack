import type { Component } from "svelte";
import type { FlameAppearance } from "$lib/streak-presentation";
import DefaultFlame from "./DefaultFlame.svelte";
/** Seasonal art has no dates, streak rules or storage. */
export interface StreakArtProps {
	appearance: FlameAppearance;
	ignite?: boolean;
	moving?: boolean;
	reduced?: boolean;
	speed?: number;
	onready?: () => void;
	/** Flame has reached its upper pose and cleared the calendar area. */
	onrise?: () => void;
	/** Signals the skin's own ignition duration; the host must not assume a frame count. */
	onigniteend?: () => void;
}
export const streakSkin: { Art: Component<StreakArtProps> } = { Art: DefaultFlame };
