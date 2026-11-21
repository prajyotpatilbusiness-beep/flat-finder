import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  build: {
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        marketplace: resolve(root, "marketplace.html"),
        research: resolve(root, "research.html"),
        plans: resolve(root, "plans.html"),
      },
    },
  },
});
