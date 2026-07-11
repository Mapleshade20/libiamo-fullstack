export type HintLabels = {
	panel: string;
	submit: string;
	back: string;
	clear: string;
	expressionPlaceholder: string;
	contentIdea: string;
};

const hintI18n: Record<string, HintLabels> = {
	en: {
		panel: "Hint panel",
		submit: "Submit",
		back: "Back",
		clear: "Clear",
		expressionPlaceholder: "How do I say this...",
		contentIdea: "Content idea",
	},
	es: {
		panel: "Panel de ayuda",
		submit: "Enviar",
		back: "Volver",
		clear: "Borrar",
		expressionPlaceholder: "¿Cómo se dice esto...?",
		contentIdea: "Idea de contenido",
	},
	fr: {
		panel: "Panneau d'aide",
		submit: "Envoyer",
		back: "Retour",
		clear: "Effacer",
		expressionPlaceholder: "Comment dire ceci...",
		contentIdea: "Idée de contenu",
	},
	ja: {
		panel: "ヒントパネル",
		submit: "送信",
		back: "戻る",
		clear: "クリア",
		expressionPlaceholder: "これはどう言う...",
		contentIdea: "内容のヒント",
	},
};

export function getHintLabels(language: string): HintLabels {
	return hintI18n[language] ?? hintI18n.en;
}
