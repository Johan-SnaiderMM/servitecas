import { FlaskConical } from "lucide-react";

/**
 * Lo que avisa que este taller es de ejemplo: así nadie confunde la demo con una serviteca de verdad. Borde punteado y
 * fondo gris (lo «distinto» nunca se marca con opacity).
 */
export function AvisoDemo({ className = "" }: { className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-xl border border-dashed border-zinc-300 bg-hueso p-3 ${className}`}>
      <FlaskConical className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="text-base leading-snug">
        <strong className="font-semibold">Taller de demostración.</strong> Los clientes, los vehículos y los valores son
        inventados. Prueba todo lo que quieras.
      </p>
    </div>
  );
}
