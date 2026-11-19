/** Job reads scoped to whoever is looking (owner vs visitor) — pages and actions use these. */
import "server-only";
import type { JobFilters } from "./filters";
import { getJob, getJobs } from "./queries";
import { getViewer } from "./viewer";

export async function getJobsFor(f: Partial<JobFilters>, opts: { limit?: number; offset?: number } = {}) {
  return getJobs(f, opts, await getViewer());
}

export async function getJobFor(id: string) {
  return getJob(id, await getViewer());
}
