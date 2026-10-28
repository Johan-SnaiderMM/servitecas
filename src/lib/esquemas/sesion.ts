import { z } from "zod";

/** Entrada del dueño con correo y contraseña. Solo servidor: los componentes de cliente no importan Zod. */
export const esquemaEntrar = z.object({
  correo: z.string().trim().toLowerCase().pipe(z.email("Escribe un correo válido.")),
  clave: z.string().min(1, "Escribe la contraseña.").max(200, "La contraseña es muy larga."),
});

export type EntradaEntrar = z.infer<typeof esquemaEntrar>;
