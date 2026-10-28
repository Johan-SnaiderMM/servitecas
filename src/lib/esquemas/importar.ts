import { z } from "zod";
import { MAX_FILAS } from "@/lib/importar-clientes";

/** Las filas que manda la pantalla de carga (ya revisadas en el celular). Solo servidor. */
export const esquemaFilasImportar = z
  .array(
    z.object({
      fila: z.number().int().min(1),
      placa: z.string().max(20).nullable(),
      nombre: z.string().max(60).nullable(),
      celular: z.string().min(1).max(20),
    })
  )
  .min(1, "El archivo no tiene clientes para cargar.")
  .max(MAX_FILAS, `Carga hasta ${MAX_FILAS.toLocaleString("es-CO")} clientes a la vez: divide el archivo en partes.`);
