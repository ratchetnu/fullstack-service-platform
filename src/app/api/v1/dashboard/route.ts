import { json, route } from "@/server/http/route";
import { getDashboard } from "@/server/services/dashboard-service";

export const GET = route(async (_request, { user }) => json(await getDashboard(user)));
