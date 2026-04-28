import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    css: false,  // CSS modules return empty objects in jsdom — components shouldn't depend on real class names
  },
});
