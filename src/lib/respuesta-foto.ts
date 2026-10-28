import "server-only";

/** Una respuesta vacía que no se guarda en ninguna caché. */
export function sinCuerpo(status: number): Response {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * La foto como respuesta. `private`: solo el navegador de quien la pidió la guarda, y solo 10 minutos (una foto quitada
 * deja de verse pronto), nunca una caché compartida; sin "referer" hacia afuera y sin adivinar el tipo.
 */
export function respuestaFoto(archivo: { datos: Uint8Array }): Response {
  return new Response(new Blob([archivo.datos.slice().buffer], { type: "image/jpeg" }), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
