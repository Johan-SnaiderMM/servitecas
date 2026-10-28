import Link from "next/link";
import { salir } from "@/app/acciones/sesion";
import { Logo } from "@/components/layout/logo";
import { Button, botonVariantes } from "@/components/ui/button";
import { obtenerContexto } from "@/lib/datos/contexto";
import { demoDisponible } from "@/lib/demo";
import { obtenerUsuario } from "@/lib/sesion";
import { BotonDemo } from "./boton-demo";
import { FormularioClave } from "./formulario-clave";

export const metadata = { title: "Entrar a mi taller" };

// Depende de la sesión (cookies): nunca se prerenderiza. Sin esto, un build sin Supabase la congelaría con el formulario.
export const dynamic = "force-dynamic";

/**
 * Entrada del dueño con su correo y su contraseña (el equipo entra con un código en /unirme). La cuenta la crea
 * quien instala la app. Esta página NO pide permiso de pantalla: es justo a donde se manda a quien no tiene sesión
 * o taller.
 */
export default async function Entrar() {
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
            Para entrar con otra cuenta, primero sal.
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
      ) : usuario ? (
        <>
          <h1 className="mt-7 text-3xl font-semibold leading-tight tracking-tight">Falta tu taller</h1>
          <p className="mt-3 text-base leading-snug text-tinta-2">
            Tu cuenta existe, pero todavía no tiene un taller asignado. Pídele a quien te instaló la app que lo dé de alta,
            o usa el código de invitación que te mandaron.
          </p>
          <Link href="/unirme" className={`${botonVariantes({ tamano: "lg", bloque: true })} mt-6`}>
            Tengo un código de invitación
          </Link>
          <form action={salir} className="mt-3">
            <Button type="submit" variante="secundario" bloque>
              Salir
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-7 text-3xl font-semibold leading-tight tracking-tight">Entrar a mi taller</h1>
          <p className="mt-3 text-base leading-snug text-tinta-2">
            Con el correo y la contraseña que te dieron al instalar la app.
          </p>
          <div className="mt-6">
            <FormularioClave />
          </div>
          <p className="mt-6 text-center text-base text-tinta-2">
            ¿Olvidaste la contraseña? Pídele una nueva a quien te instaló la app.
          </p>
          <div className="mt-8 border-t border-hueso pt-6">
            <p className="text-center text-base text-tinta-2">¿Eres jefe de patio o de recepción? Te mandan un código.</p>
            <Link
              href="/unirme"
              className={`${botonVariantes({ variante: "secundario", tamano: "lg", bloque: true })} mt-3`}
            >
              Tengo un código de invitación
            </Link>
          </div>
          {(demoDisponible("gerente") || demoDisponible("jefe")) && (
            <div className="mt-8 border-t border-hueso pt-6">
              <p className="text-center text-base font-medium">¿Quieres ver cómo funciona?</p>
              <p className="mt-1 text-center text-base text-tinta-2">
                Entra a un taller de demostración con datos inventados. No pide nada.
              </p>
              <div className="mt-3 space-y-3">
                {demoDisponible("gerente") && <BotonDemo quien="gerente">Probar como gerente</BotonDemo>}
                {demoDisponible("jefe") && <BotonDemo quien="jefe">Probar como jefe de patio</BotonDemo>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
