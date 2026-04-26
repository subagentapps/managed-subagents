// tasks.toml parser.
// Loads ../tasks.toml (or a path passed in), normalizes raw entries to
// fully-defaulted Task records, validates required fields.
//
// M1 deliverable. See ../../PROJECT_PLAN.md §3.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import toml from "@iarna/toml";

import type { Disposition, RawTaskTomlEntry, RawTasksTomlFile, Task } from "../types.js";
import { DISPOSITIONS } from "../types.js";

export class TaskParseError extends Error {
  constructor(message: string, public readonly entry?: RawTaskTomlEntry) {
    super(message);
    this.name = "TaskParseError";
  }
}

/**
 * Read tasks.toml from disk and return parsed Task records.
 *
 * @param tasksTomlPath Defaults to ../../tasks.toml relative to this file.
 *   Pass an absolute path for tests or alternate sources.
 */
export function loadTasks(tasksTomlPath?: string): Task[] {
  const path = tasksTomlPath ?? resolve(import.meta.dirname, "../../tasks.toml");
  const contents = readFileSync(path, "utf8");
  return parseTasksToml(contents);
}

/**
 * Pure: parse TOML string → Task records. No I/O.
 * Exported for testing.
 */
export function parseTasksToml(contents: string): Task[] {
  let parsed: RawTasksTomlFile;
  try {
    parsed = toml.parse(contents) as RawTasksTomlFile;
  } catch (err) {
    throw new TaskParseError(`Invalid TOML: ${(err as Error).message}`);
  }

  const rawEntries = parsed.task ?? [];
  return rawEntries.map((raw, idx) => normalizeTask(raw, idx));
}

/**
 * Fill in defaults, validate required fields, narrow types.
 */
function normalizeTask(raw: RawTaskTomlEntry, idx: number): Task {
  if (!raw.id || typeof raw.id !== "string") {
    throw new TaskParseError(`task[${idx}]: missing required field 'id'`, raw);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(raw.id)) {
    throw new TaskParseError(
      `task[${idx}] (id=${raw.id}): id must be lowercase kebab-case`,
      raw,
    );
  }
  if (!raw.title || typeof raw.title !== "string") {
    throw new TaskParseError(`task[${idx}] (id=${raw.id}): missing required field 'title'`, raw);
  }
  if (!raw.prompt || typeof raw.prompt !== "string") {
    throw new TaskParseError(`task[${idx}] (id=${raw.id}): missing required field 'prompt'`, raw);
  }

  const disposition = (raw.disposition ?? "auto") as Disposition;
  if (!DISPOSITIONS.includes(disposition)) {
    throw new TaskParseError(
      `task[${idx}] (id=${raw.id}): disposition '${raw.disposition}' invalid; must be one of ${DISPOSITIONS.join(",")}`,
      raw,
    );
  }

  if (disposition !== "local" && !raw.repo) {
    throw new TaskParseError(
      `task[${idx}] (id=${raw.id}): non-local disposition '${disposition}' requires 'repo' (e.g. "owner/name")`,
      raw,
    );
  }

  return {
    id: raw.id,
    title: raw.title,
    prompt: raw.prompt,
    disposition,
    repo: raw.repo ?? "",
    branch: raw.branch ?? "main",
    label: raw.label,
    automerge: raw.automerge ?? false,
    deepReview: raw.deep_review ?? false,
    dependsOn: raw.depends_on ?? [],
  };
}
