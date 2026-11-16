/** A picture behind the home page and the scene card, as the server hands it to the page (server/backdrop/today.ts). */
type Shown = {
	/** The 1600-pixel file; `srcset` adds the 800-pixel one. */
	src: string;
	srcset: string;
	width: number;
	height: number;
	/** Its average colour, shown faintly while it loads. */
	color: string;
	credit: string;
};
/** An old print along the bottom: how far its edge drops past the page's (per cent), how much it is enlarged, its ink. */
export type PrintShown = Shown & { kind: "image"; drop: number; zoom: number; ink: number };
/** A painting over the whole page: where its interest lies across and down (per cent). */
export type PaintingShown = Shown & { kind: "painting"; x: number; y: number };
/** The day's print and painting, both, so changing the setting needs no request. */
export type Pictures = { image: PrintShown; painting: PaintingShown };
