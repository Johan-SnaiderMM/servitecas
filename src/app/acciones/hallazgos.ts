"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerPesos } from "@/lib/dinero";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm, Resultado } from "@/lib/errores";
import {
  esquemaAnularHallazgo,
  esquemaHallazgo,
  esquemaItemCatalogo,
  esquemaRespuestaTelefono,
} from "@/lib/esquemas/hallazgo";

/** Texto de un campo; vacío = undefined (para los opcionales). */
function campo(formulario: FormData, nombre: string): string | undefined {
  const v = formulario.get(nombre)?.toString().trim();
  return v ? v : undefined;
}

/** "180.000" -> 180000; vacío -> undefined. */
function precio(formulario: FormData): number | undefined {
  const texto = campo(formulario, "precio");
  return texto === undefined ? undefined : (leerPesos(texto) ?? undefined);
}

/**
 * Registra un hallazgo en la orden. No redirige: la pantalla sube después sus fotos (con el id que devuelve) y luego
 * vuelve a la orden. La clave la generó la pantalla: un reintento no lo duplica.
 */
export async function crearHallazgo(formulario: FormData): Promise<Resultado<{ id: string }>> {
  const parsed = esquemaHallazgo.safeParse({
    clave: campo(formulario, "clave"),
    orden: campo(formulario, "orden"),
    titulo: campo(formulario, "titulo") ?? "",
    descripcion: campo(formulario, "descripcion") ?? "",
    precio: precio(formulario),
    catalogo: campo(formulario, "catalogo"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el hallazgo." };

  const d = parsed.data;
  const r = await ejecutar<{ id: string }>("crear_hallazgo", {
    p_clave: d.clave,
    p_orden: d.orden,
    p_titulo: d.titulo,
    p_descripcion: d.descripcion,
    p_precio: d.precio ?? null,
    p_catalogo: d.catalogo ?? null,
  });
  if (!r.ok) return r;

  revalidatePath(`/ordenes/${d.orden}`);
  revalidatePath("/inicio");
  return r;
}

/** El cliente respondió por teléfono (o en persona): se anota. */
export async function responderHallazgoTelefono(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaRespuestaTelefono.safeParse({
    id: campo(formulario, "id"),
    orden: campo(formulario, "orden"),
    respuesta: campo(formulario, "respuesta"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa la respuesta." };

  const r = await ejecutar("responder_hallazgo_telefono", { p_id: parsed.data.id, p_respuesta: parsed.data.respuesta });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/ordenes/${parsed.data.orden}`);
  revalidatePath("/inicio");
  return { error: null };
}

/** Anular un hallazgo puesto por error, con su motivo. */
export async function anularHallazgo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaAnularHallazgo.safeParse({
    id: campo(formulario, "id"),
    orden: campo(formulario, "orden"),
    motivo: campo(formulario, "motivo") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el motivo." };

  const r = await ejecutar("anular_hallazgo", { p_id: parsed.data.id, p_motivo: parsed.data.motivo });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/ordenes/${parsed.data.orden}`);
  revalidatePath("/inicio");
  return { error: null };
}

/** Crear o editar un hallazgo de la lista del taller. */
export async function guardarItemCatalogo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const parsed = esquemaItemCatalogo.safeParse({
    id: campo(formulario, "id"),
    categoria: campo(formulario, "categoria") ?? "",
    nombre: campo(formulario, "nombre") ?? "",
    descripcion: campo(formulario, "descripcion") ?? "",
    precio: precio(formulario),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el hallazgo." };

  const d = parsed.data;
  const r = await ejecutar("guardar_hallazgo_catalogo", {
    p_id: d.id ?? null,
    p_categoria: d.categoria,
    p_nombre: d.nombre,
    p_descripcion: d.descripcion,
    p_precio: d.precio ?? null,
  });
  if (!r.ok) return { error: r.error };

  revalidatePath("/catalogo");
  redirect("/catalogo");
}

/** Archivar o restaurar un hallazgo de la lista. */
export async function fijarItemCatalogoActivo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const id = campo(formulario, "id");
  const activo = campo(formulario, "activo") === "true";
  if (!id) return { error: "El hallazgo no es válido." };

  const r = await ejecutar("fijar_hallazgo_catalogo_activo", { p_id: id, p_activo: activo });
  if (!r.ok) return { error: r.error };

  revalidatePath("/catalogo");
  redirect("/catalogo");
}
