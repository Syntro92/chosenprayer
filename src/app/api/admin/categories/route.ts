import { adminRoute } from "@/server/admin-route";
import { json } from "@/server/http";
import { listCategories } from "@/server/services/channels";

/** Channel categories for the create/edit forms. */
export const GET = adminRoute(async () => json(await listCategories()));
