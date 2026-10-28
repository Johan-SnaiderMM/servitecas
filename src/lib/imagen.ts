/**
 * Achicar una foto antes de subirla. El celular saca fotos de varios MB; una acción del servidor acepta 1 MB en total
 * y a una foto del vehículo le basta con verse nítida a 1280 px. Corre en el navegador (usa canvas); lo puro
 * (`escalarA`) se prueba aparte.
 */

/** Las medidas de una imagen reducida para que su lado más largo no pase de `ladoMax` (sin agrandar nunca). */
export function escalarA(ancho: number, alto: number, ladoMax: number): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMax) return { ancho, alto };
  const factor = ladoMax / mayor;
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)) };
}

type Origen = { fuente: CanvasImageSource; ancho: number; alto: number; liberar: () => void };

/** Abre la foto respetando cómo se tomó el celular (de lado, de cabeza). */
async function abrir(archivo: File): Promise<Origen> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
      return { fuente: bitmap, ancho: bitmap.width, alto: bitmap.height, liberar: () => bitmap.close() };
    } catch {
      // Cae a la etiqueta <img> de abajo.
    }
  }
  const url = URL.createObjectURL(archivo);
  const imagen = new Image();
  await new Promise<void>((resolver, rechazar) => {
    imagen.onload = () => resolver();
    imagen.onerror = () => rechazar(new Error("No se pudo abrir la foto."));
    imagen.src = url;
  });
  return { fuente: imagen, ancho: imagen.naturalWidth, alto: imagen.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
}

/**
 * Devuelve la foto como JPEG de no más de `bytesMaximos`: baja el tamaño y la calidad poco a poco hasta lograrlo.
 * Lanza un Error con un mensaje listo para mostrar si no es una imagen o no se puede dejar tan liviana.
 */
export async function comprimirImagen(archivo: File, opciones: { ladoMax?: number; bytesMaximos?: number } = {}): Promise<File> {
  const { ladoMax = 1280, bytesMaximos = 600_000 } = opciones;
  if (!archivo.type.startsWith("image/")) throw new Error("Elige una foto (JPG, PNG o WebP).");

  const origen = await abrir(archivo);
  try {
    let lado = ladoMax;
    let calidad = 0.75;
    for (let intento = 0; intento < 7; intento++) {
      const { ancho, alto } = escalarA(origen.ancho, origen.alto, lado);
      const lienzo = document.createElement("canvas");
      lienzo.width = ancho;
      lienzo.height = alto;
      const contexto = lienzo.getContext("2d");
      if (!contexto) throw new Error("Este celular no puede preparar la foto.");
      // El JPEG no tiene transparencia: sobre fondo blanco (si no, un PNG transparente queda negro).
      contexto.fillStyle = "white";
      contexto.fillRect(0, 0, ancho, alto);
      contexto.drawImage(origen.fuente, 0, 0, ancho, alto);

      const blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
      if (blob && blob.size <= bytesMaximos) return new File([blob], "foto.jpg", { type: "image/jpeg" });
      calidad = Math.max(0.4, calidad - 0.1);
      lado = Math.max(640, Math.round(lado * 0.85));
    }
    throw new Error("La foto pesa demasiado. Toma otra.");
  } finally {
    origen.liberar();
  }
}
