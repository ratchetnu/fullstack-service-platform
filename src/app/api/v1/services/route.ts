import { json, route } from "@/server/http/route";
import { listBookableServices } from "@/server/services/catalog-service";

export const GET = route(async () => json({ items: await listBookableServices() }));
