import { z } from "zod";

/** Entradas del equipo. Solo servidor: los componentes de cliente no importan Zod. */

const ROLES = z
  .array(z.uuid("Uno de los roles no es válido."))
  .min(1, "Elige al menos un rol: sin roles no podría hacer nada.")
  .max(10, "Son demasiados roles.");

export const esquemaInvitacion = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribe el nombre de la persona.")
    .max(40, "El nombre es muy largo (máximo 40 letras)."),
  roles: ROLES,
});

export const esquemaRolesMiembro = z.object({
  user_id: z.uuid("La persona no es válida."),
  roles: ROLES,
});

export const esquemaIdUsuario = z.object({ user_id: z.uuid("La persona no es válida.") });
export const esquemaIdInvitacion = z.object({ id: z.uuid("La invitación no es válida.") });
