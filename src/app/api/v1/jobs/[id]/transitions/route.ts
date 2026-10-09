import { json, readJson, route } from "@/server/http/route";
import { transitionJob } from "@/server/services/job-service";

/** Body: { "to": "in_progress", "expectedVersion": 1, "reason"?: "..." } */
export const POST = route<{ id: string }>(async (request, { user, params }) => {
  const result = await transitionJob(user, params.id, await readJson(request));
  return json({ job: result.job, changed: result.changed });
});
