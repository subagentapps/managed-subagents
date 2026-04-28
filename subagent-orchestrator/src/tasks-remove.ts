// tasks-remove.ts — locate and excise a [[task]] stanza from tasks.toml.
//
// Symmetric counterpart to tasks-add. Operates on the raw text so
// unrelated comments + whitespace survive (round-tripping through
// the TOML library would lose them).

export class RemoveTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoveTaskError";
  }
}

export interface RemoveTaskResult {
  /** New file content with the stanza removed. */
  content: string;
  /** The exact stanza text that was removed (for confirmation). */
  removed: string;
}

const HEADER_RE = /(^|\n)\s*\[\[task\]\]\s*\n/g;

/**
 * Find and remove the [[task]] stanza whose `id = "<id>"` matches.
 *
 * Algorithm:
 *   1. Find every [[task]] header position.
 *   2. For each, slice from that header to the next [[…]] header (or EOF).
 *   3. Inside that slice, look for a line `id = "<id>"`.
 *   4. If found, splice that range out of the original.
 *
 * Throws RemoveTaskError if no matching task is found, or if multiple
 * tasks share the id (refuses to silently delete one of them).
 */
export function removeTaskFromToml(content: string, id: string): RemoveTaskResult {
  if (!id) throw new RemoveTaskError("id is required");

  const headers: Array<{ start: number; end: number }> = [];
  // Find all [[task]] header start positions
  for (const m of content.matchAll(HEADER_RE)) {
    const matchStart = m.index ?? 0;
    // Skip the leading "" or "\n" capture so 'start' is at the [[task]] line
    const headerStart = matchStart + (m[1]?.length ?? 0);
    headers.push({ start: headerStart, end: headerStart });
  }
  if (headers.length === 0) {
    throw new RemoveTaskError(`no [[task]] entries found in tasks.toml`);
  }

  // Find next-section start for each header to bound its body
  // (next header is either another [[task]] or any other [[...]] table-array,
  // or EOF). Use a generic [[…]] regex.
  //
  // After locating the next header, walk backward to detach trailing
  // blank lines and `#`-comment lines: a comment immediately above the
  // next header semantically belongs to that header, not this stanza.
  const sectionRe = /\n\s*\[\[/g;
  for (let i = 0; i < headers.length; i += 1) {
    const startIdx = headers[i]!.start;
    sectionRe.lastIndex = startIdx + 1;
    const m = sectionRe.exec(content);
    let endIdx = m ? m.index + 1 : content.length;  // +1 keeps leading "\n" with previous stanza

    if (m) {
      // Walk back from endIdx over preceding lines while they're blank or
      // start with `#`. Each line is bounded by `\n` characters. Detach
      // those lines so they stay with the next stanza.
      let scanEnd = endIdx;
      while (scanEnd > startIdx) {
        // Find the start of the line that ends at scanEnd
        const prevNl = content.lastIndexOf("\n", scanEnd - 2);
        const lineStart = prevNl < 0 ? 0 : prevNl + 1;
        if (lineStart < startIdx) break;
        const line = content.slice(lineStart, scanEnd - 1).trim();
        if (line === "" || line.startsWith("#")) {
          scanEnd = lineStart;
        } else {
          break;
        }
      }
      endIdx = scanEnd;
    }
    headers[i]!.end = endIdx;
  }

  // Find which body contains `id = "<id>"`
  const idRe = new RegExp(`^\\s*id\\s*=\\s*"${escapeRe(id)}"\\s*$`, "m");
  const matches: Array<{ start: number; end: number }> = [];
  for (const h of headers) {
    const slice = content.slice(h.start, h.end);
    if (idRe.test(slice)) matches.push(h);
  }

  if (matches.length === 0) {
    throw new RemoveTaskError(`no task with id='${id}' found`);
  }
  if (matches.length > 1) {
    throw new RemoveTaskError(`refusing to remove: id='${id}' appears in ${matches.length} stanzas (run 'tasks validate' first)`);
  }

  const { start, end } = matches[0]!;
  // Trim leading newline that precedes the header so we don't leave a blank line
  let cutStart = start;
  if (cutStart > 0 && content[cutStart - 1] === "\n") cutStart -= 1;
  const removed = content.slice(start, end);
  const newContent = content.slice(0, cutStart) + content.slice(end);
  return { content: newContent, removed };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
