import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { bd } from "@/lib/datos/bd";

export const obtenerUsuario = cache(async () => (await bd()).usuario());

/**
 * Sin sesión se va a /entrar. Se exige en la capa de datos (consultar/ejecutar), no solo en el layout: los
 * layouts no se vuelven a ejecutar al navegar y se renderizan en paralelo con la pantalla, así que no pueden
 * ser la única barrera. La barrera real es la base de datos (RLS); esto evita errores confusos y consultas anónimas.
 */
export async function exigirSesion() {
  const usuario = await obtenerUsuario();
  if (!usuario) redirect("/entrar");
  return usuario;
}
