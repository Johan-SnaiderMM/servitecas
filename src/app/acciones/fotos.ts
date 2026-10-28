"use server";

import { revalidatePath } from "next/cache";
import { puedeVer } from "@/lib/areas";
import { bd } from "@/lib/datos/bd";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm, Resultado } from "@/lib/errores";
import { BUCKET_FOTOS, FOTO_BYTES_MAXIMOS, esJpeg, esUuid, rutaFotoOrden } from "@/lib/fotos";
import { obtenerQuien } from "@/lib/permisos";

/**
 * Sube una foto (ya achicada por el celular) y la registra en la orden: de ingreso, o de un hallazgo si llega su id. Primero el archivo, con la clave
 * como nombre, y después el registro: si algo falla y se reintenta con la misma clave, no queda nada repetido.
 */
export async function subirFotoOrden(formulario: FormData): Promise<Resultado<{ id: string }>> {
  const orden = formulario.get("orden")?.toString() ?? "";
  const clave = formulario.get("clave")?.toString() ?? "";
  const hallazgo = formulario.get("hallazgo")?.toString() || null;
  const foto = formulario.get("foto");
  if (!esUuid(orden) || !esUuid(clave) || (hallazgo !== null && !esUuid(hallazgo))) {
    return { ok: false, error: "Vuelve a abrir la orden e intenta otra vez." };
  }
  if (!(foto instanceof File) || foto.size === 0) return { ok: false, error: "No llegó la foto. Tómala otra vez." };
  if (foto.size > FOTO_BYTES_MAXIMOS) return { ok: false, error: "La foto pesa demasiado. Toma otra." };

  const { taller, quien } = await obtenerQuien();
  if (!puedeVer(quien, "ordenes")) return { ok: false, error: "No tienes permiso para tomar fotos. Pídeselo al dueño." };

  // Lo que se guarda tiene que SER una foto: se mira el contenido, no el nombre ni el tipo que dijo el navegador.
  const datos = new Uint8Array(await foto.arrayBuffer());
  if (!esJpeg(datos)) return { ok: false, error: "La foto no es válida. Tómala otra vez." };
  const ruta = rutaFotoOrden(taller.id, orden, clave);
  if (!ruta) return { ok: false, error: "La foto no es válida. Tómala otra vez." };

  const subida = await (await bd()).subirArchivo(BUCKET_FOTOS, ruta, datos, "image/jpeg");
  if (subida.error) return { ok: false, error: subida.error };

  const r = await ejecutar<{ id: string }>("registrar_foto_orden", { p_clave: clave, p_orden: orden, p_hallazgo: hallazgo });
  if (!r.ok) return r;

  revalidatePath(`/ordenes/${orden}`);
  return r;
}

/** Quitar una foto (queda anulada con su motivo; nada se borra). */
export async function quitarFotoOrden(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const id = formulario.get("id")?.toString() ?? "";
  const orden = formulario.get("orden")?.toString() ?? "";
  if (!esUuid(id) || !esUuid(orden)) return { error: "La foto no es válida." };

  const r = await ejecutar("quitar_foto_orden", { p_id: id, p_motivo: "Se quitó desde la orden" });
  if (!r.ok) return { error: r.error };

  revalidatePath(`/ordenes/${orden}`);
  return { error: null };
}
