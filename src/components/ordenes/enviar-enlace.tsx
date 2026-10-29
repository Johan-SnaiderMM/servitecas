"use client";

import { MessageCircle } from "lucide-react";
import { useOrigen } from "@/lib/use-origen";
import { botonVariantes } from "@/components/ui/button";
import { enlaceWhatsappA, mensajeSeguimiento } from "@/lib/whatsapp";

/**
 * El enlace de seguimiento para el cliente: un toque abre el WhatsApp de quien atiende con el mensaje ya escrito y el
 * chat del cliente abierto; solo falta pulsar enviar. Verlo como el cliente o copiarlo está en «Más».
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
  /** Recién recibido: el botón va grande y oscuro. */
  destacado?: boolean;
}) {
  const origen = useOrigen();
  const whatsapp = enlaceWhatsappA(celular, mensajeSeguimiento({ cliente, taller, placa, enlace: `${origen}/o/${token}` }));

  if (!whatsapp) {
    return <p className="text-base text-tinta-2">Este celular no sirve para WhatsApp: copia el enlace desde «Más».</p>;
  }
  return (
    <a
      href={whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      className={botonVariantes({ variante: destacado ? "primario" : "secundario", tamano: destacado ? "lg" : "md", bloque: true })}
    >
      <MessageCircle className="size-5" aria-hidden />
      Enviar el enlace por WhatsApp
    </a>
  );
}
