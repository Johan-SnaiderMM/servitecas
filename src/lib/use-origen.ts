"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * El origen de la app (`https://…`), para armar enlaces que se mandan por WhatsApp. Solo existe en el navegador: se lee
 * sin efectos ni desajustes de hidratación (en el servidor es "").
 */
export function useOrigen(): string {
  return useSyncExternalStore(
    sinSuscripcion,
    () => window.location.origin,
    () => ""
  );
}
