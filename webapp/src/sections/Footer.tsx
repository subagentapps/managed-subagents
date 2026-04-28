import styles from "./Footer.module.css";

const REPO_URL = "https://github.com/subagentapps/managed-subagents";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div>
        <span className={styles.glyph}>&gt;</span> managedsubagents{" "}
        <span className={styles.muted}>// public, MIT, $0/mo</span>
      </div>
      <div>
        <a href={REPO_URL}>github</a>
        <span className={styles.muted}> · </span>
        <a href={`${REPO_URL}/issues`}>issues</a>
        <span className={styles.muted}> · </span>
        <a href={`${REPO_URL}/blob/main/README.md`}>readme</a>
      </div>
    </footer>
  );
}
