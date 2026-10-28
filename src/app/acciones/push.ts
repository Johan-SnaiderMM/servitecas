"use server";

import { z } from "zod";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm } from "@/lib/errores";

const esquemaSuscripcion = z.object({
  endpoint: z.url("El celular no dio una dirección válida para los avisos.").startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

/** Activa los avisos de respuestas de clientes en ESTE celular (la suscripción que dio el navegador). */
export async function guardarSuscripcionPush(suscripcion: unknown): Promise<EstadoForm> {
  const parsed = esquemaSuscripcion.safeParse(suscripcion);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "No se pudieron activar los avisos." };

  const r = await ejecutar("guardar_suscripcion_push", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  return r.ok ? { error: null } : { error: r.error };
}

/** Apaga los avisos en este celular. */
export async function quitarSuscripcionPush(endpoint: string): Promise<EstadoForm> {
  const parsed = z.url().safeParse(endpoint);
  if (!parsed.success) return { error: "No se pudieron apagar los avisos." };
  const r = await ejecutar("quitar_suscripcion_push", { p_endpoint: parsed.data });
  return r.ok ? { error: null } : { error: r.error };
}
