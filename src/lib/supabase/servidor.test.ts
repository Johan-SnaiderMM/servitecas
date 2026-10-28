import { afterEach, describe, expect, it, vi } from "vitest";
import { usarBdLocal, usarDemoPublica } from "@/lib/supabase/servidor";

/**
 * El modo local acepta cualquier contraseña: en producción NO debe existir salvo la demo pública, que se pide a
 * propósito con DEMO_PUBLICA=1 (ver bd-local.ts, donde además se cierra la entrada por contraseña).
 */
describe("cuándo se usa la base local", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("en producción nunca, ni con DEMO_BD=local", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_BD", "local");
    vi.stubEnv("DEMO_PUBLICA", "");
    expect(usarDemoPublica()).toBe(false);
    expect(usarBdLocal()).toBe(false);
  });

  it("en producción solo con DEMO_PUBLICA=1 exacto", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_BD", "");
    for (const valor of ["true", "yes", "0", "11", " 1"]) {
      vi.stubEnv("DEMO_PUBLICA", valor);
      expect(usarBdLocal(), `DEMO_PUBLICA=${valor}`).toBe(false);
    }
    vi.stubEnv("DEMO_PUBLICA", "1");
    expect(usarDemoPublica()).toBe(true);
    expect(usarBdLocal()).toBe(true);
  });

  it("en desarrollo, DEMO_BD=local sigue encendiendo la base local", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEMO_PUBLICA", "");
    vi.stubEnv("DEMO_BD", "local");
    expect(usarBdLocal()).toBe(true);
    vi.stubEnv("DEMO_BD", "");
    expect(usarBdLocal()).toBe(false);
  });
});
