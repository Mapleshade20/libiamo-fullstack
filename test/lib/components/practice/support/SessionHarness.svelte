<script lang="ts">
import { createPracticeSession, type PracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";

let { props, onSession }: { props: PracticeSurfaceProps; onSession: (session: PracticeSession) => void } = $props();

// svelte-ignore state_referenced_locally
onSession(createPracticeSession(() => props, { fallbackAgentName: () => "Maya" }));
</script>
