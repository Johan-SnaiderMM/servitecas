/** Lo que devuelve `importar_clientes` (migración 0012). Solo tipos. */
export type ResultadoImportar = {
  guardado: boolean;
  clientes_nuevos: number;
  clientes_completados: number;
  vehiculos_nuevos: number;
  sin_cambios: number;
  errores: { fila: number; motivo: string }[];
  conflictos: { fila: number; motivo: string }[];
};
