export type CarteRibbonTone = "wine" | "olive" | "blue" | "ink";

export interface CarteRibbonTab {
	id: string;
	label: string;
	shortLabel?: string;
	count?: number;
	panelId?: string;
	disabled?: boolean;
	tone?: CarteRibbonTone;
}

export interface CarteDemoControlOption {
	value: string;
	label: string;
	href?: string;
	disabled?: boolean;
}

export interface CarteDemoControlGroup {
	id: string;
	label: string;
	value: string;
	options: readonly CarteDemoControlOption[];
	onselect?: (value: string) => void;
}
