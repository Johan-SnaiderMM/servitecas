import Link from "@/components/ui/enlace";
import { SinPermiso } from "@/components/layout/sin-permiso";
import { obtenerResumen } from "@/lib/datos/resumen";
import { formatearPesos } from "@/lib/dinero";
import { hoyBogota } from "@/lib/fechas";
import { ETIQUETA_ESTADO } from "@/lib/ordenes";
import { revisarPermiso } from "@/lib/permisos";
import { ahoraMs } from "@/lib/reloj";
import {
  ETIQUETA_PERIODO,
  PERIODOS,
  esPeriodo,
  porcentajeAutorizado,
  rangoDe,
  textoDuracion,
  textoRango,
} from "@/lib/resumen";
import { cn } from "@/lib/utils";

export const metadata = { title: "Resumen" };

/**
 * Las cifras del taller en un periodo: cuánto se autorizó en trabajos adicionales (lo que la app le suma a la
 * serviteca), cuántos vehículos pasaron y cuánto tardan en cada estado.
 */
export default async function PaginaResumen({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { taller, permitido } = await revisarPermiso("resumen");
  if (!permitido) return <SinPermiso />;

  const { periodo: pedido } = await searchParams;
  const periodo = esPeriodo(pedido) ? pedido : "7";
  const hoy = hoyBogota(new Date(ahoraMs()));
  const { desde, hasta } = rangoDe(periodo, hoy);
  const r = await obtenerResumen(desde, hasta);
  const h = r.hallazgos;
  const respondidos = h.autorizados.n + h.rechazados.n;
  const porcentaje = porcentajeAutorizado(h.autorizados.n, h.rechazados.n);
  const vacio = h.enviados.n === 0 && r.ordenes.recibidas === 0 && r.ordenes.entregadas === 0;
  const maxMinutos = Math.max(1, ...r.tiempos.map((t) => t.minutos ?? 0));

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">{taller.nombre}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">Resumen</h1>
      <p className="mt-1 text-base text-tinta-2">{textoRango(desde, hasta, hoy)}</p>

      <nav aria-label="Periodo" className="mt-4 grid grid-cols-4 gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/resumen?periodo=${p}`}
            aria-current={p === periodo ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center justify-center rounded-xl border px-1 text-center text-base font-medium leading-tight",
              p === periodo ? "border-tinta bg-tinta text-papel" : "border-linea bg-superficie active:bg-hueso"
            )}
          >
            {ETIQUETA_PERIODO[p]}
          </Link>
        ))}
      </nav>

      {vacio ? (
        <p className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-hueso p-4 text-base text-tinta-2">
          Todavía no hay movimiento en este periodo. Aquí vas a ver cuánto autorizan tus clientes y cuánto tarda cada
          vehículo.
        </p>
      ) : (
        <>
          <section className="mt-5 rounded-xl border border-linea bg-superficie p-4">
            <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">Trabajos adicionales autorizados</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{formatearPesos(h.autorizados.valor)}</p>
            <p className="mt-1 text-base text-tinta-2">
              {respondidos === 0
                ? "Todavía nadie ha respondido."
                : `${h.autorizados.n} de ${respondidos} ${respondidos === 1 ? "respondido" : "respondidos"} (${porcentaje} %)`}
              {h.pendientes.n > 0 && ` · ${h.pendientes.n} esperando`}
            </p>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Hallazgos</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2">
              <Cifra etiqueta="Enviados" n={h.enviados.n} valor={h.enviados.valor} />
              <Cifra etiqueta="Autorizados" n={h.autorizados.n} valor={h.autorizados.valor} />
              <Cifra etiqueta="No autorizados" n={h.rechazados.n} valor={h.rechazados.valor} />
              <Cifra etiqueta="Esperando" n={h.pendientes.n} valor={h.pendientes.valor} />
            </dl>
            <ul className="mt-3 space-y-1 text-base text-tinta-2">
              {h.desde_enlace > 0 && (
                <li>
                  {h.desde_enlace === 1 ? "1 cliente respondió" : `${h.desde_enlace} clientes respondieron`} desde el enlace,
                  sin llamar.
                </li>
              )}
              {h.minutos_respuesta !== null && <li>Responden en promedio en {textoDuracion(h.minutos_respuesta)}.</li>}
              {h.sin_precio > 0 && (
                <li>
                  {h.sin_precio === 1 ? "1 hallazgo sin precio" : `${h.sin_precio} hallazgos sin precio`}: no suma al valor.
                </li>
              )}
            </ul>
          </section>

          {r.top.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Lo que más se autoriza</h2>
              <ol className="mt-2 divide-y divide-hueso rounded-xl border border-linea bg-superficie">
                {r.top.map((t) => (
                  <li key={t.titulo} className="px-4 py-3">
                    <p className="text-base font-medium leading-tight">{t.titulo}</p>
                    <p className="text-base text-tinta-2">
                      {t.autorizados === 1 ? "1 vez" : `${t.autorizados} veces`} · {formatearPesos(t.valor)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Vehículos</h2>
            {/* Una sola tarjeta de tres columnas: en 360 px tres cajas sueltas no alcanzan para "CANCELADOS". */}
            <dl className="mt-2 grid grid-cols-3 divide-x divide-hueso rounded-xl border border-linea bg-superficie">
              {(
                [
                  ["Recibidos", r.ordenes.recibidas],
                  ["Entregados", r.ordenes.entregadas],
                  ["Cancelados", r.ordenes.canceladas],
                ] as const
              ).map(([etiqueta, n]) => (
                <div key={etiqueta} className="flex flex-col-reverse items-center px-1 py-3 text-center">
                  <dt className="text-sm font-medium uppercase text-tinta-2">{etiqueta}</dt>
                  <dd className="text-2xl font-semibold">{n}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 space-y-1 text-base text-tinta-2">
              {r.ordenes.minutos_entrega !== null && (
                <li>De recibido a entregado: {textoDuracion(r.ordenes.minutos_entrega)} en promedio.</li>
              )}
              {r.ordenes.mensajes_clientes > 0 && (
                <li>
                  {r.ordenes.mensajes_clientes === 1
                    ? "1 mensaje de clientes"
                    : `${r.ordenes.mensajes_clientes} mensajes de clientes`}{" "}
                  desde el enlace.
                </li>
              )}
            </ul>
          </section>

          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-wider text-tinta-2">Tiempo promedio en cada estado</h2>
            <ul className="mt-2 space-y-3 rounded-xl border border-linea bg-superficie p-4">
              {r.tiempos.map((t) => (
                <li key={t.estado}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium">{ETIQUETA_ESTADO[t.estado]}</span>
                    <span className={cn("text-base", t.minutos === null ? "text-tinta-2" : "font-semibold")}>
                      {t.minutos === null ? "Sin datos" : textoDuracion(t.minutos)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-hueso" aria-hidden>
                    {t.minutos !== null && (
                      <div className="h-full rounded-full bg-oro" style={{ width: `${Math.max(2, (t.minutos * 100) / maxMinutos)}%` }} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-base text-tinta-2">De los vehículos recibidos en el periodo, con el tramo ya terminado.</p>
          </section>
        </>
      )}
    </main>
  );
}

function Cifra({ etiqueta, n, valor }: { etiqueta: string; n: number; valor: number }) {
  return (
    <div className="rounded-xl border border-linea bg-superficie px-3 py-2.5">
      <dt className="text-sm font-medium uppercase tracking-wider text-tinta-2">{etiqueta}</dt>
      <dd className="mt-0.5 text-2xl font-semibold">{n}</dd>
      <dd className="text-base text-tinta-2">{formatearPesos(valor)}</dd>
    </div>
  );
}
