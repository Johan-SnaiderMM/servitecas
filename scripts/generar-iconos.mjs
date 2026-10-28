// Genera los íconos de la PWA (una llanta) en public/icons/ SIN dependencias: escribe los PNG con node:zlib.
// Uso: npm run iconos
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const FONDO = [24, 24, 27]; // tinta
const LLANTA = [241, 241, 238]; // hueso
const ORO = [224, 165, 38];

// --- PNG mínimo (RGBA de 8 bits, sin filtro) ---
const TABLA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function trozo(tipo, datos) {
  const cabeza = Buffer.alloc(8);
  cabeza.writeUInt32BE(datos.length, 0);
  cabeza.write(tipo, 4, "ascii");
  const cola = Buffer.alloc(4);
  cola.writeUInt32BE(crc32(Buffer.concat([cabeza.subarray(4), datos])), 0);
  return Buffer.concat([cabeza, datos, cola]);
}
function png(lado, rgba) {
  const filas = Buffer.alloc((lado * 4 + 1) * lado);
  for (let y = 0; y < lado; y++) {
    rgba.copy(filas, y * (lado * 4 + 1) + 1, y * lado * 4, (y + 1) * lado * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

// --- Dibujo en coordenadas normalizadas (0..1) ---
function enRectRedondeado(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r);
  const cy = Math.min(Math.max(v, y0 + r), y1 - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

/** Color [r,g,b] del diseño en (u,v), o null si está vacío: una llanta con su labrado y el rin dorado. */
function diseno(u, v) {
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d <= 0.11) return ORO; // rin
  if (d >= 0.21 && d <= 0.35) {
    // Labrado: ranuras finas DENTRO de la banda (el borde sigue redondo, como una llanta y no un piñón).
    const angulo = Math.atan2(v - 0.5, u - 0.5) + Math.PI;
    const fraccion = ((angulo / (2 * Math.PI)) * 24) % 1;
    if (d >= 0.27 && d <= 0.32 && fraccion < 0.3) return FONDO;
    return LLANTA;
  }
  return null;
}

function dibujar(lado, { lleno, escala }) {
  const S = 3; // supermuestreo S×S para bordes suaves
  const rgba = Buffer.alloc(lado * lado * 4);
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S) / lado;
          const v = (y + (sy + 0.5) / S) / lado;
          let color = null;
          // Fondo: cuadrado redondeado (ícono normal) o a sangre (maskable / iOS)
          if (lleno || enRectRedondeado(u, v, 0, 0, 1, 1, 0.22)) color = FONDO;
          const d = diseno((u - 0.5) / escala + 0.5, (v - 0.5) / escala + 0.5);
          if (d && color) color = d;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const i = (y * lado + x) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return rgba;
}

const SALIDA = path.join(process.cwd(), "public", "icons");
mkdirSync(SALIDA, { recursive: true });

const iconos = [
  { archivo: "icon-192.png", lado: 192, lleno: false, escala: 1 },
  { archivo: "icon-512.png", lado: 512, lleno: false, escala: 1 },
  // Maskable: el sistema recorta; lo importante debe quedar en el 80 % central.
  { archivo: "maskable-512.png", lado: 512, lleno: true, escala: 0.8 },
  // iOS pone sus propias esquinas y no admite transparencia.
  { archivo: "apple-touch-180.png", lado: 180, lleno: true, escala: 0.85 },
];

for (const { archivo, lado, lleno, escala } of iconos) {
  writeFileSync(path.join(SALIDA, archivo), png(lado, dibujar(lado, { lleno, escala })));
  console.log(`✓ public/icons/${archivo}`);
}
