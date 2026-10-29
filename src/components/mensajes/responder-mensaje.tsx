"use client";

import { useEffect, useState, useTransition } from "react";
import { MessageCircle, Send } from "lucide-react";
import { useOrigen } from "@/lib/use-origen";
import { enviarMensajeOrden, marcarMensajesLeidos } from "@/app/acciones/mensajes";
import { Button } from "@/components/ui/button";
import { AreaTexto } from "@/components/ui/input";
import { MAX_MENSAJE, mensajeRespuesta } from "@/lib/mensajes";
import { enlaceWhatsappA } from "@/lib/whatsapp";

/**
 * El taller le responde al cliente en su enlace. Como la app no manda mensajes sola, después ofrece avisarle por
 * WhatsApp con el enlace ya escrito. La clave sale del servidor (y una nueva tras cada envío): un reintento no duplica.
 */
export function ResponderMensaje({
  ordenId,
  clave: claveInicial,
  token,
  celular,
  cliente,
  placa,
}: {
  ordenId: string;
  clave: string;
  token: string;
  celular: string;
  cliente: string | null;
  placa: string;
}) {
  const origen = useOrigen();
  const [texto, setTexto] = useState("");
  const [clave, setClave] = useState(claveInicial);
  const [error, setError] = useState<string | null>(null);
  const [respondido, setRespondido] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const vacio = texto.trim().length === 0;
  const whatsapp = enlaceWhatsappA(celular, mensajeRespuesta({ cliente, placa, enlace: `${origen}/o/${token}#mensajes` }));

  function enviar() {
    if (vacio) return;
    setError(null);
    iniciar(async () => {
      try {
        const r = await enviarMensajeOrden(clave, ordenId, texto);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setTexto("");
        setClave(crypto.randomUUID());
        setRespondido(true);
      } catch {
        setError("No se pudo enviar. Revisa la señal e intenta otra vez.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="respuesta" className="sr-only">
        Mensaje para el cliente
      </label>
      <AreaTexto
        id="respuesta"
        value={texto}
        maxLength={MAX_MENSAJE}
        onChange={(e) => {
          setTexto(e.target.value);
          setRespondido(false);
        }}
        placeholder="Escríbele al cliente: lo lee en su enlace"
      />
      <Button bloque variante="secundario" disabled={vacio || pendiente} onClick={enviar}>
        <Send className="size-5" aria-hidden />
        {pendiente ? "Enviando…" : "Enviar al enlace del cliente"}
      </Button>
      {error && (
        <p role="alert" className="text-base font-semibold text-rojo">
          {error}
        </p>
      )}
      {respondido && (
        <div className="space-y-2 rounded-xl border border-oro bg-superficie p-3">
          <p className="text-base">Listo, ya está en su enlace. Avísale por WhatsApp para que lo lea:</p>
          {whatsapp ? (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-tinta bg-tinta px-4 text-base font-medium text-papel active:bg-zinc-700"
            >
              <MessageCircle className="size-5" aria-hidden />
              Avisarle por WhatsApp
            </a>
          ) : (
            <p className="text-base text-tinta-2">Este cliente no tiene un celular válido para WhatsApp.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Al abrir la orden, lo que escribió el cliente queda visto (él ve «Visto» en su enlace). No refresca esta pantalla:
 * los mensajes siguen marcados «Nuevo» mientras se leen.
 */
export function MarcarLeidos({ ordenId, hay }: { ordenId: string; hay: boolean }) {
  useEffect(() => {
    if (hay) void marcarMensajesLeidos(ordenId).catch(() => {});
  }, [ordenId, hay]);
  return null;
}
