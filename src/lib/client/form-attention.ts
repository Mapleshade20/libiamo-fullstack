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
	const scrollParent = getScrollableParent(element);
	const elementRect = element.getBoundingClientRect();

	if (!scrollParent) {
		const targetTop = window.scrollY + elementRect.top - window.innerHeight / 2 + elementRect.height / 2;
		window.scrollTo({
			top: Math.max(0, targetTop),
			behavior: "smooth",
		});
		return;
	}

	const parentRect = scrollParent.getBoundingClientRect();
	const offsetTop = elementRect.top - parentRect.top;
	const targetTop = scrollParent.scrollTop + offsetTop - scrollParent.clientHeight / 2 + elementRect.height / 2;
	scrollParent.scrollTo({
		top: Math.max(0, targetTop),
		behavior: "smooth",
	});
}

function markFieldAttention(element: HTMLElement) {
	element.setAttribute("data-field-attention", "true");
	window.setTimeout(() => {
		element.removeAttribute("data-field-attention");
	}, 2600);
}

export function focusAndHighlightField(element: HTMLElement) {
	requestAnimationFrame(() => {
		centerElement(element);
		requestAnimationFrame(() => centerElement(element));
	});

	if (typeof element.focus === "function") {
		element.focus({ preventScroll: true });
	}
	markFieldAttention(element);
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

	focusAndHighlightField(field);
	return true;
}

export function handleInvalidField(event: Event) {
	const field = event.target as HTMLElement | null;
	if (!field) return;
	focusAndHighlightField(field);
}
