"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { ejecutarPublico } from "@/lib/datos/llamar";
import type { Resultado } from "@/lib/errores";
import { esUuid } from "@/lib/fotos";
import { MAX_MENSAJE, MOTIVO_MENSAJE } from "@/lib/mensajes";
import { avisarMensaje, avisarRespuesta } from "@/lib/push";

type Respuesta = { ok: true; estado: "autorizado" | "rechazado" } | { ok: false; motivo: string };

const MENSAJE_MOTIVO: Record<string, string> = {
  ya_respondido: "Este trabajo ya tiene respuesta.",
  cerrada: "Esta orden ya se cerró. Si tienes dudas, escríbele al taller.",
  no_existe: "Este trabajo ya no está disponible. Si tienes dudas, escríbele al taller.",
};

/**
 * El cliente autoriza o rechaza un hallazgo desde su enlace (sin cuenta: el token es su permiso). Una sola vez. Después
 * de responderle, avisa por push a quien atiende el vehículo, sin hacerlo esperar.
 */
export async function responderHallazgo(
  token: string,
  hallazgo: string,
  respuesta: "autorizado" | "rechazado"
): Promise<Resultado<{ estado: string }>> {
  if (!esUuid(token) || !esUuid(hallazgo) || (respuesta !== "autorizado" && respuesta !== "rechazado")) {
    return { ok: false, error: MENSAJE_MOTIVO.no_existe };
  }

  const r = await ejecutarPublico<Respuesta>("publico_responder_hallazgo", {
    p_token: token,
    p_hallazgo: hallazgo,
    p_respuesta: respuesta,
  });
  if (!r.ok) return r;
  if (!r.datos.ok) {
    revalidatePath(`/o/${token}`);
    return { ok: false, error: MENSAJE_MOTIVO[r.datos.motivo] ?? MENSAJE_MOTIVO.no_existe };
  }

  after(() => avisarRespuesta(token, hallazgo));
  revalidatePath(`/o/${token}`);
  return { ok: true, datos: { estado: r.datos.estado } };
}

type Envio = { ok: true; id: string; repetido: boolean } | { ok: false; motivo: string };

/**
 * El cliente le escribe al taller desde su enlace. La clave la generó su celular: si se reintenta (mala señal) no se
 * duplica. Después de guardarlo, avisa por push a quien atiende el vehículo, sin hacerlo esperar.
 */
export async function enviarMensaje(token: string, clave: string, texto: string): Promise<Resultado<{ id: string }>> {
  if (!esUuid(token) || !esUuid(clave)) return { ok: false, error: MOTIVO_MENSAJE.no_existe };
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: MOTIVO_MENSAJE.vacio };
  if (limpio.length > MAX_MENSAJE) return { ok: false, error: MOTIVO_MENSAJE.largo };

  const r = await ejecutarPublico<Envio>("publico_enviar_mensaje", { p_token: token, p_clave: clave, p_texto: limpio });
  if (!r.ok) return r;
  if (!r.datos.ok) {
    revalidatePath(`/o/${token}`);
    return { ok: false, error: MOTIVO_MENSAJE[r.datos.motivo] ?? MOTIVO_MENSAJE.no_existe };
  }

  const id = r.datos.id;
  if (!r.datos.repetido) after(() => avisarMensaje(token, id));
  revalidatePath(`/o/${token}`);
  return { ok: true, datos: { id } };
}
