import { z } from "zod";
import { MAX_MENSAJE } from "@/lib/mensajes";

/** Entradas de los mensajes del taller. Solo servidor: los componentes de cliente no importan Zod. */
export const esquemaMensaje = z.object({
  clave: z.uuid("Vuelve a abrir la orden: falta la clave del mensaje."),
  orden: z.uuid("La orden no es válida."),
  texto: z
    .string()
    .trim()
    .min(1, "Escribe el mensaje.")
    .max(MAX_MENSAJE, `El mensaje es muy largo (máximo ${MAX_MENSAJE} caracteres).`),
});
