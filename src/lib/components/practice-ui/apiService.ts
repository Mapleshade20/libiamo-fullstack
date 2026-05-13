import { deserialize } from "$app/forms";

export async function postAction(action: string, sessionId: number | string | null) {
	const formData = new FormData();
	if (sessionId != null && sessionId !== "") formData.append("sessionId", String(sessionId));
	const res = await fetch(`?/${action}`, {
		method: "POST",
		body: formData,
	});
	return deserialize(await res.text());
}
