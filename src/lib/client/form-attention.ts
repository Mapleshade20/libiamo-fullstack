export type FieldErrors = Record<string, string[] | undefined>;

function getScrollableParent(element: HTMLElement): HTMLElement | null {
	let current = element.parentElement;
	while (current) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		const canScroll = (overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight;
		if (canScroll) return current;
		current = current.parentElement;
	}
	return null;
}

export function centerElement(element: HTMLElement) {
	if (!element.isConnected) return;
	const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
	const scrollParent = getScrollableParent(element);
	const elementRect = element.getBoundingClientRect();

	if (!scrollParent) {
		const targetTop = window.scrollY + elementRect.top - window.innerHeight / 2 + elementRect.height / 2;
		window.scrollTo({
			top: Math.max(0, targetTop),
			behavior,
		});
		return;
	}

	const parentRect = scrollParent.getBoundingClientRect();
	const offsetTop = elementRect.top - parentRect.top;
	const targetTop = scrollParent.scrollTop + offsetTop - scrollParent.clientHeight / 2 + elementRect.height / 2;
	scrollParent.scrollTo({
		top: Math.max(0, targetTop),
		behavior,
	});
}

const animations = new WeakMap<HTMLElement, Animation>();
const generatedMessages = new Map<HTMLElement, HTMLElement>();
const invalidEvents = new WeakSet<Event>();
const pendingForms = new WeakSet<HTMLElement>();

function errorMessages(element: HTMLElement) {
	const scope = element.closest("[data-field-container]") ?? element.closest("form") ?? element.parentElement;
	const name = element.dataset.feedbackName || element.getAttribute("name") || element.id;
	const messages = [...(scope?.querySelectorAll<HTMLElement>("[data-field-error]") ?? [])].filter((message) => message.dataset.fieldError === name);
	const generated = generatedMessages.get(element);
	// A group-level error may be immediately after the form itself, outside its query scope.
	if (generated && !messages.includes(generated)) messages.push(generated);
	return messages;
}

function visualTarget(element: HTMLElement) {
	return element.matches('input[type="radio"], input[type="checkbox"]') ? (element.closest("label") ?? element) : element;
}

export function clearFieldFeedback(element: HTMLElement) {
	const visual = visualTarget(element);
	animations.get(visual)?.cancel();
	animations.delete(visual);
	visual.removeAttribute("data-field-attention");
	element.removeAttribute("data-field-attention");
	element.setAttribute("aria-invalid", "false");
	for (const message of errorMessages(element)) {
		message.dataset.dismissed = "true";
		message.setAttribute("aria-hidden", "true");
	}
}

export function markFieldAttention(element: HTMLElement, message?: string) {
	const visual = visualTarget(element);
	animations.get(visual)?.cancel();
	visual.setAttribute("data-field-attention", "true");
	element.setAttribute("data-field-attention", "true");
	element.setAttribute("aria-invalid", "true");
	if (message) {
		let error = generatedMessages.get(element);
		if (!error) {
			error = document.createElement("span");
			error.dataset.nativeFieldError = "";
			error.dataset.fieldError = element.dataset.feedbackName || element.getAttribute("name") || element.id || (element.id = `field-${++errorId}`);
			error.id = `field-error-${++errorId}`;
			error.className = "field-error-message";
			error.setAttribute("role", "alert");
			const container = element.closest("[data-field-container]");
			if (container) container.append(error);
			else element.insertAdjacentElement("afterend", error);
			generatedMessages.set(element, error);
			element.setAttribute("aria-describedby", [element.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
		}
		error.textContent = message;
	}
	for (const error of errorMessages(element)) {
		const isGenerated = error === generatedMessages.get(element);
		if (isGenerated !== Boolean(message)) {
			error.dataset.dismissed = "true";
			error.setAttribute("aria-hidden", "true");
			continue;
		}
		delete error.dataset.dismissed;
		error.removeAttribute("aria-hidden");
		if (!error.id) error.id = `field-error-${++errorId}`;
		const descriptions = new Set((element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean));
		descriptions.add(error.id);
		element.setAttribute("aria-describedby", [...descriptions].join(" "));
	}
	if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && visual.animate) {
		const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
		const animation = visual.animate(
			[
				{ transform: "translateX(0)", offset: 0, easing },
				{ transform: "translateX(6px)", offset: 80 / 280, easing },
				{ transform: "translateX(-6px)", offset: 160 / 280, easing },
				{ transform: "translateX(4px)", offset: 220 / 280, easing },
				{ transform: "translateX(0)", offset: 1 },
			],
			{ duration: 280 },
		);
		animations.set(visual, animation);
		void animation.finished.then(
			() => {
				if (animations.get(visual) === animation) animations.delete(visual);
			},
			() => {},
		);
	}
}

let errorId = 0;

/** Installed once by the root layout: includes native controls in all route groups,
 * portals and custom forms, without requiring each form to remember an invalid handler. */
export function installFormFeedback(root: Document) {
	const edited = (event: Event) => {
		if (!(event.target instanceof HTMLElement)) return;
		const field = event.target;
		if (field.matches("input, textarea, select, [contenteditable]")) clearFieldFeedback(field);
		const name = field.getAttribute("name");
		if (field.matches('input[type="radio"]') && name) {
			for (const radio of field.closest("form")?.querySelectorAll<HTMLElement>(`input[type="radio"][name="${CSS.escape(name)}"]`) ?? []) {
				clearFieldFeedback(radio);
			}
		}
		const group = field.closest<HTMLElement>("[data-validation-group]");
		if (group) clearFieldFeedback(group);
	};
	root.addEventListener("invalid", handleInvalidField, true);
	root.addEventListener("input", edited, true);
	root.addEventListener("change", edited, true);
	const observer = new MutationObserver(() => {
		for (const [field, message] of generatedMessages) {
			if (!field.isConnected) {
				message.remove();
				generatedMessages.delete(field);
			}
		}
	});
	observer.observe(root, { childList: true, subtree: true });
	return () => {
		observer.disconnect();
		for (const [field, message] of generatedMessages) {
			animations.get(visualTarget(field))?.cancel();
			message.remove();
		}
		generatedMessages.clear();
		root.removeEventListener("invalid", handleInvalidField, true);
		root.removeEventListener("input", edited, true);
		root.removeEventListener("change", edited, true);
	};
}

export type ValidationIssue = { path: PropertyKey[]; message: string };

export function textValidationMessage(value: string, maxLength: number): string | null {
	if (!value.trim()) return "Please enter a value.";
	if (value.length > maxLength) return `Use no more than ${maxLength} characters.`;
	return null;
}

/** Adapts existing schema issues to editable controls, including nested array paths. */
export function showValidationIssues(root: HTMLElement, issues: readonly ValidationIssue[]): boolean {
	let first: HTMLElement | undefined;
	for (const issue of issues) {
		const path = issue.path.join(".");
		const selector = `[data-feedback-name="${CSS.escape(path)}"], [name="${CSS.escape(path)}"]`;
		const target = root.querySelector<HTMLElement>(selector) ?? root;
		markFieldAttention(target, issue.message);
		first ??= target;
	}
	if (first) {
		first.focus({ preventScroll: true });
		centerElement(first);
	}
	return !!first;
}

/** For serialized editors: validate before enhance/confirmation can submit hidden JSON. */
export function validateBeforeSubmit(node: HTMLElement, validate: () => readonly ValidationIssue[]) {
	const form = node.closest("form");
	let check = validate;
	const submit = (event: Event) => {
		if (showValidationIssues(node, check())) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};
	form?.addEventListener("submit", submit, true);
	return {
		update(next: typeof validate) {
			check = next;
		},
		destroy() {
			form?.removeEventListener("submit", submit, true);
		},
	};
}

export function focusAndHighlightField(element: HTMLElement, message?: string) {
	requestAnimationFrame(() => {
		centerElement(element);
		requestAnimationFrame(() => centerElement(element));
	});

	if (typeof element.focus === "function") {
		element.focus({ preventScroll: true });
	}
	markFieldAttention(element, message);
}

function findField(form: HTMLFormElement, fieldName: string): HTMLElement | null {
	const named = form.elements.namedItem(fieldName);
	if (named instanceof RadioNodeList) {
		for (const item of Array.from(named)) {
			if (item instanceof HTMLElement) return item;
		}
		return null;
	}
	if (named instanceof HTMLElement) return named;

	const byId = form.querySelector<HTMLElement>(`#${CSS.escape(fieldName)}`);
	if (byId) return byId;

	return null;
}

export function getFirstErrorField(errors?: FieldErrors | null, fieldOrder: string[] = []): string | null {
	if (!errors) return null;
	const errorNames = Object.keys(errors).filter((name) => (errors[name]?.length ?? 0) > 0);
	if (errorNames.length === 0) return null;

	for (const name of fieldOrder) {
		if (errorNames.includes(name)) return name;
	}
	return errorNames[0];
}

export function focusFirstFormError(form: HTMLFormElement | null, errors?: FieldErrors | null, fieldOrder: string[] = []): boolean {
	if (!form) return false;
	const firstFieldName = getFirstErrorField(errors, fieldOrder);
	if (!firstFieldName) return false;

	const field = findField(form, firstFieldName);
	if (!field) return false;

	for (const [name, messages] of Object.entries(errors ?? {})) {
		const target = findField(form, name);
		if (target && messages?.length)
			markFieldAttention(target, errorMessages(target).some((error) => error !== generatedMessages.get(target)) ? undefined : messages[0]);
	}
	field.focus({ preventScroll: true });
	centerElement(field);
	return true;
}

export function handleInvalidField(event: Event) {
	if (invalidEvents.has(event)) return;
	invalidEvents.add(event);
	const field = event.target as HTMLElement | null;
	if (!field) return;
	// `invalid` fires on every failing control before the browser reports any of
	// them, so a hidden one further down the form would otherwise win the scroll and
	// strand the user somewhere blank. Skipping them leaves the first *visible*
	// control — which is what the browser attaches its own message to.
	if (typeof field.checkVisibility === "function" && !field.checkVisibility({ visibilityProperty: true })) return;
	event.preventDefault();
	const control = field as HTMLInputElement;
	markFieldAttention(field, control.validationMessage);
	const owner = control.form ?? field;
	if (pendingForms.has(owner)) return;
	pendingForms.add(owner);
	field.focus({ preventScroll: true });
	centerElement(field);
	// A user-initiated submit checkpoints microtasks between the controls' `invalid`
	// events, so the guard has to outlive the whole dispatch: clear it in a later task.
	setTimeout(() => pendingForms.delete(owner));
}
