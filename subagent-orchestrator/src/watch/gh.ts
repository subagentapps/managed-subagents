// watch/gh.ts — poll a GitHub PR for status via the gh CLI.
// M4 piece. Uses execFile of `gh` shell-out (not @octokit/rest) for
// auth simplicity — gh inherits the user's existing GitHub creds.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PrStatus {
  number: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: "CLEAN" | "DIRTY" | "BLOCKED" | "BEHIND" | "UNKNOWN" | "UNSTABLE" | "HAS_HOOKS";
  /** Aggregate of all check-run statuses */
  checks: Array<{ name: string; status: string; conclusion: string }>;
  reviewCount: number;
  commentCount: number;
}

export class GhCliError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = "GhCliError";
  }
}

export interface FetchPrStatusOptions {
  /** Override the gh executable path (e.g. for tests) */
  ghPath?: string;
  /** repo "owner/name"; if omitted, gh uses the cwd's repo */
  repo?: string;
  /** Inject for testing */
  execFileOverride?: typeof execFileAsync;
}

/**
 * Fetch the current state of a PR via `gh pr view`.
 */
export async function fetchPrStatus(
  prNumber: number,
  options: FetchPrStatusOptions = {},
): Promise<PrStatus> {
  const exec = options.execFileOverride ?? execFileAsync;
  const ghPath = options.ghPath ?? "gh";

  const args = [
    "pr",
    "view",
    String(prNumber),
    "--json",
    "number,state,isDraft,mergeable,mergeStateStatus,statusCheckRollup,reviews,comments",
  ];
  if (options.repo) {
    args.push("--repo", options.repo);
  }

  let stdout: string;
  try {
    const out = await exec(ghPath, args);
    stdout = out.stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new GhCliError(
      `gh pr view ${prNumber} failed: ${e.message ?? "unknown"}`,
      e.stderr,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new GhCliError(`gh returned non-JSON: ${(err as Error).message}`);
  }

  return {
    number: parsed["number"] as number,
    state: parsed["state"] as PrStatus["state"],
    isDraft: parsed["isDraft"] as boolean,
    mergeable: parsed["mergeable"] as PrStatus["mergeable"],
    mergeStateStatus: parsed["mergeStateStatus"] as PrStatus["mergeStateStatus"],
    checks: ((parsed["statusCheckRollup"] as Array<Record<string, unknown>>) ?? []).map(
      (c) => ({
        name: (c["name"] as string) ?? "(unnamed)",
        status: (c["status"] as string) ?? "",
        conclusion: (c["conclusion"] as string) ?? "",
      }),
    ),
    reviewCount: ((parsed["reviews"] as unknown[]) ?? []).length,
    commentCount: ((parsed["comments"] as unknown[]) ?? []).length,
  };
}

/**
 * Predicate helpers — what an orchestrator typically wants to know.
 */
export function isReadyForMerge(status: PrStatus): boolean {
  return (
    status.state === "OPEN" &&
    !status.isDraft &&
    status.mergeable === "MERGEABLE" &&
    status.mergeStateStatus === "CLEAN" &&
    status.checks.every((c) => c.status === "COMPLETED" && c.conclusion === "SUCCESS")
  );
}

export function hasFailingChecks(status: PrStatus): boolean {
  return status.checks.some(
    (c) => c.status === "COMPLETED" && c.conclusion === "FAILURE",
  );
}
