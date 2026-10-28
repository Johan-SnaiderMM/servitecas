import { describe, expect, it } from "vitest";
import { ERROR_SIN_CELULAR_COLUMNA, MAX_FILAS, decodificarArchivo, leerCsv, revisarArchivo } from "./importar-clientes";

/** Revisión que se espera buena (falla la prueba si no). */
function revisar(texto: string) {
  const r = revisarArchivo(texto);
  if (!r.ok) throw new Error(r.error);
  return r.revision;
}

describe("leerCsv", () => {
  it("coma, punto y coma o tabulador, según la primera línea", () => {
    expect(leerCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(leerCsv("a;b;c\r\n1;2,5;3\r\n")).toEqual([["a", "b", "c"], ["1", "2,5", "3"]]);
    expect(leerCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("comillas, comillas escapadas, saltos de línea dentro de comillas y BOM", () => {
    expect(leerCsv('﻿nombre,celular\n"Pérez, Juan","300 123 4567"\n"Dice ""hola""\ny chao",3')).toEqual([
      ["nombre", "celular"],
      ["Pérez, Juan", "300 123 4567"],
      ['Dice "hola"\ny chao', "3"],
    ]);
  });
});

describe("decodificarArchivo", () => {
  it("UTF-8, y si no lo es, Windows-1252 (el CSV de Excel en español)", () => {
    expect(decodificarArchivo(new TextEncoder().encode("Muñoz;José"))).toBe("Muñoz;José");
    expect(decodificarArchivo(new Uint8Array([0x4d, 0x75, 0xf1, 0x6f, 0x7a]))).toBe("Muñoz");
  });
});

describe("revisarArchivo", () => {
  it("reconoce los títulos con tildes, mayúsculas y nombres de otros programas", () => {
    const r = revisar("Placa del vehículo;Nombre del Cliente;Teléfono Celular\nabc-123;Juan  Pérez;300 123 4567");
    expect(r.listas).toEqual([{ fila: 2, placa: "ABC123", nombre: "Juan Pérez", celular: "+573001234567" }]);
    expect(r.columnas).toEqual({ placa: true, nombre: true });
  });

  it("«Número de placa» es la placa, no el celular", () => {
    const r = revisar("Número de placa,Propietario,WhatsApp\nxyz98a,Ana,3109876543");
    expect(r.listas[0]).toMatchObject({ placa: "XYZ98A", nombre: "Ana", celular: "+573109876543" });
  });

  it("sin columna de celular no se puede cargar; un archivo vacío tampoco", () => {
    expect(revisarArchivo("placa,nombre\nABC123,Juan")).toEqual({ ok: false, error: ERROR_SIN_CELULAR_COLUMNA });
    expect(revisarArchivo("\n\n")).toMatchObject({ ok: false, error: "El archivo está vacío." });
  });

  it("separa lo que no sirve, con la fila como se ve en Excel", () => {
    const r = revisar(
      [
        "placa,nombre,celular",
        "ABC123,Juan,3001234567", // 2 bien
        "DEF456,Ana,12345", // 3 celular malo
        "G1,Luis,3007654321", // 4 placa mala
        "HIJ789,Sin celular,", // 5 sin celular
        ",,", // 6 en blanco
        ",Solo nombre,3011112222", // 7 cliente sin vehículo: sirve
      ].join("\n")
    );
    expect(r.listas.map((f) => f.fila)).toEqual([2, 7]);
    expect(r.listas[1]).toEqual({ fila: 7, placa: null, nombre: "Solo nombre", celular: "+573011112222" });
    expect(r.errores).toEqual([
      { fila: 3, motivo: "El celular «12345» no es válido." },
      { fila: 4, motivo: "La placa «G1» no es válida." },
      { fila: 5, motivo: "La placa HIJ789 no tiene celular." },
    ]);
    expect(r.vacias).toBe(1);
  });

  it("repetidas exactas se cargan una vez; la misma placa con otro celular es un conflicto", () => {
    const r = revisar(
      ["placa,nombre,celular", "ABC123,Juan,3001234567", "abc 123,Juan,300-123-4567", "ABC123,Pedro,3009999999", ",Juan,3001234567", ",Juan,3001234567"].join(
        "\n"
      )
    );
    expect(r.listas.map((f) => f.fila)).toEqual([2, 5]);
    expect(r.repetidas).toBe(2);
    expect(r.conflictos).toEqual([{ fila: 4, motivo: "La placa ABC123 ya venía en la fila 2 con otro celular." }]);
  });

  it("varios vehículos del mismo cliente pasan todos", () => {
    const r = revisar("placa,celular\nABC123,3001234567\nXYZ98A,3001234567");
    expect(r.listas).toHaveLength(2);
    expect(r.columnas).toEqual({ placa: true, nombre: false });
  });

  it(`500 clientes ficticios sin errores; más de ${MAX_FILAS} no`, () => {
    const filas = Array.from({ length: 500 }, (_, i) => {
      const placa = `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}Z${String(i).padStart(3, "0")}`;
      return `${placa};Cliente ${i + 1};300 000 ${String(3000 + i).padStart(4, "0")}`;
    });
    const r = revisar(["placa;nombre;celular", ...filas].join("\n"));
    expect(r.listas).toHaveLength(500);
    expect(r.errores).toEqual([]);
    expect(r.conflictos).toEqual([]);

    const muchas = Array.from({ length: MAX_FILAS + 1 }, (_, i) => `,X,3${String(i).padStart(9, "0")}`);
    expect(revisarArchivo(["placa,nombre,celular", ...muchas].join("\n"))).toMatchObject({ ok: false });
  });
});
