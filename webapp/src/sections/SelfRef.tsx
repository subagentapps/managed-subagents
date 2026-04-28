import { BUILD_META } from "../data/build-meta";
import styles from "./SelfRef.module.css";

const REPO_URL = "https://github.com/subagentapps/managed-subagents";

export function SelfRef() {
  return (
    <section className={styles.section} aria-labelledby="selfref-heading">
      <div>
        <p className={styles.eyebrow}>self-referential note</p>
        <h2 id="selfref-heading" className={styles.statement}>
          this site was shipped by{" "}
          <span className={styles.num}>{BUILD_META.builtBySubagents}</span>{" "}
          dispatched subagents in{" "}
          <span className={styles.num}>{BUILD_META.wallTimeMinutes}</span> min for{" "}
          <span className={styles.cost}>${BUILD_META.costUsd.toFixed(2)}</span>.
        </h2>
      </div>

      <div className={styles.metaList} role="group" aria-label="build metadata">
        <div className={styles.metaRow}>
          <span className={styles.metaKey}>prs</span>
          <span className={styles.metaVal}>
            <span className={styles.prList}>
              {BUILD_META.prNumbers.map((n) => (
                <a key={n} href={`${REPO_URL}/pull/${n}`}>
                  #{n}
                </a>
              ))}
            </span>
          </span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaKey}>worker</span>
          <span className={styles.metaVal}>{BUILD_META.workerVersionId}</span>
        </div>
        <div className={styles.metaRow}>
          <span className={styles.metaKey}>deployed</span>
          <span className={styles.metaVal}>{BUILD_META.deployedAt}</span>
        </div>
      </div>
    </section>
  );
}
