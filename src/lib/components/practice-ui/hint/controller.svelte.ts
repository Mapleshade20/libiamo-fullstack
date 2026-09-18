import { type HintRequest, requestHint } from "./api";
import { getHintLabels } from "./i18n";
import type { createHintOwnership } from "./ownership";

export type HintMode = "content" | "expression";
export type HintRequestState = "idle" | "loading" | "success" | "failure";

export function createHintController(options: {
	getContext: () => { sessionId: number | null; language: string; draft: string; disabled?: boolean; contextPath?: HintRequest["contextPath"] };
	ownership?: ReturnType<typeof createHintOwnership>;
}) {
	let isOpen = $state(false);
	let state = $state<HintRequestState>("idle");
	let mode = $state<HintMode>("expression");
	let contentHint = $state("");
	let expressionQuery = $state("");
	let submittedQuery = $state("");
	let phrases = $state<string[]>([]);
	let error = $state<string | null>(null);
	let motionOrigin = $state<HTMLElement | null>(null);
	let version = 0;
	let active: AbortController | undefined;
	let ownerToken: symbol | undefined;
	let destroyed = false;

	function reset() {
		version++;
		active?.abort();
		active = undefined;
		state = "idle";
		mode = "expression";
		contentHint = "";
		expressionQuery = "";
		submittedQuery = "";
		phrases = [];
		error = null;
	}

	function dismiss(restoreFocus = true) {
		reset();
		isOpen = false;
		if (ownerToken) options.ownership?.release(ownerToken);
		ownerToken = undefined;
		if (restoreFocus && motionOrigin?.isConnected) motionOrigin.focus({ preventScroll: true });
		motionOrigin = null;
	}

	function open(origin: HTMLElement) {
		const context = options.getContext();
		if (destroyed || context.sessionId === null || context.disabled) return;
		dismiss(false);
		ownerToken = options.ownership?.claim(() => dismiss(false));
		motionOrigin = origin;
		isOpen = true;
	}

	async function request(requestMode: HintMode) {
		const context = options.getContext();
		const query = expressionQuery.trim();
		if (destroyed || !isOpen || context.sessionId === null || context.disabled || (requestMode === "expression" && !query)) return;
		active?.abort();
		const controller = new AbortController();
		active = controller;
		const token = ++version;
		mode = requestMode;
		submittedQuery = requestMode === "expression" ? query : "";
		contentHint = "";
		phrases = [];
		error = null;
		state = "loading";
		const ownsRequest = () => !destroyed && isOpen && version === token && options.getContext().sessionId === context.sessionId;
		try {
			const result = await requestHint({ ...context, sessionId: context.sessionId, mode: requestMode, expression: query, signal: controller.signal });
			if (!ownsRequest()) return;
			contentHint = result.contentHint ?? "";
			phrases = result.phrases ?? [];
			state = "success";
		} catch {
			if (!ownsRequest() || controller.signal.aborted) return;
			error = getHintLabels(context.language).failure;
			state = "failure";
		} finally {
			if (version === token) {
				active = undefined;
				if (state === "loading") state = "idle";
			}
		}
	}

	return {
		get isOpen() {
			return isOpen;
		},
		get state() {
			return state;
		},
		get isLoading() {
			return state === "loading";
		},
		get mode() {
			return mode;
		},
		set mode(value: HintMode) {
			mode = value;
		},
		get contentHint() {
			return contentHint;
		},
		get expressionQuery() {
			return expressionQuery;
		},
		set expressionQuery(value: string) {
			expressionQuery = value;
		},
		get submittedQuery() {
			return submittedQuery;
		},
		set submittedQuery(value: string) {
			submittedQuery = value;
		},
		get phrases() {
			return phrases;
		},
		get error() {
			return error;
		},
		get motionOrigin() {
			return motionOrigin;
		},
		open,
		requestContent: () => request("content"),
		requestExpression: () => request("expression"),
		dismiss,
		reset,
		destroy() {
			destroyed = true;
			dismiss(false);
		},
	};
}
