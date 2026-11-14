import { json } from "@sveltejs/kit";
import { CAPTURE_SCRIPTS } from "$model/context/scripts.ts";

export const GET = () => json(CAPTURE_SCRIPTS);
