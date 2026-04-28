export interface ChangelogEntry {
  pr: number;
  title: string;
  mergedAt: string;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  { pr: 78, title: "fix(orchestrator): edit-intent verbs override read-only heuristic", mergedAt: "2026-04-28" },
  { pr: 80, title: "feat(webapp): OG + Twitter card meta for link unfurls", mergedAt: "2026-04-28" },
  { pr: 81, title: "feat(webapp): robots.txt + sitemap.xml for crawlers", mergedAt: "2026-04-28" },
  { pr: 82, title: "feat(webapp): SoftwareApplication JSON-LD for SEO", mergedAt: "2026-04-28" },
  { pr: 83, title: "feat(webapp): Install section with copy-paste setup", mergedAt: "2026-04-28" },
  { pr: 84, title: "docs: record SEO+install batch deploy + clear queue", mergedAt: "2026-04-28" },
] as const;
