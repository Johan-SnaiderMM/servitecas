import "server-only";
import { randomUUID } from "node:crypto";

/**
 * "Ahora" en milisegundos, leído en el servidor. Las páginas del servidor lo piden aquí (y lo pasan como dato a
 * los componentes) en vez de llamar a `Date.now()` durante el render: así el componente queda puro y el reloj se
 * puede controlar en un solo lugar.
 */
export function ahoraMs(): number {
  return Date.now();
}

/**
 * Una clave nueva (uuid) para una operación que no se debe repetir, como un cobro: la página la crea al abrirse y la
 * pantalla la manda con el formulario. Por la misma razón que `ahoraMs`, no se genera dentro del render.
 */
export function nuevaClave(): string {
  return randomUUID();
}
