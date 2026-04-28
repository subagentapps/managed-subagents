import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { SelfRef } from "./sections/SelfRef";
import { Stack } from "./sections/Stack";
import styles from "./App.module.css";

export function App() {
  return (
    <main className={styles.page}>
      <Hero />
      <Stack />
      <SelfRef />
      <Footer />
    </main>
  );
}
