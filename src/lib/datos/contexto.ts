import "server-only";
import { cache } from "react";
import type { Contexto } from "@/lib/contexto";
import { consultar } from "./llamar";

/** El taller y el perfil (con áreas y roles) de quien entra. Una consulta por petición. */
export const obtenerContexto = cache(() => consultar<Contexto>("obtener_contexto"));
