/**
 * La MISMA tabla de celulares para las dos implementaciones: `normalizarTelefono` (TypeScript, src/lib/telefono.ts)
 * y `fn_normalizar_telefono` (SQL, migración 0006). Si una cambia y la otra no, una prueba falla.
 */
export const CASOS_TELEFONO: [entrada: string | null, esperado: string | null | "ERROR"][] = [
  ["3001234567", "+573001234567"],
  [" 300 123 4567 ", "+573001234567"],
  ["(300) 123-4567", "+573001234567"],
  ["+57 300 123 4567", "+573001234567"],
  ["573001234567", "+573001234567"],
  ["0057 300 123 4567", "+573001234567"],
  ["+1 305 555 1234", "+13055551234"],
  ["", null],
  ["   ", null],
  [null, null],
  ["12345", "ERROR"],
  ["2001234567", "ERROR"],
  ["30012345678", "ERROR"],
  ["abcdefghij", "ERROR"],
  ["+0123456789", "ERROR"],
];
