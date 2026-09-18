import { describe, expect, it } from "vitest";
import { getFinishLabels } from "$lib/components/practice-ui/finish/i18n";

describe("finish labels", () => {
	it("returns localized labels and falls back to English", () => {
		expect(getFinishLabels("es").confirm).toBe("Terminar y revisar");
		expect(getFinishLabels("ja").cancel).toBe("練習を続ける");
		expect(getFinishLabels("unknown").title).toBe("Finish Task");
	});
});
