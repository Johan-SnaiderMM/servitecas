import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lanza fuera de un servidor de React: en las pruebas se sustituye por un módulo vacío.
      "server-only": fileURLToPath(new URL("./src/lib/vacio.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // PGlite arranca una base completa en memoria: se da margen a los hooks de preparación.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // Cada archivo con PGlite levanta su propio Postgres en WebAssembly; sin tope la memoria no alcanza en Windows.
    maxWorkers: 4,
  },
});
