import styles from "./Stack.module.css";

const PRIMITIVES = [
  {
    label: "01",
    name: "ship",
    body: "branch from main, dispatch a task to claude code, push, open a draft pr. one command, no manual steps.",
    cmd: "subagent-orchestrator ship cf-deploy-worker",
  },
  {
    label: "02",
    name: "review",
    body: "fetch the diff, hand to a read-only reviewer subagent, get back a structured verdict, post the result as a pr comment.",
    cmd: "subagent-orchestrator review 60",
  },
  {
    label: "03",
    name: "merge",
    body: "preflight (draft? mergeable? rail-blocked?), merge with --merge --delete-branch, fast-forward your local main.",
    cmd: "subagent-orchestrator merge 60",
  },
];

export function Stack() {
  return (
    <section className={styles.section} aria-labelledby="stack-heading">
      <h2 id="stack-heading" className={styles.heading}>
        the stack
      </h2>
      <p className={styles.tagline}>
        three primitives. compose them with babysit/daemon for an autonomous
        loop.
      </p>
      <div className={styles.grid}>
        {PRIMITIVES.map((p) => (
          <article key={p.name} className={styles.card}>
            <span className={styles.cardLabel}>{p.label}</span>
            <h3 className={styles.cardName}>{p.name}</h3>
            <p className={styles.cardBody}>{p.body}</p>
            <p className={styles.cardCmd}>{p.cmd}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
