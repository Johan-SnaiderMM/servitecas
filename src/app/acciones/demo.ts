"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ejecutar } from "@/lib/datos/llamar";
import type { EstadoForm } from "@/lib/errores";
import { textoPinRechazado, type RespuestaReinicio } from "@/lib/tipos/demo";

/**
 * Reinicia la demo: borra lo que se hizo en la visita y vuelven los datos de ejemplo. La base solo lo permite al
 * gerente de un taller de demostración y, si la demo tiene PIN, lo comprueba ella (esta pantalla solo lo manda).
 */
export async function reiniciarDemo(_anterior: EstadoForm, formulario: FormData): Promise<EstadoForm> {
  const pin = formulario.get("pin")?.toString().trim() ?? "";
  if (pin !== "" && !/^[0-9]{4,8}$/.test(pin)) return { error: "El PIN tiene entre 4 y 8 números." };

  const r = await ejecutar<RespuestaReinicio>("reiniciar_demo", { p_pin: pin === "" ? null : pin });
  if (!r.ok) return { error: r.error };
  if (!r.datos.ok) return { error: textoPinRechazado(r.datos) };

  revalidatePath("/", "layout");
  redirect("/inicio");
}
