import "server-only";
import webpush from "web-push";
import { armarAviso, armarAvisoMensaje, type AvisoPush, type DatosAviso, type DatosAvisoMensaje } from "@/lib/avisos-push";
import { consultarPublico } from "@/lib/datos/llamar";

type Suscripcion = { endpoint: string; p256dh: string; auth: string };
type RespuestaAviso<D> = { ok: false } | { ok: true; aviso: D; suscripciones: Suscripcion[] };

/**
 * Llaves VAPID del servidor (se generan una vez con `npm run vapid`). Sin las tres, los avisos push no se mandan y
 * la app funciona igual.
 */
export function llavesVapid(): { publica: string; privada: string; asunto: string } | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const asunto = process.env.VAPID_SUBJECT?.trim();
  return publica && privada && asunto ? { publica, privada, asunto } : null;
}

/**
 * Avisa a quien atiende el vehículo que el cliente respondió un hallazgo. Se llama DESPUÉS de responderle al cliente
 * (con `after`): nunca debe hacerlo esperar ni fallar.
 */
export async function avisarRespuesta(token: string, hallazgo: string): Promise<void> {
  await tomarYAvisar<DatosAviso>("publico_tomar_aviso", { p_token: token, p_hallazgo: hallazgo }, armarAviso);
}

/** Avisa a quien atiende el vehículo que el cliente escribió un mensaje desde su enlace. Igual: nunca falla. */
export async function avisarMensaje(token: string, mensaje: string): Promise<void> {
  await tomarYAvisar<DatosAvisoMensaje>("publico_tomar_aviso_mensaje", { p_token: token, p_mensaje: mensaje }, armarAvisoMensaje);
}

/** Toma de la base el aviso y sus suscripciones, y lo manda. Todo error se registra y se traga. */
async function tomarYAvisar<D>(funcion: string, args: Record<string, unknown>, armar: (d: D) => AvisoPush): Promise<void> {
  const llaves = llavesVapid();
  if (!llaves) return;

  try {
    // La base entrega las suscripciones una sola vez por aviso y solo en los 10 minutos siguientes.
    const r = await consultarPublico<RespuestaAviso<D>>(funcion, args);
    if (!r.ok || r.suscripciones.length === 0) return;

    webpush.setVapidDetails(llaves.asunto, llaves.publica, llaves.privada);
    const mensaje = JSON.stringify(armar(r.aviso));

    const resultados = await Promise.allSettled(
      r.suscripciones.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, mensaje, { TTL: 3600 })
      )
    );

    // Un celular que ya no existe (404 o 410) se olvida para no insistirle.
    await Promise.allSettled(
      resultados.flatMap((res, i) => {
        if (res.status !== "rejected") return [];
        const codigo = (res.reason as { statusCode?: number })?.statusCode;
        if (codigo !== 404 && codigo !== 410) {
          console.error(`[push] no se pudo avisar (${codigo ?? "sin código"})`);
          return [];
        }
        return [consultarPublico("publico_olvidar_suscripcion_push", { p_endpoint: r.suscripciones[i].endpoint })];
      })
    );
  } catch (e) {
    console.error("[push] falló el aviso:", e instanceof Error ? e.message : e);
  }
}
