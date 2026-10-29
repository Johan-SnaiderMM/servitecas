/** Utilidades de texto para buscar. Módulo puro: lo usan componentes `"use client"`. */

/** Sin tildes ni mayúsculas, para que «pastillas» encuentre «Pastillas de freno» y «electrico», «Eléctrico». */
export function textoPlano(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
