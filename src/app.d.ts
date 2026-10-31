import type { QuestMenuRouteData } from "$lib/quest-hall/preparation";
import type { auth } from "$lib/server/auth/auth";

declare global {
	namespace App {
		interface PageData {
			questMenu?: QuestMenuRouteData;
			viewer?: { name: string } | null;
		}
		interface Locals {
			user?: typeof auth.$Infer.Session.user;
			session?: typeof auth.$Infer.Session.session;
		}
	}
}
