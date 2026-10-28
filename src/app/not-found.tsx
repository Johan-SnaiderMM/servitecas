import { MARCA } from "@/lib/marca";

/** Página que no existe, o enlace de seguimiento que no corresponde a nada. No dice nada más: no se filtra nada. */
export default function NoEncontrada() {
  return (
    <main className="columna-app px-4 pb-10 pt-[calc(2rem+env(safe-area-inset-top,0px))]">
      <p className="text-sm font-medium uppercase tracking-wider text-tinta-2">{MARCA.nombre}</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">No encontramos esa página</h1>
      <p className="mt-2 text-base text-tinta-2">
        Revisa que el enlace esté completo. Si te lo mandó el taller, pídele que te lo envíe otra vez.
      </p>
    </main>
  );
}
