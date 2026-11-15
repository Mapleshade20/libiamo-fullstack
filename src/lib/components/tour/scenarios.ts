import type { ScenarioView } from "#lib/scenario/types.ts";
import recorded from "./scenarios.json";

// The demo's AO3 and Reddit presentation states, not the live library or its date-sensitive ranking.
const scenarios = recorded as Record<string, ScenarioView[]>;
export const tourScenarios = (language: string) => scenarios[language] ?? scenarios.en;
export const tourScenario = (id: string, language: string) => tourScenarios(language).find((s) => s.id === id) ?? null;
