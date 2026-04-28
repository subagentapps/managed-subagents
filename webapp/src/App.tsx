import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { Install } from "./sections/Install";
import { SelfRef } from "./sections/SelfRef";
import { Stack } from "./sections/Stack";
import styles from "./App.module.css";

export function App() {
  return (
    <main className={styles.page}>
      <Hero />
      <Stack />
      <Install />
      <SelfRef />
      <Footer />
    </main>
  );
}
