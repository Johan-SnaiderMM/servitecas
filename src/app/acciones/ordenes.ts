"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { consultar, ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm } from "@/lib/errores";
import { esquemaAsignar, esquemaCambioEstado, esquemaCancelar, esquemaRecibir } from "@/lib/esquemas/orden";
import type { VehiculoConocido } from "@/lib/tipos/ordenes";

/** Texto de un campo; vacío = undefined (para los opcionales). */
function campo(formulario: FormData, nombre: string): string | undefined {
  const v = formulario.get(nombre)?.toString().trim();
  return v ? v : undefined;
}

/** "45.200 km" -> 45200. Vacío -> undefined. Lo que no es número -> NaN (el esquema lo rechaza con su mensaje). */
function kilometraje(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  const digitos = texto.replace(/[.\s]|km/gi, "");
  return /^\d+$/.test(digitos) ? Number(digitos) : Number.NaN;
}

/** Mientras se escribe la placa: ¿ya la conocemos? Nunca lanza: si algo falla, la pantalla sigue sin sugerencias. */
export async function buscarVehiculo(placa: string): Promise<VehiculoConocido | null> {
  try {
    return await consultar<VehiculoConocido>("buscar_vehiculo", { p_placa: placa.slice(0, 20) });
  } catch {
    return null;
  }
}

/** Recibir un vehículo: abre la orden y lleva a ella para enviarle el enlace al cliente. */
export async function recibirVehiculo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaRecibir.safeParse({
    clave: campo(formulario, "clave"),
    placa: campo(formulario, "placa") ?? "",
    celular: campo(formulario, "celular") ?? "",
    servicio: campo(formulario, "servicio") ?? "",
    nombre: campo(formulario, "nombre"),
    asignado: campo(formulario, "asignado"),
    kilometraje: kilometraje(campo(formulario, "kilometraje")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del vehículo." };

  const d = parsed.data;
  const r = await ejecutar<{ id: string }>("recibir_vehiculo", {
    p_clave: d.clave,
    p_placa: d.placa,
    p_celular: d.celular,
    p_servicio: d.servicio,
    p_nombre: d.nombre ?? null,
    p_asignado: d.asignado ?? null,
    p_kilometraje: d.kilometraje ?? null,
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/inicio");
  redirect(`/ordenes/${r.datos.id}?nueva=1`);
}

/** Cambiar el estado de una orden (el botón grande o la lista de estados). */
export async function cambiarEstadoOrden(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaCambioEstado.safeParse({ id: campo(formulario, "id"), estado: campo(formulario, "estado") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el estado." };

  const r = await ejecutar("cambiar_estado_orden", { p_id: parsed.data.id, p_estado: parsed.data.estado });
  if (!r.ok) return { error: r.error };

  revalidatePath("/inicio");
  revalidatePath(`/ordenes/${parsed.data.id}`);
  return { error: null };
}

/** Cancelar una orden abierta, con su motivo. */
export async function cancelarOrden(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaCancelar.safeParse({ id: campo(formulario, "id"), motivo: campo(formulario, "motivo") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el motivo." };

  const r = await ejecutar("cancelar_orden", { p_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return { error: r.error };

  revalidatePath("/inicio");
  revalidatePath(`/ordenes/${parsed.data.id}`);
  return { error: null };
}

/** Asignar la orden a un jefe de patio (vacío = sin asignar). */
export async function asignarOrden(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaAsignar.safeParse({ id: campo(formulario, "id"), asignado: campo(formulario, "asignado") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa a quién se asigna." };

  const r = await ejecutar("asignar_orden", { p_id: parsed.data.id, p_user: parsed.data.asignado ?? null });
  if (!r.ok) return { error: r.error };

  revalidatePath("/inicio");
  revalidatePath(`/ordenes/${parsed.data.id}`);
  return { error: null };
}
