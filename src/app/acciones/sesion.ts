"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";
import { mensajeDeError } from "@/lib/errores";
import { esquemaEntrar } from "@/lib/esquemas/sesion";
import { demoDisponible } from "@/lib/demo";
import { codigoValido, normalizarCodigo } from "@/lib/invitaciones";
import type { QuienDemo } from "@/lib/supabase/servidor";

export type EstadoEntrada = { error: string | null };

/**
 * Unirse al equipo con un código de invitación (migración 0005). Si el celular no tiene sesión se le abre una
 * anónima (sin correo ni contraseña) y con ella se canjea el código: desde ahí ese celular es de esa persona, con
 * sus roles. Si el código no sirve, el mensaje de la base (en español) se muestra tal cual.
 */
export async function unirmeAlEquipo(_anterior: EstadoEntrada, formulario: FormData): Promise<EstadoEntrada> {
  const codigo = normalizarCodigo(formulario.get("codigo")?.toString() ?? "");
  if (!codigoValido(codigo)) return { error: "El código tiene 8 letras y números, como K7MP-2XQ9. Revísalo." };

  let base;
  try {
    base = await bd();
  } catch (e) {
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    return { error: "La app todavía no está configurada." };
  }
  if (!(await base.usuario())) {
    const { error } = await base.entrarAnonimo();
    if (error) return { error };
  }
  // Con la MISMA conexión: la sesión recién abierta todavía no llegó al navegador.
  const { error } = await base.rpc("canjear_invitacion", { p_codigo: codigo });
  if (error) {
    console.error(`[bd] canjear_invitacion falló (${error.codigo}): ${error.mensaje}`);
    return { error: mensajeDeError(error) };
  }
  revalidatePath("/", "layout");
  redirect("/inicio");
}

/**
 * El dueño de un taller entra con su correo y su contraseña. Su cuenta la crea quien administra, en Supabase, y le
 * da de alta el taller con `fn_crear_taller` (migración 0004).
 */
export async function entrarConClave(_anterior: EstadoEntrada, formulario: FormData): Promise<EstadoEntrada> {
  const parsed = esquemaEntrar.safeParse({
    correo: formulario.get("correo")?.toString() ?? "",
    clave: formulario.get("clave")?.toString() ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa el correo y la contraseña." };

  let base;
  try {
    base = await bd();
  } catch (e) {
    // Lo más común: se publicó sin configurar Supabase. El detalle va al registro del servidor, no a la pantalla.
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    return { error: "La app todavía no está configurada." };
  }
  const { error } = await base.entrarConClave(parsed.data.correo, parsed.data.clave);
  if (error) return { error };
  revalidatePath("/", "layout");
  redirect("/inicio");
}

/**
 * «Probar la demo»: entra al taller de demostración como gerente o como jefe de patio, sin pedir datos (las cuentas
 * viven en variables del servidor). Los datos son inventados y el gerente los reinicia desde «Más». Se usa con
 * `entrarDemo.bind(null, quien)`.
 */
export async function entrarDemo(quien: QuienDemo, _anterior: EstadoEntrada): Promise<EstadoEntrada> {
  if (quien !== "gerente" && quien !== "jefe") return { error: "La demo no está disponible en este momento." };
  if (!demoDisponible(quien)) return { error: "La demo todavía no está configurada. Avisa a quien te la compartió." };

  let base;
  try {
    base = await bd();
  } catch (e) {
    console.error("[sesion] no se pudo abrir la base de datos:", e instanceof Error ? e.message : e);
    return { error: "La app todavía no está configurada." };
  }
  // Si este celular ya tenía otra sesión (otra cuenta), se cierra antes.
  if (await base.usuario()) await base.salir();
  const { error } = await base.entrarDemo(quien);
  if (error) return { error };
  revalidatePath("/", "layout");
  redirect("/inicio");
}

/** Salir: cierra la sesión de este celular y vuelve a /entrar. */
export async function salir(): Promise<void> {
  await (await bd()).salir();
  revalidatePath("/", "layout");
  redirect("/entrar");
}
