"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { useOrigen } from "@/lib/use-origen";
import { Button, botonVariantes } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enlaceWhatsappA, mensajeSeguimiento } from "@/lib/whatsapp";

/**
 * El enlace de seguimiento para el cliente: un toque abre el WhatsApp de quien atiende con el mensaje ya escrito y el
 * chat del cliente abierto; solo falta pulsar enviar. También se puede copiar o ver como lo ve el cliente.
 */
export function EnviarEnlace({
  token,
  celular,
  cliente,
  taller,
  placa,
  destacado = false,
}: {
  token: string;
  celular: string;
  cliente: string | null;
  taller: string;
  placa: string;
  /** Recién recibido: el botón va primero y grande. */
  destacado?: boolean;
}) {
  const origen = useOrigen();
  const [copiado, setCopiado] = useState(false);
  const enlace = `${origen}/o/${token}`;
  const whatsapp = enlaceWhatsappA(celular, mensajeSeguimiento({ cliente, taller, placa, enlace }));

  return (
    <div className="space-y-2">
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={botonVariantes({ variante: destacado ? "primario" : "secundario", tamano: "lg", bloque: true })}
        >
          <MessageCircle className="size-5" aria-hidden />
          Enviar el enlace por WhatsApp
        </a>
      )}
      <div className="flex gap-2">
        <Button
          variante="secundario"
          className="flex-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(enlace);
              setCopiado(true);
            } catch {
              setCopiado(false);
            }
          }}
        >
          {copiado ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
        <a
          href={`/o/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(botonVariantes({ variante: "secundario" }), "flex-1")}
        >
          <ExternalLink className="size-5" aria-hidden />
          Ver enlace
        </a>
      </div>
    </div>
  );
}
