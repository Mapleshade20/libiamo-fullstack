import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '$lib/server/auth';
import { profileSchema, switchLanguageSchema } from '$lib/schemas';
import { db } from '$lib/server/db';
import { userLearningProfile } from '$lib/server/db/schema';
import crypto from 'node:crypto';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user!;

	// Cravatar 处理逻辑：
	// 1. 获取用户邮箱，去除首尾空格并转为小写 (假设 user 对象中有 email 字段)
	const email = user.email?.trim().toLowerCase() || '';
	// 2. 计算 MD5 哈希
	const hash = crypto.createHash('md5').update(email).digest('hex');
	// 3. 拼接 URL。d=identicon 表示如果没有设置头像，则生成基于哈希的随机几何图形；s=200 表示请求 200x200 像素
	const avatarUrl = `https://cravatar.cn/avatar/${hash}?d=identicon&s=200&v=1`;
	return {
		user,
		avatarUrl
	};
};

export const actions: Actions = {
	updateProfile: async (event) => {
		const formData = await event.request.formData();
		const raw = {
			nickname: formData.get('nickname')?.toString() ?? undefined,
			timezone: formData.get('timezone')?.toString() ?? undefined,
			nativeLanguage: formData.get('nativeLanguage')?.toString() ?? undefined
		};

		const result = profileSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { errors: result.error.flatten().fieldErrors, values: raw });
		}

		await auth.api.updateUser({
			body: result.data,
			headers: event.request.headers
		});

		return { success: true };
	},

	switchLanguage: async (event) => {
		const formData = await event.request.formData();
		const raw = { language: formData.get('language')?.toString() ?? '' };

		const result = switchLanguageSchema.safeParse(raw);
		if (!result.success) {
			return fail(400, { message: 'Invalid language' });
		}

		await auth.api.updateUser({
			body: { activeLanguage: result.data.language },
			headers: event.request.headers
		});

		await db
			.insert(userLearningProfile)
			.values({
				userId: event.locals.user!.id,
				language: result.data.language
			})
			.onConflictDoNothing();

		return redirect(302, '/');
	},

	signOut: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		return redirect(302, '/sign-in');
	}
};
