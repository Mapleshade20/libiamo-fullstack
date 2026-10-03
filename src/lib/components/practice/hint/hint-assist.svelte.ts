import { type HintContext, type HintMode, requestHint } from "./api";

export type HintAssist = ReturnType<typeof createHintAssist>;

/**
 * The hint panel of one practice surface. It is open for at most one editor (its owner) at a
 * time; opening another editor, closing, or releasing the owner invalidates the request in
 * flight, so a late response can never appear in the wrong place.
 */
export function createHintAssist(getSessionId: () => number | null) {
	let owner = $state<string | null>(null);
	let origin = $state<HTMLElement | null>(null);
	let expressionQuery = $state("");
	let contentHint = $state("");
	let phrases = $state<string[]>([]);
	/** `null` when there is no error; an empty string is a failure without a server message. */
	let error = $state<string | null>(null);
	let loading = $state(false);
	let token = 0;
	let getContext: () => HintContext = () => ({ draft: "" });

	function clearResult() {
		token += 1;
		loading = false;
		error = null;
		contentHint = "";
		phrases = [];
	}

	function open(nextOwner: string, trigger: HTMLElement, context: () => HintContext) {
		clearResult();
		expressionQuery = "";
		owner = nextOwner;
		origin = trigger;
		getContext = context;
	}

	function close() {
		clearResult();
		expressionQuery = "";
		owner = null;
		origin = null;
	}

	async function request(mode: HintMode) {
		const sessionId = getSessionId();
		if (!sessionId || owner === null || loading) return;
		if (mode === "expression" && !expressionQuery.trim()) return;
		clearResult();
		const current = token;
		loading = true;
		try {
			const result = await requestHint({ sessionId, mode, ...getContext(), expression: mode === "expression" ? expressionQuery : undefined });
			if (current !== token) return;
			contentHint = result.contentHint ?? "";
			phrases = result.phrases ?? [];
		} catch (cause) {
			if (current !== token) return;
			error = cause instanceof Error ? cause.message : "";
		} finally {
			if (current === token) loading = false;
		}
	}

	return {
		get owner() {
			return owner;
		},
		get origin() {
			return origin;
		},
		get expressionQuery() {
			return expressionQuery;
		},
		set expressionQuery(value: string) {
			expressionQuery = value;
		},
		get contentHint() {
			return contentHint;
		},
		get phrases() {
			return phrases;
		},
		get error() {
			return error;
		},
		get loading() {
			return loading;
		},
		isOpen: (candidate: string) => owner === candidate,
		toggle(candidate: string, trigger: HTMLElement, context: () => HintContext) {
			if (owner === candidate) close();
			else open(candidate, trigger, context);
		},
		close,
		/** Closes the panel if `candidate` owns it (an editor that unmounts or submits). */
		release(candidate: string) {
			if (owner === candidate) close();
		},
		requestContent: () => request("content"),
		requestExpression: () => request("expression"),
	};
}
