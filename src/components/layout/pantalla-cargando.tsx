/** Lo que se ve mientras llega una pantalla (`loading.tsx`): texto, sin vueltas ni esqueletos que simulen datos. */
export function PantallaCargando() {
  return (
    <main className="px-4 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]">
      <p role="status" className="text-base text-tinta-2">
        Cargando…
      </p>
    </main>
  );
}
