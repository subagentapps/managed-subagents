// `subagent-orchestrator doctor` — diagnose stack readiness.

import { doctor, type DoctorOptions } from "../doctor.js";

export interface DoctorCommandOptions extends DoctorOptions {}

const ICONS: Record<string, string> = { ok: "✅", warn: "⚠ ", fail: "❌" };

export async function runDoctor(options: DoctorCommandOptions = {}): Promise<void> {
  const report = await doctor(options);
  for (const c of report.checks) {
    console.log(`${ICONS[c.severity] ?? "?"} ${c.name.padEnd(13)} ${c.message}`);
    if (c.hint && c.severity !== "ok") {
      console.log(`     ↳ ${c.hint}`);
    }
  }
  const fails = report.checks.filter((c) => c.severity === "fail").length;
  const warns = report.checks.filter((c) => c.severity === "warn").length;
  console.log(`\n${report.checks.length} checks: ${report.checks.length - fails - warns} ok, ${warns} warn, ${fails} fail`);
  if (report.hasFailures) process.exitCode = 1;
}
