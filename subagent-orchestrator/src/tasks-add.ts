// tasks-add.ts — render a Task as a TOML stanza and append to tasks.toml.
//
// Lower-friction than hand-editing TOML. Validates inputs (id format,
// disposition enum, repo when required) before touching disk; refuses
// to add a duplicate id.

import type { Disposition } from "./types.js";
import { DISPOSITIONS } from "./types.js";

export interface NewTaskInput {
  id: string;
  title: string;
  prompt: string;
  disposition?: Disposition;
  repo?: string;
  branch?: string;
  label?: string;
  automerge?: boolean;
  deepReview?: boolean;
  dependsOn?: string[];
}

export class AddTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddTaskError";
  }
}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Validate inputs against the same rules normalizeTask enforces.
 * Throws AddTaskError on the first failure (no error aggregation here —
 * call validateTasks for cross-task issues after appending).
 */
export function validateNewTask(input: NewTaskInput): void {
  if (!input.id || !ID_RE.test(input.id)) {
    throw new AddTaskError(`id '${input.id}' must be lowercase kebab-case`);
  }
  if (!input.title?.trim()) {
    throw new AddTaskError(`title is required`);
  }
  if (!input.prompt?.trim()) {
    throw new AddTaskError(`prompt is required`);
  }
  const disp = input.disposition ?? "auto";
  if (!DISPOSITIONS.includes(disp)) {
    throw new AddTaskError(`disposition '${disp}' invalid; must be one of ${DISPOSITIONS.join(",")}`);
  }
  if (disp !== "local" && disp !== "auto" && !input.repo) {
    throw new AddTaskError(`disposition '${disp}' requires --repo (e.g. owner/name)`);
  }
}

/**
 * Render a Task input as a TOML [[task]] stanza. Uses double-quoted
 * basic strings; escapes embedded quotes and backslashes; switches to
 * triple-quoted literal strings when the prompt contains a newline.
 *
 * No leading newline — caller stitches with whatever separator they want
 * (typically '\n\n' before appending to an existing file).
 */
export function renderTaskToml(input: NewTaskInput): string {
  const lines: string[] = ["[[task]]"];
  lines.push(`id = ${q(input.id)}`);
  lines.push(`title = ${q(input.title)}`);
  lines.push(`prompt = ${qPrompt(input.prompt)}`);
  if (input.disposition && input.disposition !== "auto") {
    lines.push(`disposition = ${q(input.disposition)}`);
  }
  if (input.repo) lines.push(`repo = ${q(input.repo)}`);
  if (input.branch && input.branch !== "main") lines.push(`branch = ${q(input.branch)}`);
  if (input.label) lines.push(`label = ${q(input.label)}`);
  if (input.automerge) lines.push(`automerge = true`);
  if (input.deepReview) lines.push(`deep_review = true`);
  if (input.dependsOn && input.dependsOn.length > 0) {
    const arr = input.dependsOn.map((d) => q(d)).join(", ");
    lines.push(`depends_on = [${arr}]`);
  }
  return lines.join("\n") + "\n";
}

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function qPrompt(s: string): string {
  if (s.includes("\n")) {
    // Use triple double-quoted; inside, only escape """ runs and backslash
    return `"""\n${s.replace(/\\/g, "\\\\").replace(/"""/g, '"\\""')}\n"""`;
  }
  return q(s);
}

/**
 * Append a new task stanza to existing TOML content. Returns the new
 * file content. Pure — caller is responsible for the actual write.
 *
 * Throws AddTaskError if input.id already exists in the existing content.
 * Existence is detected by simple regex on `id = "<value>"` — this avoids
 * needing to round-trip through the TOML library and preserves comments
 * + whitespace in the original file.
 */
export function appendTaskToToml(existingContent: string, input: NewTaskInput): string {
  validateNewTask(input);

  const dupRe = new RegExp(`^\\s*id\\s*=\\s*"${escapeRe(input.id)}"\\s*$`, "m");
  if (dupRe.test(existingContent)) {
    throw new AddTaskError(`id '${input.id}' already exists in tasks.toml`);
  }

  const stanza = renderTaskToml(input);
  const sep = existingContent.length === 0 || existingContent.endsWith("\n\n")
    ? ""
    : existingContent.endsWith("\n") ? "\n" : "\n\n";
  return existingContent + sep + stanza;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
