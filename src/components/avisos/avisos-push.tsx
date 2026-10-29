"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { guardarSuscripcionPush, quitarSuscripcionPush } from "@/app/acciones/push";
import { Button } from "@/components/ui/button";
import { llaveVapidABytes } from "@/lib/avisos-push";

type Estado = "revisando" | "no_soportado" | "sin_llaves" | "bloqueado" | "apagado" | "encendido";

/**
 * Activar o apagar en ESTE celular los avisos de cuando un cliente autoriza o rechaza un hallazgo o escribe un mensaje (Web Push). `llavePublica` es la llave
 * pública VAPID del servidor; sin ella el servidor no manda avisos y aquí se explica. Nunca se pide permiso solo:
 * lo pide el botón.
 */
export function AvisosPush({ llavePublica }: { llavePublica: string | null }) {
  const [estado, setEstado] = useState<Estado>("revisando");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    async function revisar() {
      if (!llavePublica) return vivo && setEstado("sin_llaves");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return vivo && setEstado("no_soportado");
      }
      if (Notification.permission === "denied") return vivo && setEstado("bloqueado");
      const registro = await navigator.serviceWorker.getRegistration("/sw.js");
      const suscripcion = await registro?.pushManager.getSubscription();
      if (vivo) setEstado(suscripcion ? "encendido" : "apagado");
    }
    void revisar();
    return () => {
      vivo = false;
    };
  }, [llavePublica]);

  function encender() {
    if (!llavePublica) return;
    setError(null);
    iniciar(async () => {
      try {
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") {
          setEstado(permiso === "denied" ? "bloqueado" : "apagado");
          return;
        }
        const registro = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const suscripcion =
          (await registro.pushManager.getSubscription()) ??
          (await registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: llaveVapidABytes(llavePublica),
          }));
        const r = await guardarSuscripcionPush(suscripcion.toJSON());
        if (r.error) {
          await suscripcion.unsubscribe();
          setError(r.error);
          return;
        }
        setEstado("encendido");
      } catch {
        setError("No se pudieron activar los avisos en este celular.");
      }
    });
  }

  function apagar() {
    setError(null);
    iniciar(async () => {
      try {
        const registro = await navigator.serviceWorker.getRegistration("/sw.js");
        const suscripcion = await registro?.pushManager.getSubscription();
        if (suscripcion) {
          await quitarSuscripcionPush(suscripcion.endpoint);
          await suscripcion.unsubscribe();
        }
        setEstado("apagado");
      } catch {
        setError("No se pudieron apagar los avisos.");
      }
    });
  }

  const texto: Record<Estado, string> = {
    revisando: "Revisando…",
    no_soportado: "Este celular o navegador no permite avisos. En iPhone, instala primero la app en la pantalla de inicio.",
    sin_llaves: "Los avisos todavía no están configurados en el servidor.",
    bloqueado: "Bloqueaste los avisos para esta app. Actívalos en los ajustes del navegador.",
    apagado: "Te avisamos cuando un cliente autorice o rechace un trabajo, o te escriba.",
    encendido: "Este celular recibe los avisos de las respuestas y los mensajes de los clientes.",
  };

  // El botón solo tiene sentido cuando se puede activar o apagar; en los demás estados el texto ya lo explica.
  const mostrarBoton = estado === "apagado" || estado === "encendido";

  return (
    <section className="rounded-xl border border-linea bg-superficie p-4">
      <div className="flex items-start gap-3">
        {estado === "encendido" ? (
          <Bell className="mt-0.5 size-6 shrink-0" aria-hidden />
        ) : (
          <BellOff className="mt-0.5 size-6 shrink-0 text-tinta-2" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-base font-medium leading-tight">Avisos de los clientes</p>
          <p className="mt-0.5 text-base text-tinta-2">{texto[estado]}</p>
        </div>
      </div>
      {mostrarBoton && (
        <Button
          variante={estado === "encendido" ? "secundario" : "primario"}
          bloque
          className="mt-3"
          disabled={pendiente}
          onClick={estado === "encendido" ? apagar : encender}
        >
          {pendiente ? "Un momento…" : estado === "encendido" ? "Apagar los avisos" : "Activar los avisos"}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base font-semibold text-rojo">
          {error}
        </p>
      )}
    </section>
  );
}
