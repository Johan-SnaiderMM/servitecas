"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { enviarMensaje } from "@/app/acciones/publico";
import { Button } from "@/components/ui/button";
import { AreaTexto } from "@/components/ui/input";
import { MAX_MENSAJE } from "@/lib/mensajes";

/**
 * El cliente le escribe al taller desde su enlace. La clave del mensaje sale del servidor (y una nueva después de
 * cada envío): si la señal falla y vuelve a tocar Enviar, no queda repetido.
 */
export function EscribirMensaje({ token, clave: claveInicial }: { token: string; clave: string }) {
  const [texto, setTexto] = useState("");
  const [clave, setClave] = useState(claveInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const vacio = texto.trim().length === 0;

  function enviar() {
    if (vacio) return;
    setError(null);
    setEnviado(false);
    iniciar(async () => {
      try {
        const r = await enviarMensaje(token, clave, texto);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setTexto("");
        setClave(crypto.randomUUID());
        setEnviado(true);
      } catch {
        setError("No se pudo enviar. Revisa la señal e intenta otra vez.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor="mensaje" className="sr-only">
        Tu mensaje para el taller
      </label>
      <AreaTexto
        id="mensaje"
        value={texto}
        maxLength={MAX_MENSAJE}
        onChange={(e) => {
          setTexto(e.target.value);
          setEnviado(false);
        }}
        placeholder="Escribe aquí tu pregunta para el taller"
      />
      {texto.length > MAX_MENSAJE - 100 && (
        <p className="text-base text-tinta-2">
          {texto.length} de {MAX_MENSAJE} caracteres
        </p>
      )}
      <Button tamano="lg" bloque disabled={vacio || pendiente} onClick={enviar}>
        <Send className="size-5" aria-hidden />
        {pendiente ? "Enviando…" : "Enviar mensaje"}
      </Button>
      {enviado && <p className="text-base text-tinta-2">Enviado. La respuesta te llega aquí mismo.</p>}
      {error && (
        <p role="alert" className="text-base font-semibold text-rojo">
          {error}
        </p>
      )}
    </div>
  );
}
