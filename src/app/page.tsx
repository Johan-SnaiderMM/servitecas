import { redirect } from "next/navigation";

/** La raíz lleva al panel del personal. Sin sesión, /inicio manda a /entrar. */
export default function Raiz() {
  redirect("/inicio");
}
