import { flushSync, mount, unmount } from "svelte";
import type { PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import type { PersistedPracticeMessage, PersistedPracticeSession } from "$lib/practice/messages";

/** Surface props as a rune proxy, so a test can play the role of a load re-run. */
export function surfaceProps(overrides: Partial<PracticeSurfaceProps> = {}): PracticeSurfaceProps {
	const props = $state<PracticeSurfaceProps>({
		taskId: "5",
		userName: "Learner",
		avatarUrl: "",
		language: "en",
		session: null,
		openingState: {},
		maxTurns: 0,
		returnHref: "/libiamo/task/5",
		feedbackHref: "/libiamo/task/5/feedback",
		...overrides,
	});
	return props;
}

export function persistedSession(messages: PersistedPracticeMessage[], overrides: Partial<PersistedPracticeSession> = {}): PersistedPracticeSession {
	return { id: 11, status: "in_progress", agentReadUpToMessageId: null, nextAgentWorkDueAt: null, messages, ...overrides };
}

export function persisted(id: number, role: "user" | "assistant", content: string, llmMetadata?: unknown): PersistedPracticeMessage {
	return { id, role, content, createdAt: new Date(Date.UTC(2026, 8, 25, 9, id)), llmMetadata };
}

export function mountSurface(component: any, props: PracticeSurfaceProps) {
	const target = document.createElement("div");
	document.body.append(target);
	const instance = mount(component, { target, props });
	flushSync();
	return {
		target,
		destroy() {
			unmount(instance);
			target.remove();
		},
	};
}
