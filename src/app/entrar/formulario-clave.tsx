"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { entrarConClave, type EstadoEntrada } from "@/app/acciones/sesion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Correo y contraseña del dueño. La contraseña se puede mostrar (se escribe en el celular, con dedos grandes). */
export function FormularioClave() {
  const [estado, accion, pendiente] = useActionState<EstadoEntrada, FormData>(entrarConClave, { error: null });
  const [ver, setVer] = useState(false);
  // El correo se guarda aquí: tras un intento fallido, React limpia el formulario y no hay que volver a escribirlo.
  // La contraseña sí se borra (lo normal después de un error).
  const [correo, setCorreo] = useState("");

  return (
    <form action={accion} className="space-y-4">
      <div>
        <Label htmlFor="correo">Correo</Label>
        <Input
          id="correo"
          name="correo"
          type="email"
          inputMode="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="nombre@gmail.com"
        />
      </div>
      <div>
        <Label htmlFor="clave">Contraseña</Label>
        <div className="flex gap-2">
          <Input
            id="clave"
            name="clave"
            type={ver ? "text" : "password"}
            autoComplete="current-password"
            required
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setVer((v) => !v)}
            aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"}
            aria-pressed={ver}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-linea bg-papel active:bg-hueso"
          >
            {ver ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      <Button type="submit" tamano="lg" bloque disabled={pendiente}>
        {pendiente ? "Entrando…" : "Entrar"}
      </Button>
      {estado.error && (
        <p role="alert" className="text-center text-base font-semibold text-rojo">
          {estado.error}
        </p>
      )}
    </form>
  );
}
