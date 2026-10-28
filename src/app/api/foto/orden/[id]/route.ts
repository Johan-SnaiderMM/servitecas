import { bd } from "@/lib/datos/bd";
import { consultar } from "@/lib/datos/llamar";
import { BUCKET_FOTOS, esRutaFotoOrden, esUuid } from "@/lib/fotos";
import { respuestaFoto, sinCuerpo } from "@/lib/respuesta-foto";
import { obtenerUsuario } from "@/lib/sesion";

/**
 * Una foto de una orden, para el personal. Se pide por el id de la foto, nunca por la ruta: la base decide si quien
 * pregunta la puede ver (`ruta_foto_orden` no responde a otro taller ni a quien no trabaja vehículos).
 */
export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) return sinCuerpo(404);
  if (!(await obtenerUsuario())) return sinCuerpo(401);

  let ruta: string | null;
  try {
    ruta = await consultar<string | null>("ruta_foto_orden", { p_id: id });
  } catch {
    return sinCuerpo(403);
  }
  if (!esRutaFotoOrden(ruta)) return sinCuerpo(404);

  const archivo = await (await bd()).leerArchivoPublico(BUCKET_FOTOS, ruta);
  return archivo ? respuestaFoto(archivo) : sinCuerpo(404);
}
