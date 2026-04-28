import styles from "./App.module.css";

const REPO_URL = "https://github.com/subagentapps/managed-subagents";

type Feature = {
  title: string;
  body: string;
};

const features: Feature[] = [
  {
    title: "Ship, review, merge",
    body:
      "Dispatch tasks to Claude Code, watch the resulting pull requests, and gate merges behind your own checks — all from one loop.",
  },
  {
    title: "Telemetry built in",
    body:
      "Every dispatch records cost, duration, and outcome. Know exactly how much each PR took before it lands in main.",
  },
  {
    title: "Hard rails by default",
    body:
      "Per-dispatch budget caps, no nested agent spawning, and an explicit block on auto-merge to protected branches. Safe defaults you can override.",
  },
];

export function App() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.eyebrow}>managedsubagents.com</span>
          <h1 className={styles.headline}>
            Autonomous PR orchestration for Claude Code
          </h1>
          <p className={styles.subhead}>
            A local-first orchestrator that fans out work to Claude Code
            sessions, watches the PRs they open, and merges what passes — with
            cost caps and hard rails baked in.
          </p>
        </div>
      </header>

      <section className={styles.features} aria-label="Features">
        <div className={styles.container}>
          <div className={styles.grid}>
            {features.map((f) => (
              <article key={f.title} className={styles.card}>
                <h2 className={styles.cardTitle}>{f.title}</h2>
                <p className={styles.cardBody}>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.cta} aria-label="Get started">
        <div className={styles.container}>
          <h2 className={styles.ctaTitle}>See the source, run it locally.</h2>
          <a
            className={styles.ctaButton}
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.container} ${styles.footerInner}`}>
          <span>(c) {new Date().getFullYear()} managedsubagents</span>
          <nav className={styles.footerLinks} aria-label="Footer">
            <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
              GitHub
            </a>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Issues
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
