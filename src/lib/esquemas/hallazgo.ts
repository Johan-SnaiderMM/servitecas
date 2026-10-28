import { z } from "zod";

/** Entradas de los hallazgos y del catálogo. Solo servidor: los componentes de cliente no importan Zod. */

const PRECIO = z
  .number({ error: "El precio no es válido." })
  .int("El precio va en pesos, sin centavos.")
  .min(0, "El precio no es válido.")
  .max(20_000_000, "El precio es demasiado alto.");

const TITULO = z.string().trim().min(1, "Escribe qué se encontró.").max(80, "El nombre es muy largo (máximo 80 caracteres).");
const DESCRIPCION = z
  .string()
  .trim()
  .min(1, "Explícale al cliente qué pasa.")
  .max(300, "La explicación es muy larga (máximo 300 caracteres).");

export const esquemaHallazgo = z.object({
  clave: z.uuid("Vuelve a abrir la pantalla: falta la clave del hallazgo."),
  orden: z.uuid("La orden no es válida."),
  titulo: TITULO,
  descripcion: DESCRIPCION,
  precio: PRECIO.optional(),
  catalogo: z.uuid("El hallazgo de la lista no es válido.").optional(),
});

export const esquemaItemCatalogo = z.object({
  id: z.uuid("El hallazgo no es válido.").optional(),
  categoria: z.string().min(1, "Elige la categoría."),
  nombre: TITULO,
  descripcion: DESCRIPCION,
  precio: PRECIO.optional(),
});

export const esquemaRespuestaTelefono = z.object({
  id: z.uuid("El hallazgo no es válido."),
  orden: z.uuid("La orden no es válida."),
  respuesta: z.enum(["autorizado", "rechazado"], { error: "Elige si el cliente autorizó o no." }),
});

export const esquemaAnularHallazgo = z.object({
  id: z.uuid("El hallazgo no es válido."),
  orden: z.uuid("La orden no es válida."),
  motivo: z.string().trim().min(3, "Escribe por qué se anula.").max(200, "El motivo es muy largo (máximo 200 caracteres)."),
});
