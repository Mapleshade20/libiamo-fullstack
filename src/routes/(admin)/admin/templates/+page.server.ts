import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { template } from '$lib/server/db/schema';
import { eq, and, SQL } from 'drizzle-orm';

export const load: PageServerLoad = async (event) => {
	const language = event.url.searchParams.get('language') as 'en' | 'es' | 'fr' | 'ja' | null;
	const type = event.url.searchParams.get('type');
	const active = event.url.searchParams.get('active');

	const conditions: SQL[] = [];
	if (language) conditions.push(eq(template.language, language));
	if (type) conditions.push(eq(template.type, type as 'chat' | 'oneshot' | 'slow' | 'translate'));
	if (active === 'true') conditions.push(eq(template.isActive, true));
	if (active === 'false') conditions.push(eq(template.isActive, false));

	const templates = await db
		.select()
		.from(template)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(template.id);

	return {
		templates,
		filters: { language, type, active }
	};
};

export const actions: Actions = {
	toggleActive: async (event) => {
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const currentActive = formData.get('isActive') === 'true';

		if (Number.isNaN(id)) return fail(400, { message: 'Invalid template id' });

		await db
			.update(template)
			.set({ isActive: !currentActive })
			.where(eq(template.id, id));

		return { toggled: true };
	}
};
