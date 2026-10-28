/**
 * La MISMA tabla de placas para las dos implementaciones: `normalizarPlaca` (TypeScript, src/lib/placa.ts) y
 * `fn_normalizar_placa` (SQL, migración 0006). Si una cambia y la otra no, una prueba falla.
 * "VACIA" y "ERROR" son los dos mensajes de error posibles.
 */
export const CASOS_PLACA: [entrada: string | null, esperado: string | "VACIA" | "ERROR"][] = [
  ["ABC123", "ABC123"],
  ["abc123", "ABC123"],
  [" ABC-123 ", "ABC123"],
  ["abc 123", "ABC123"],
  ["ABC.123", "ABC123"],
  ["abc12d", "ABC12D"],
  ["ABC 12D", "ABC12D"],
  ["AB1234", "AB1234"], // antigua
  ["ABC12", "ABC12"], // moto antigua
  ["8AB1234", "8AB1234"], // extranjera, 7 caracteres
  ["ñABC123", "ABC123"], // lo que no es letra ni número se ignora
  ["", "VACIA"],
  ["   ", "VACIA"],
  [null, "VACIA"],
  ["--", "VACIA"],
  ["AB12", "ERROR"], // muy corta
  ["ABCD12345", "ERROR"], // muy larga
  ["ABCDEF", "ERROR"], // sin números
  ["123456", "ERROR"], // sin letras
];
