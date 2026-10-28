/**
 * Carga de clientes desde un archivo CSV (placa, nombre, celular). Se revisa TODO en el celular antes de guardar: qué
 * columnas tiene, qué filas sirven, cuáles tienen un celular o una placa que no se entiende y cuáles se repiten. La base
 * (migración 0012) vuelve a normalizar cada fila y decide. Módulo puro: lo usan componentes `"use client"` y las pruebas.
 */
import { normalizarPlaca } from "./placa";
import { normalizarTelefono } from "./telefono";

/** Filas de datos por archivo (igual que en la base). */
export const MAX_FILAS = 2000;
/** Tamaño máximo del archivo: un CSV de 2.000 clientes pesa unos 100 KB. */
export const MAX_BYTES = 1_000_000;

export type FilaLista = { fila: number; placa: string | null; nombre: string | null; celular: string };
export type Problema = { fila: number; motivo: string };

export type Revision = {
  /** Filas que se mandan a la base. */
  listas: FilaLista[];
  /** Filas que no se pueden cargar (y por qué). */
  errores: Problema[];
  /** La misma placa en dos filas con distinto celular: se queda la primera. */
  conflictos: Problema[];
  /** Filas repetidas exactas (se cargan una sola vez). */
  repetidas: number;
  /** Filas en blanco (se ignoran). */
  vacias: number;
  /** Las columnas que se reconocieron, para mostrarlas. */
  columnas: { placa: boolean; nombre: boolean };
};

// ---------------------------------------------------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------------------------------------------------

/**
 * El texto del archivo. Excel en español guarda los CSV en Windows-1252 si no se elige «CSV UTF-8»: si el archivo no es
 * UTF-8 válido, se lee así (las tildes y la ñ salen bien en los dos casos).
 */
export function decodificarArchivo(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** El separador del archivo: Excel en Colombia usa «;», otros programas «,» o tabulador. Se mira la primera línea. */
function separadorDe(texto: string): string {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const sinComillas = primera.replace(/"[^"]*"/g, "");
  const cuenta = (c: string) => sinComillas.split(c).length - 1;
  return [";", ",", "\t"].reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ",");
}

/** Filas y celdas de un CSV: comillas, comillas dobles escapadas (""), saltos de línea dentro de comillas, CRLF y BOM. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const sep = separadorDe(t);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (enComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else {
      celda += c;
    }
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

// ---------------------------------------------------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------------------------------------------------

/** "Teléfono Celular " -> "telefono celular". */
function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Columnas = { placa: number | null; nombre: number | null; celular: number | null };

/** Qué columna es cuál, por su título. Acepta los nombres de columna más comunes de los programas de facturación. */
function columnasDe(titulos: string[]): Columnas {
  const t = titulos.map(plano);
  const buscar = (ok: (x: string) => boolean, menos: Set<number> = new Set()) => {
    const i = t.findIndex((x, k) => !menos.has(k) && ok(x));
    return i === -1 ? null : i;
  };
  // «Número de placa» no es un celular.
  const celular = buscar((x) => !/\bplaca\b/.test(x) && /\b(celular|cel|telefono|tel|movil|whatsapp|numero)\b/.test(x));
  const placa = buscar((x) => /\bplaca\b/.test(x), new Set(celular === null ? [] : [celular]));
  const tomadas = new Set([celular, placa].filter((x): x is number => x !== null));
  const nombre = buscar((x) => /\b(nombre|nombres|cliente|propietario|razon social)\b/.test(x), tomadas);
  return { placa, nombre, celular };
}

// ---------------------------------------------------------------------------------------------------------------------
// Revisión
// ---------------------------------------------------------------------------------------------------------------------

export const ERROR_SIN_CELULAR_COLUMNA =
  "No encontramos la columna del celular. La primera fila del archivo debe tener los títulos: placa, nombre, celular.";

/**
 * Revisa el archivo completo y separa lo que se puede cargar de lo que no. `fila` es el número de fila como lo ve la
 * persona en Excel (la de títulos es la 1).
 */
export function revisarArchivo(texto: string): { ok: true; revision: Revision } | { ok: false; error: string } {
  const filas = leerCsv(texto);
  if (filas.length === 0 || filas.every((f) => f.every((c) => c.trim() === ""))) {
    return { ok: false, error: "El archivo está vacío." };
  }
  const col = columnasDe(filas[0]);
  if (col.celular === null) return { ok: false, error: ERROR_SIN_CELULAR_COLUMNA };

  const datos = filas.slice(1);
  const conDatos = datos.filter((f) => f.some((c) => c.trim() !== "")).length;
  if (conDatos > MAX_FILAS) {
    return {
      ok: false,
      error: `El archivo tiene ${conDatos.toLocaleString("es-CO")} clientes. Carga hasta ${MAX_FILAS.toLocaleString("es-CO")} a la vez: divídelo en partes.`,
    };
  }

  const r: Revision = {
    listas: [],
    errores: [],
    conflictos: [],
    repetidas: 0,
    vacias: 0,
    columnas: { placa: col.placa !== null, nombre: col.nombre !== null },
  };
  // placa -> { celular, fila } de la primera vez que apareció; celulares sin placa ya vistos.
  const placas = new Map<string, { celular: string; fila: number }>();
  const soloCelular = new Set<string>();
  const celda = (f: string[], i: number | null) => (i === null ? "" : (f[i] ?? "").trim());

  datos.forEach((f, k) => {
    const fila = k + 2;
    const placaTxt = celda(f, col.placa);
    const nombreTxt = celda(f, col.nombre);
    const celularTxt = celda(f, col.celular);
    if (placaTxt === "" && nombreTxt === "" && celularTxt === "") {
      r.vacias++;
      return;
    }

    const tel = normalizarTelefono(celularTxt);
    if (!tel.ok) {
      r.errores.push({ fila, motivo: `El celular «${celularTxt}» no es válido.` });
      return;
    }
    if (tel.valor === null) {
      r.errores.push({ fila, motivo: placaTxt ? `La placa ${placaTxt} no tiene celular.` : "Falta el celular." });
      return;
    }
    let placa: string | null = null;
    if (placaTxt !== "") {
      const p = normalizarPlaca(placaTxt);
      if (!p.ok) {
        r.errores.push({ fila, motivo: `La placa «${placaTxt}» no es válida.` });
        return;
      }
      placa = p.valor;
    }
    const nombre = nombreTxt.replace(/\s+/g, " ").slice(0, 60) || null;

    if (placa !== null) {
      const antes = placas.get(placa);
      if (antes) {
        if (antes.celular === tel.valor) r.repetidas++;
        else r.conflictos.push({ fila, motivo: `La placa ${placa} ya venía en la fila ${antes.fila} con otro celular.` });
        return;
      }
      placas.set(placa, { celular: tel.valor, fila });
    } else {
      if (soloCelular.has(tel.valor)) {
        r.repetidas++;
        return;
      }
      soloCelular.add(tel.valor);
    }
    r.listas.push({ fila, placa, nombre, celular: tel.valor });
  });
  return { ok: true, revision: r };
}
