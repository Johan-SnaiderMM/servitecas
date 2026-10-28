import "server-only";
import { redirect } from "next/navigation";
import { puedeVer, quienEs, type Pantalla } from "@/lib/areas";
import { obtenerContexto } from "@/lib/datos/contexto";

/**
 * Quién entra. Una sesión sin taller (la cuenta existe en Authentication pero no la dieron de alta con
 * `fn_crear_taller`, o la quitaron del equipo) va a /entrar, donde se le explica.
 */
export async function obtenerQuien() {
  const contexto = await obtenerContexto();
  const quien = quienEs(contexto);
  if (!quien || !contexto.taller) redirect("/entrar");
  return { contexto, taller: contexto.taller, quien };
}

/**
 * Quién entra y si puede ver esta pantalla. Cada página del personal lo revisa al empezar y, si no, muestra
 * <SinPermiso>. La base de datos igual rechaza lo que no le toca a cada quien: esto es para no mostrarle una pantalla
 * a medias (vacía o con botones que van a fallar).
 */
export async function revisarPermiso(pantalla: Pantalla) {
  const { contexto, taller, quien } = await obtenerQuien();
  return { contexto, taller, quien, permitido: puedeVer(quien, pantalla) };
}
