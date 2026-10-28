import { z } from "zod";

/**
 * Entradas de las órdenes. Solo servidor: los componentes de cliente no importan Zod. La placa y el celular los
 * normaliza y valida la base (fn_normalizar_placa, fn_normalizar_telefono): aquí solo se revisa la forma.
 */

const ID = (mensaje: string) => z.uuid(mensaje);

export const esquemaRecibir = z.object({
  clave: ID("Vuelve a abrir la pantalla: falta la clave de la operación."),
  placa: z.string().trim().min(1, "Escribe la placa.").max(20, "La placa no es válida."),
  celular: z.string().trim().min(1, "Escribe el celular del cliente: por ahí le llega el enlace.").max(30),
  servicio: z
    .string()
    .trim()
    .min(1, "Escribe qué servicio se le va a hacer.")
    .max(120, "El servicio es muy largo (máximo 120 caracteres)."),
  nombre: z.string().trim().max(60, "El nombre es muy largo (máximo 60 letras).").optional(),
  asignado: ID("La persona asignada no es válida.").optional(),
  kilometraje: z
    .number({ error: "El kilometraje no es válido." })
    .int("El kilometraje no es válido.")
    .min(0, "El kilometraje no es válido.")
    .max(3_000_000, "El kilometraje no es válido.")
    .optional(),
});

export const esquemaCambioEstado = z.object({
  id: ID("La orden no es válida."),
  estado: z.string().min(1, "Elige un estado."),
});

export const esquemaCancelar = z.object({
  id: ID("La orden no es válida."),
  motivo: z.string().trim().min(3, "Escribe por qué se cancela.").max(200, "El motivo es muy largo (máximo 200 caracteres)."),
});

export const esquemaAsignar = z.object({
  id: ID("La orden no es válida."),
  asignado: ID("La persona no es válida.").optional(),
});
