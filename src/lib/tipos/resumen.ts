/** Lo que devuelve `obtener_resumen` (migración 0010). Solo tipos. */

type Cifra = { n: number; valor: number };

export type Resumen = {
  desde: string;
  hasta: string;
  hallazgos: {
    enviados: Cifra;
    autorizados: Cifra;
    rechazados: Cifra;
    pendientes: Cifra;
    /** Enviados sin precio (no suman al valor). */
    sin_precio: number;
    /** Respondidos por el cliente desde su enlace, sin llamar. */
    desde_enlace: number;
    /** Promedio de lo que tarda el cliente en responder; null si nadie respondió. */
    minutos_respuesta: number | null;
  };
  /** Lo que más se autoriza, hasta 5. */
  top: { titulo: string; autorizados: number; valor: number }[];
  ordenes: {
    recibidas: number;
    entregadas: number;
    canceladas: number;
    /** De recibido a entregado, en promedio; null si no se entregó ninguno de los recibidos. */
    minutos_entrega: number | null;
    mensajes_clientes: number;
  };
  /** Los cuatro estados, en orden: promedio de minutos (null sin datos) y cuántos vehículos lo midieron. */
  tiempos: { estado: "recibido" | "diagnostico" | "en_proceso" | "listo"; minutos: number | null; ordenes: number }[];
};
