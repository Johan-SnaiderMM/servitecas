import { bd } from "@/lib/datos/bd";
import { consultarPublico } from "@/lib/datos/llamar";
import { BUCKET_FOTOS, esRutaFotoOrden, esUuid } from "@/lib/fotos";
import { respuestaFoto, sinCuerpo } from "@/lib/respuesta-foto";

/**
 * Una foto de la orden, para el cliente que tiene el enlace. El token es su único permiso: `publico_ruta_foto` solo
 * responde si la foto es de ESA orden, está vigente y el enlace no ha vencido. La ruta del archivo no sale de aquí.
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!esUuid(token) || !esUuid(id)) return sinCuerpo(404);

  let ruta: string | null;
  try {
    ruta = await consultarPublico<string | null>("publico_ruta_foto", { p_token: token, p_foto: id });
  } catch {
    return sinCuerpo(404);
  }
  if (!esRutaFotoOrden(ruta)) return sinCuerpo(404);

  const archivo = await (await bd()).leerArchivoPublico(BUCKET_FOTOS, ruta);
  return archivo ? respuestaFoto(archivo) : sinCuerpo(404);
}
