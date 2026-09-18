export type HintLabels = {
	panel: string;
	failure: string;
	submit: string;
	back: string;
	clear: string;
	expressionInput: string;
	expressionPlaceholder: string;
	contentIdea: string;
};

const hintI18n: Record<string, HintLabels> = {
	en: {
		failure: "Unable to generate a hint. Please try again.",
		panel: "Hint panel",
		submit: "Submit",
		back: "Back",
		clear: "Clear",
		expressionInput: "Meaning to express",
		expressionPlaceholder: "How do I say this...",
		contentIdea: "Content idea",
	},
	es: {
		failure: "No se pudo generar una pista. Inténtalo de nuevo.",
		panel: "Panel de ayuda",
		submit: "Enviar",
		back: "Volver",
		clear: "Borrar",
		expressionInput: "Significado que quieres expresar",
		expressionPlaceholder: "¿Cómo se dice esto...?",
		contentIdea: "Idea de contenido",
	},
	fr: {
		failure: "Impossible de générer un indice. Réessayez.",
		panel: "Panneau d'aide",
		submit: "Envoyer",
		back: "Retour",
		clear: "Effacer",
		expressionInput: "Sens à exprimer",
		expressionPlaceholder: "Comment dire ceci...",
		contentIdea: "Idée de contenu",
	},
	ja: {
		failure: "ヒントを生成できませんでした。もう一度お試しください。",
		panel: "ヒントパネル",
		submit: "送信",
		back: "戻る",
		clear: "クリア",
		expressionInput: "表現したい意味",
		expressionPlaceholder: "これはどう言う...",
		contentIdea: "内容のヒント",
	},
};

export function getHintLabels(language: string): HintLabels {
	return hintI18n[language] ?? hintI18n.en;
}
