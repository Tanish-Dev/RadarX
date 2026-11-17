/** Re-mounts on every navigation → a short fade-in instead of a hard cut. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="rx-page">{children}</div>;
}
