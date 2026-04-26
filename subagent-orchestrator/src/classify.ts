// Disposition classifier (M2).
//
// Given a Task with disposition "auto", pick one of the 5 concrete
// dispositions: local | ultraplan | autofix | web | claude-mention.
//
// Heuristics start naive (regex/keyword on title+prompt) per
// PROJECT_PLAN.md §4. Refined later with telemetry from store/db.ts (M7).
//
// If a Task already has a non-auto disposition, classify() returns it
// unchanged — explicit overrides win.

import type { Disposition, Task } from "./types.js";

/**
 * Result of one classification call.
 *
 * `confidence` is heuristic-only for now; ranges 0..1 with no calibration.
 * `signals` is for telemetry / debugging — which keywords matched.
 */
export interface ClassifyResult {
  disposition: Exclude<Disposition, "auto">;
  confidence: number;
  signals: string[];
  reason: string;
}

/**
 * Patterns that map to each non-auto disposition.
 *
 * Order matters: the first matching rule wins. Higher-confidence /
 * more-specific patterns come first.
 */
const RULES: Array<{
  disposition: Exclude<Disposition, "auto">;
  pattern: RegExp;
  signal: string;
  confidence: number;
}> = [
  // autofix: explicit CI / PR-fix language
  {
    disposition: "autofix",
    pattern: /\b(fix\s+(?:the\s+)?ci|fix\s+(?:the\s+)?(?:pr|pull\s+request)|address\s+(?:review\s+)?comments|get\s+(?:this|the)\s+pr\s+green|make\s+ci\s+pass)\b/i,
    signal: "ci-or-pr-fix-language",
    confidence: 0.85,
  },

  // ultraplan: design / architectural / multi-step planning
  {
    disposition: "ultraplan",
    pattern: /\b(design\s+(?:a\s+)?(?:system|architecture|migration)|architect(?:ural)?\s+(?:decision|plan)|ultraplan|adr|migration\s+plan|technical\s+spec|prd)\b/i,
    signal: "design-or-architecture-language",
    confidence: 0.8,
  },

  // local: read-only / investigation / testing — keep on machine
  {
    disposition: "local",
    pattern: /\b(read-only|investigate|explore|search|grep|find|inspect|describe|summarize|run\s+tests?|run\s+lint|run\s+format|typecheck)\b/i,
    signal: "read-only-or-test-language",
    confidence: 0.75,
  },

  // claude-mention: PR-comment-driven workflow
  {
    disposition: "claude-mention",
    pattern: /\b(comment\s+on\s+(?:the\s+)?pr|@claude|trigger\s+the\s+action|push\s+(?:a\s+)?fix\s+to\s+(?:branch|pr))\b/i,
    signal: "pr-comment-or-mention-language",
    confidence: 0.8,
  },

  // web: explicit "in the cloud" / "remote" / heavyweight feature work
  {
    disposition: "web",
    pattern: /\b(in\s+the\s+cloud|run\s+(?:this\s+)?remotely|claude(?:-code)?\s+on\s+the\s+web|new\s+feature|implement\s+(?:from\s+)?spec)\b/i,
    signal: "cloud-or-feature-language",
    confidence: 0.7,
  },
];

/**
 * Classify a task. Returns the explicit disposition if not "auto";
 * otherwise picks via the heuristics above with a "claude-mention" fallback.
 */
export function classify(task: Task): ClassifyResult {
  // Explicit override always wins.
  if (task.disposition !== "auto") {
    return {
      disposition: task.disposition,
      confidence: 1.0,
      signals: ["explicit-override"],
      reason: `Task ${task.id} explicitly set disposition='${task.disposition}'`,
    };
  }

  const haystack = `${task.title}\n${task.prompt}`;
  const matches: Array<{ rule: (typeof RULES)[number]; }> = [];

  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) {
      matches.push({ rule });
    }
  }

  if (matches.length === 0) {
    // No heuristic matched — default to claude-mention (the safest "do
    // it remotely with full action permissions" path).
    return {
      disposition: "claude-mention",
      confidence: 0.3,
      signals: ["no-match-fallback"],
      reason: `No heuristic matched for task ${task.id}; falling back to claude-mention`,
    };
  }

  const winner = matches[0];
  if (!winner) {
    // Unreachable given matches.length check above, but TS narrows here.
    throw new Error("classify(): impossible empty winner");
  }

  return {
    disposition: winner.rule.disposition,
    confidence: winner.rule.confidence,
    signals: matches.map((m) => m.rule.signal),
    reason:
      matches.length === 1
        ? `Matched '${winner.rule.signal}'`
        : `Matched ${matches.length} rules; picked first: '${winner.rule.signal}'`,
  };
}
