/**
 * Tema claro u oscuro. «auto» (lo que hay si nadie eligió) sigue el modo del celular con `prefers-color-scheme`, solo en
 * CSS; elegir «claro» u «oscuro» pone `data-tema` en <html> y se recuerda en este celular. Los colores viven en
 * `globals.css`. Módulo sin dependencias de React: lo usan el selector y el script que corre antes de pintar.
 */
import { COLOR_TEMA, COLOR_TEMA_OSCURO } from "@/lib/marca";

export type Tema = "auto" | "claro" | "oscuro";

const CLAVE = "tema";
const oyentes = new Set<() => void>();

/** El tema elegido en este celular, o «auto» si nadie eligió (o si el navegador no deja guardar). */
export function leerTema(): Tema {
  try {
    const t = window.localStorage.getItem(CLAVE);
    return t === "claro" || t === "oscuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

export function suscribirTema(aviso: () => void): () => void {
  oyentes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    oyentes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

/** Pinta el tema ya y lo recuerda; con «auto» deja que mande el modo del celular. */
export function aplicarTema(tema: Tema): void {
  try {
    if (tema === "auto") window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento (modo privado): el cambio vale hasta recargar.
  }
  const raiz = document.documentElement;
  if (tema === "auto") delete raiz.dataset.tema;
  else raiz.dataset.tema = tema;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const oscuro = tema === "oscuro" || (tema === "auto" && (meta.getAttribute("media") ?? "").includes("dark"));
    meta.setAttribute("content", oscuro ? COLOR_TEMA_OSCURO : COLOR_TEMA);
  }
  oyentes.forEach((aviso) => aviso());
}

/**
 * Corre en <head>, antes de pintar: si la persona eligió un tema, lo pone enseguida para que no se vea un destello del
 * otro. Sin elección no hace nada (CSS ya sigue al celular). Texto plano: se escribe tal cual en la página.
 */
export const SCRIPT_TEMA = `(function(){function f(){try{var t=localStorage.getItem("${CLAVE}");if(t!=="claro"&&t!=="oscuro")return;document.documentElement.dataset.tema=t;var c=t==="oscuro"?"${COLOR_TEMA_OSCURO}":"${COLOR_TEMA}";var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c);}catch(e){}}f();document.addEventListener("DOMContentLoaded",f);})();`;
