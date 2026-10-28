"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { buscarVehiculo, recibirVehiculo } from "@/app/acciones/ordenes";
import { BarraAccion } from "@/components/layout/barra-accion";
import { Button } from "@/components/ui/button";
import { Input, Selector } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoForm } from "@/lib/errores";
import { ETIQUETA_ESTADO, primerNombre } from "@/lib/ordenes";
import { normalizarPlaca } from "@/lib/placa";
import { formatearTelefono } from "@/lib/telefono";
import type { JefePatio, VehiculoConocido } from "@/lib/tipos/ordenes";
import { cn } from "@/lib/utils";

/** Atajos para escribir el servicio con un toque (se pueden combinar y editar). */
const SERVICIOS_COMUNES = ["Alineación", "Balanceo", "Llantas", "Cambio de aceite", "Frenos", "Suspensión", "Revisión general"];

/**
 * Recibir un vehículo en menos de 30 segundos: placa, celular y servicio. Si la placa ya se conoce, trae al cliente
 * (solo llena lo que no se ha escrito). Todos los campos son controlados: tras un error no se pierde nada.
 */
export function FormularioRecibir({ clave, jefes }: { clave: string; jefes: JefePatio[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoForm, FormData>(recibirVehiculo, { error: null });
  const [placa, setPlaca] = useState("");
  const [celular, setCelular] = useState("");
  const [nombre, setNombre] = useState("");
  const [servicio, setServicio] = useState("");
  const [kilometraje, setKilometraje] = useState("");
  const [asignado, setAsignado] = useState(jefes.find((j) => j.yo)?.user_id ?? "");
  const [conocido, setConocido] = useState<VehiculoConocido | null>(null);
  const [, iniciarBusqueda] = useTransition();
  const ultimaBuscada = useRef("");

  const placaOk = normalizarPlaca(placa).ok;
  const abierta = conocido?.existe ? conocido.orden_abierta : null;

  function cambiarPlaca(texto: string) {
    const limpia = texto.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
    setPlaca(limpia);
    const r = normalizarPlaca(limpia);
    if (!r.ok) {
      ultimaBuscada.current = "";
      setConocido(null);
      return;
    }
    if (ultimaBuscada.current === r.valor) return;
    ultimaBuscada.current = r.valor;
    iniciarBusqueda(async () => {
      const v = await buscarVehiculo(r.valor);
      if (ultimaBuscada.current !== r.valor) return; // ya se escribió otra placa
      setConocido(v);
      if (v?.existe) {
        // Solo se llena lo que todavía está vacío: no se pisa lo que la persona escribió.
        setCelular((actual) => (actual.trim() ? actual : formatearTelefono(v.cliente.celular)));
        setNombre((actual) => (actual.trim() ? actual : (v.cliente.nombre ?? "")));
      }
    });
  }

  function alternarServicio(s: string) {
    const partes = servicio
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const ya = partes.some((p) => p.toLowerCase() === s.toLowerCase());
    const nuevas = ya ? partes.filter((p) => p.toLowerCase() !== s.toLowerCase()) : [...partes, s];
    setServicio(nuevas.join(", ").slice(0, 120));
  }

  const marcado = (s: string) =>
    servicio
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .includes(s.toLowerCase());

  return (
    <form action={accion} className="space-y-5 px-4 pb-6 pt-5">
      <input type="hidden" name="clave" value={clave} />

      <div>
        <Label htmlFor="placa">Placa</Label>
        <Input
          id="placa"
          name="placa"
          value={placa}
          onChange={(e) => cambiarPlaca(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABC123"
          className="text-center text-2xl font-semibold uppercase tracking-widest"
          required
        />
        {conocido?.existe && !abierta && (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-linea bg-white p-3 text-base">
            <History className="mt-0.5 size-5 shrink-0 text-tinta-2" aria-hidden />
            <span>
              {/* Un vehículo cargado desde un archivo todavía no ha venido. */}
              {conocido.visitas === 0
                ? "Ya está registrado"
                : `Ya vino ${conocido.visitas === 1 ? "1 vez" : `${conocido.visitas} veces`}`}
              {conocido.cliente.nombre ? ` · ${primerNombre(conocido.cliente.nombre)}` : ""}. Revisa que el celular
              siga siendo el mismo.
            </span>
          </p>
        )}
        {abierta && (
          <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 text-base">
            <p>
              Este vehículo ya está en el patio: orden #{abierta.numero}, {ETIQUETA_ESTADO[abierta.estado].toLowerCase()}.
            </p>
            <Link href={`/ordenes/${abierta.id}`} className="mt-1 inline-block font-semibold underline underline-offset-4">
              Ver esa orden
            </Link>
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="celular">Celular del cliente</Label>
        <Input
          id="celular"
          name="celular"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={celular}
          onChange={(e) => setCelular(e.target.value)}
          placeholder="300 123 4567"
          required
        />
        <p className="mt-1 text-base text-tinta-2">Por WhatsApp le llega el enlace para ver cómo va.</p>
      </div>

      <div>
        <Label htmlFor="nombre">Nombre del cliente (opcional)</Label>
        <Input
          id="nombre"
          name="nombre"
          value={nombre}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Juan"
        />
      </div>

      <div>
        <Label htmlFor="servicio">Servicio</Label>
        <ul className="mb-2 flex flex-wrap gap-2">
          {SERVICIOS_COMUNES.map((s) => (
            <li key={s}>
              <button
                type="button"
                aria-pressed={marcado(s)}
                onClick={() => alternarServicio(s)}
                className={cn(
                  "min-h-12 rounded-full border px-4 text-base font-medium",
                  marcado(s) ? "border-tinta bg-tinta text-white" : "border-linea bg-white text-tinta active:bg-hueso"
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
        <Input
          id="servicio"
          name="servicio"
          value={servicio}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setServicio(e.target.value)}
          placeholder="O escríbelo: cambio de pastillas…"
          required
        />
      </div>

      {jefes.length > 0 && (
        <div>
          <Label htmlFor="asignado">Quién lo atiende</Label>
          <Selector id="asignado" name="asignado" value={asignado} onChange={(e) => setAsignado(e.target.value)}>
            <option value="">Sin asignar por ahora</option>
            {jefes.map((j) => (
              <option key={j.user_id} value={j.user_id}>
                {j.yo ? `Yo (${primerNombre(j.nombre)})` : j.nombre}
                {j.abiertas > 0 ? ` · ${j.abiertas} en el patio` : ""}
              </option>
            ))}
          </Selector>
        </div>
      )}

      <div>
        <Label htmlFor="kilometraje">Kilometraje (opcional)</Label>
        <Input
          id="kilometraje"
          name="kilometraje"
          inputMode="numeric"
          autoComplete="off"
          value={kilometraje}
          onChange={(e) => setKilometraje(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
          placeholder="45.200"
        />
      </div>

      <BarraAccion>
        {estado.error && (
          <p role="alert" className="text-center text-base font-semibold text-rojo">
            {estado.error}
          </p>
        )}
        <Button
          type="submit"
          tamano="lg"
          bloque
          disabled={pendiente || !placaOk || celular.trim() === "" || servicio.trim() === "" || Boolean(abierta)}
        >
          {pendiente ? "Recibiendo…" : "Recibir vehículo"}
        </Button>
      </BarraAccion>
    </form>
  );
}
