import { redirect } from "next/navigation";

/** World signals now live on Home (below the jobs); old links land there. */
export default function WorldPage() {
  redirect("/#world");
}
