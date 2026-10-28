"use server";

import { revalidatePath } from "next/cache";
import { ejecutar } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esquemaMensaje } from "@/lib/esquemas/mensaje";
import { esUuid } from "@/lib/fotos";

/**
 * El taller le responde al cliente en su enlace. La clave la generó la pantalla: un reintento no lo duplica. Después
 * la pantalla ofrece avisarle por WhatsApp (la app no manda mensajes sola).
 */
export async function enviarMensajeOrden(clave: string, orden: string, texto: string): Promise<Resultado<{ id: string }>> {
  const parsed = esquemaMensaje.safeParse({ clave, orden, texto });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa el mensaje." };

  const d = parsed.data;
  const r = await ejecutar<{ id: string }>("enviar_mensaje_orden", { p_clave: d.clave, p_orden: d.orden, p_texto: d.texto });
  if (!r.ok) return r;

  revalidatePath(`/ordenes/${d.orden}`);
  revalidatePath("/inicio");
  return r;
}

/**
 * Al abrir la orden: lo que escribió el cliente queda visto (él lo ve en su enlace) y sale del contador del patio. No
 * revalida nada: la orden abierta seguiría mostrando «Nuevo» y el patio se vuelve a pedir al regresar a él.
 */
export async function marcarMensajesLeidos(orden: string): Promise<void> {
  if (!esUuid(orden)) return;
  await ejecutar("marcar_mensajes_leidos", { p_orden: orden });
}
