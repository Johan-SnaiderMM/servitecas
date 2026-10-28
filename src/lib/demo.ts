import "server-only";
import { usarBdLocal, type QuienDemo } from "@/lib/supabase/servidor";

/**
 * ¿Se muestra «Probar la demo» para esta cuenta? Solo si el servidor tiene su correo y su contraseña (DEMO_EMAIL /
 * DEMO_PASSWORD para el gerente, DEMO_JEFE_EMAIL / DEMO_JEFE_PASSWORD para el jefe de patio) o en el modo local.
 */
export function demoDisponible(quien: QuienDemo): boolean {
  if (usarBdLocal()) return true;
  const correo = quien === "jefe" ? process.env.DEMO_JEFE_EMAIL : process.env.DEMO_EMAIL;
  const clave = quien === "jefe" ? process.env.DEMO_JEFE_PASSWORD : process.env.DEMO_PASSWORD;
  return Boolean(correo?.trim() && clave);
}
