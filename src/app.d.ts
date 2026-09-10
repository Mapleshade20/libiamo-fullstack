import type { auth } from "$lib/server/auth/auth";
import type { QuestMenuRouteData } from "$lib/quest-hall/preparation";

declare global {
	namespace App {
		interface PageData {
			questMenu?: QuestMenuRouteData;
		}
		interface Locals {
			user?: typeof auth.$Infer.Session.user;
			session?: typeof auth.$Infer.Session.session;
		}
	}
}
