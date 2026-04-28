export interface BuildMeta {
  builtBySubagents: number;
  costUsd: number;
  wallTimeMinutes: number;
  prNumbers: number[];
  workerVersionId: string;
  deployedAt: string;
}

export const BUILD_META: BuildMeta = {
  builtBySubagents: 6,
  costUsd: 3.35,
  wallTimeMinutes: 60,
  prNumbers: [57, 58, 59, 60, 61, 62],
  workerVersionId: "0837ad39-76a5-4a86-a929-b8cf687aa0d0",
  deployedAt: "2026-04-28T03:53:00Z",
};
