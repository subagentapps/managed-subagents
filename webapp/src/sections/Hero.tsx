import styles from "./Hero.module.css";

const REPO_URL = "https://github.com/subagentapps/managed-subagents";

export function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.brandRow}>
        <span>
          <span className={styles.brand}>&gt;</span> managedsubagents
        </span>
        <span className={styles.statusDot}>online</span>
      </div>

      <h1 className={styles.title}>
        ship<span className={styles.accent}>.</span>
        review<span className={styles.accent}>.</span>
        merge<span className={styles.accent}>.</span>
        <br />
        on loop.
      </h1>

      <p className={styles.subhead}>
        a local-first orchestrator that fans work out to claude code, watches
        the prs, and merges what passes. budget caps + hard rails baked in.
      </p>

      <div className={styles.terminal} aria-label="example session">
        <pre>
          <span className={styles.prompt}>$</span>{" "}
          <span className={styles.cmd}>npm i -g @subagentapps/orchestrator</span>
          {"\n"}
          <span className={styles.dim}>added 84 packages in 2s</span>
          {"\n\n"}
          <span className={styles.prompt}>$</span>{" "}
          <span className={styles.cmd}>subagent-orchestrator dispatch all</span>
          {"\n"}
          <span className={styles.ok}>[a] local (1.00) → ready-for-merge ($0.10)</span>
          {"\n"}
          <span className={styles.ok}>[b] web (1.00) → opened PR #42 ($0.65)</span>
          {"\n"}
          <span className={styles.ok}>[c] autofix (1.00) → fixing CI on #41 ($0.30)</span>
          {"\n\n"}
          <span className={styles.dim}>3/3 succeeded · $1.05 spent</span>
          <span className={styles.cursor} aria-hidden="true" />
        </pre>
      </div>

      <div className={styles.ctaRow}>
        <a className={styles.cta} href={REPO_URL}>
          install →
        </a>
        <a className={styles.ctaSecondary} href={`${REPO_URL}#readme`}>
          view source
        </a>
      </div>
    </header>
  );
}
