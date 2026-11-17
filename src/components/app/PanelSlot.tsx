import { getJob } from "@/lib/queries";
import { getProfile } from "@/lib/settings";
import { JobPanel } from "./JobPanel";

/** Server: load the posting named by ?job= and render the slide-over. */
export async function PanelSlot({ id }: { id: string }) {
  if (!id) return null;
  const [job, profile] = await Promise.all([getJob(id), getProfile()]);
  if (!job) return null;
  return <JobPanel job={job} hasResume={profile.skills.length > 0} />;
}
