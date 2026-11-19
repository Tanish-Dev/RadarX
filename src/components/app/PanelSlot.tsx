import { getJobFor } from "@/lib/jobsForViewer";
import { getViewer } from "@/lib/viewer";
import { JobPanel } from "./JobPanel";

/** Server: load the posting named by ?job= and render the slide-over. */
export async function PanelSlot({ id }: { id: string }) {
  if (!id || !/^[\w.:\-]{1,200}$/.test(id)) return null;
  const [job, viewer] = await Promise.all([getJobFor(id), getViewer()]);
  if (!job) return null;
  return <JobPanel job={job} hasResume={!!viewer.profile} />;
}
