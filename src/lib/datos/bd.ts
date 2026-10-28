import "server-only";
import { cache } from "react";
import { abrirBD } from "@/lib/supabase/servidor";

/** Una sola conexión por petición (React cache): la comparten el layout, la pantalla y sus acciones. */
export const bd = cache(abrirBD);
