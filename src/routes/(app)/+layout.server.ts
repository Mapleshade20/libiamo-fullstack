import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import crypto from 'node:crypto';

export const load: LayoutServerLoad = async (event) => {
	const user = event.locals.user;

	if (!user) {
		return redirect(302, '/sign-in');
	}

	const email = user.email?.toLowerCase() || '';
	const hash = crypto.createHash('md5').update(email).digest('hex');
	const avatarUrl = `https://cn.cravatar.com/avatar/${hash}?d=identicon&s=192`;

	return {
		user,
		avatarUrl
	};
};
