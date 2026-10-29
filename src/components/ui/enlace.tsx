import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * El `Link` de Next. En la demo pública (DEMO_PUBLICA=1) no precarga: cada precarga es una petición al servidor, y al cargar
 * el patio salen unas quince a la vez. En un servidor sin estado (como Vercel) esa ráfaga levanta varias copias de la app,
 * cada una con su propia base en memoria, y el siguiente toque puede caer en una copia vacía. Fuera de la demo pública
 * no cambia nada. `NEXT_PUBLIC_SIN_PRECARGA` la fija next.config.ts a partir de DEMO_PUBLICA.
 */
const SIN_PRECARGA = process.env.NEXT_PUBLIC_SIN_PRECARGA === "1";

export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={props.prefetch ?? (SIN_PRECARGA ? false : undefined)} />;
}
