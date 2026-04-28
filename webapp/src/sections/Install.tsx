import styles from "./Install.module.css";

const STEPS = [
  {
    label: "01",
    name: "clone",
    body: "grab the repo. it's the monorepo home for the orchestrator, the cowork plugins, and this webapp.",
    cmd: "git clone https://github.com/subagentapps/managed-subagents.git",
    output: { kind: "dim" as const, text: "Cloning into 'managed-subagents'... done." },
  },
  {
    label: "02",
    name: "bootstrap",
    body: "reproducible install via npm ci, then a typescript build. takes about a minute on a cold cache.",
    cmd: "cd managed-subagents/subagent-orchestrator && npm ci && npm run build",
    output: { kind: "ok" as const, text: "added 312 packages · tsc → dist/ ok" },
  },
  {
    label: "03",
    name: "smoke-test",
    body: "the doctor command checks node version, oauth token, git config, and writes a one-line health report.",
    cmd: "node dist/index.js doctor",
    output: { kind: "ok" as const, text: "doctor: all checks passed ✓" },
  },
];

export function Install() {
  return (
    <section className={styles.section} aria-labelledby="install-heading">
      <h2 id="install-heading" className={styles.heading}>
        install
      </h2>
      <p className={styles.tagline}>
        three steps, copy-paste. local-first — no daemon, no cloud account, no
        signup.
      </p>
      <div className={styles.grid}>
        {STEPS.map((s) => (
          <article key={s.name} className={styles.card}>
            <span className={styles.cardLabel}>{s.label}</span>
            <h3 className={styles.cardName}>{s.name}</h3>
            <p className={styles.cardBody}>{s.body}</p>
            <div className={styles.terminal} aria-label={`${s.name} command`}>
              <pre>
                <span className={styles.prompt}>$</span>{" "}
                <span className={styles.cmd}>{s.cmd}</span>
                {"\n"}
                <span className={styles[s.output.kind]}>{s.output.text}</span>
              </pre>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
