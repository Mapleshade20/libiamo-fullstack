export type FinishLabels = {
	title: string;
	message: string;
	confirm: string;
	cancel: string;
	pending: string;
	error: string;
};

const labels: Record<string, FinishLabels> = {
	en: {
		title: "Finish Task",
		message: "Are you ready to finish this task and see your feedback? You won't be able to send more messages after confirming.",
		confirm: "Finish & Review",
		cancel: "Keep Practicing",
		pending: "Finishing…",
		error: "We couldn't finish this task. Please try again.",
	},
	es: {
		title: "Terminar la tarea",
		message: "¿Listo para terminar esta tarea y ver tus comentarios? No podrás enviar más mensajes después de confirmar.",
		confirm: "Terminar y revisar",
		cancel: "Seguir practicando",
		pending: "Terminando…",
		error: "No pudimos terminar esta tarea. Inténtalo de nuevo.",
	},
	fr: {
		title: "Terminer la tâche",
		message: "Prêt à terminer cette tâche et à voir vos commentaires ? Vous ne pourrez plus envoyer de messages après confirmation.",
		confirm: "Terminer et revoir",
		cancel: "Continuer à pratiquer",
		pending: "Finalisation…",
		error: "Impossible de terminer cette tâche. Réessayez.",
	},
	ja: {
		title: "タスクを終了",
		message: "このタスクを終了してフィードバックを確認しますか？確認後はメッセージを送れません。",
		confirm: "終了して確認",
		cancel: "練習を続ける",
		pending: "終了中…",
		error: "タスクを終了できませんでした。もう一度お試しください。",
	},
};

export function getFinishLabels(language: string): FinishLabels {
	return labels[language] ?? labels.en;
}
