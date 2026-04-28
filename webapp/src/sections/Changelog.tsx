import { CHANGELOG } from "../data/changelog";
import styles from "./Changelog.module.css";

export function Changelog() {
  return (
    <section className={styles.section} aria-labelledby="changelog-heading">
      <h2 id="changelog-heading" className={styles.heading}>
        changelog
      </h2>
      <p className={styles.tagline}>
        recent meaningful merges into{" "}
        <code className={styles.repo}>subagentapps/managed-subagents</code>.
      </p>
      <ul className={styles.list}>
        {CHANGELOG.map((entry) => (
          <li key={entry.pr} className={styles.item}>
            <a
              className={styles.pr}
              href={`https://github.com/subagentapps/managed-subagents/pull/${entry.pr}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              #{entry.pr}
            </a>
            <span className={styles.title}>{entry.title}</span>
            <time className={styles.date} dateTime={entry.mergedAt}>
              {entry.mergedAt}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
