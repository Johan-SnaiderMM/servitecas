"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm } from "@/lib/errores";
import {
  esquemaIdInvitacion,
  esquemaIdUsuario,
  esquemaInvitacion,
  esquemaRolesMiembro,
} from "@/lib/esquemas/equipo";

/** Los roles llegan como JSON en un campo del formulario. */
function leerRoles(formulario: FormData): unknown {
  try {
    return JSON.parse(formulario.get("roles")?.toString() ?? "[]");
  } catch {
    return null;
  }
}

/**
 * Invita a alguien al equipo: nombre y roles. Devuelve a la pantalla del código para compartirlo. Que no se den
 * permisos de más lo aplica la base.
 */
export async function crearInvitacion(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaInvitacion.safeParse({
    nombre: formulario.get("nombre")?.toString() ?? "",
    roles: leerRoles(formulario),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos de la invitación." };

  const r = await ejecutar<{ id: string }>("crear_invitacion", {
    p_nombre: parsed.data.nombre,
    p_roles: parsed.data.roles,
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/equipo");
  redirect(`/equipo/invitacion/${r.datos.id}`);
}

/** Anula una invitación que todavía no se usó. */
export async function anularInvitacion(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaIdInvitacion.safeParse({ id: formulario.get("id")?.toString() ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "La invitación no es válida." };

  const r = await ejecutar("anular_invitacion", { p_id: parsed.data.id });
  if (!r.ok) return { error: r.error };

  revalidatePath("/equipo");
  redirect("/equipo");
}

/** Deja a una persona con exactamente estos roles. */
export async function cambiarRolesMiembro(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaRolesMiembro.safeParse({
    user_id: formulario.get("user_id")?.toString() ?? "",
    roles: leerRoles(formulario),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los roles." };

  const r = await ejecutar("cambiar_roles_miembro", { p_user_id: parsed.data.user_id, p_roles: parsed.data.roles });
  if (!r.ok) return { error: r.error };

  revalidatePath("/equipo");
  redirect("/equipo");
}

/** Quita a alguien del equipo: pierde el acceso al instante. */
export async function quitarDelEquipo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaIdUsuario.safeParse({ user_id: formulario.get("user_id")?.toString() ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "La persona no es válida." };

  const r = await ejecutar("quitar_del_equipo", { p_user_id: parsed.data.user_id });
  if (!r.ok) return { error: r.error };

  revalidatePath("/equipo");
  redirect("/equipo");
}
