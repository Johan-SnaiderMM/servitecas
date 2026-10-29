import Link from "@/components/ui/enlace";
import { salir } from "@/app/acciones/sesion";
import { Logo } from "@/components/layout/logo";
import { Button, botonVariantes } from "@/components/ui/button";
import { obtenerContexto } from "@/lib/datos/contexto";
import { obtenerUsuario } from "@/lib/sesion";
import { FormularioCodigo } from "./formulario-codigo";

export const metadata = { title: "Unirme al equipo" };

// Depende de la sesión (cookies): nunca se prerenderiza.
export const dynamic = "force-dynamic";

/**
 * Entrada del equipo con un código de invitación (migración 0005). El enlace de la invitación trae el código
 * (`/unirme?codigo=K7MP2XQ9`). Es pública: sirve justo a quien todavía no tiene cuenta, así que no pide permiso
 * de pantalla (igual que /entrar).
 */
export default async function Unirme({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const usuario = await obtenerUsuario().catch(() => null);
  const contexto = usuario ? await obtenerContexto().catch(() => null) : null;
  const dentro = contexto?.perfil && contexto.taller ? { perfil: contexto.perfil, taller: contexto.taller } : null;

  return (
    <div className="columna-app flex flex-col px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))]">
      <Logo />

      {dentro ? (
        <>
          <h1 className="mt-7 text-3xl font-semibold leading-tight tracking-tight">Ya estás dentro</h1>
          <p className="mt-3 text-base leading-snug text-tinta-2">
            Este celular es de <strong className="text-tinta">{dentro.perfil.nombre}</strong> en {dentro.taller.nombre}.
            Para unirte con otro código, primero sal.
          </p>
          <Link href="/inicio" className={`${botonVariantes({ tamano: "lg", bloque: true })} mt-6`}>
            Abrir la app
          </Link>
          <form action={salir} className="mt-3">
            <Button type="submit" variante="secundario" bloque>
              Salir
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-7 text-3xl font-semibold leading-tight tracking-tight">Unirme al equipo</h1>
          <p className="mt-3 text-base leading-snug text-tinta-2">
            Escribe el código que te mandaron del taller. No necesitas correo ni contraseña.
          </p>
          <div className="mt-6">
            <FormularioCodigo codigoInicial={codigo ?? ""} />
          </div>
          <p className="mt-6 text-center text-base text-tinta-2">
            ¿Eres el dueño?{" "}
            <Link href="/entrar" className="font-semibold text-tinta underline">
              Entra con tu correo
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
