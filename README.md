# Servitecas

PWA **mobile-first** y **multi-taller** para servitecas de Colombia: el cliente abre un enlace, ve el avance de su vehículo y autoriza o rechaza los trabajos adicionales desde el celular, sin instalar nada ni crear cuenta.

Es una **demo**: todos los datos son ficticios. No es un sistema de gestión (no factura, no lleva inventario ni contabilidad).

🌐 **Pruébala en vivo:** https://servitecas.vercel.app. Entra con «Probar como gerente» o «Probar como jefe de patio»; lo que hagas se borra solo.

## Qué hace

- **Multi-taller:** cada taller ve solo lo suyo. Lo garantizan RLS y funciones en Postgres, y una prueba lo verifica.
- **Equipo con permisos por área:** dueño, jefe de patio y recepción. El equipo entra con un código de invitación.
- **Vehículos y órdenes:** placa y celular normalizados, estados Recibido → Diagnóstico → En proceso → Listo → Entregado.
- **Fotos de ingreso:** se achican en el celular antes de subirse.
- **Hallazgos con autorización:** catálogo por taller, precio opcional y una respuesta única del cliente desde su enlace `/o/<token>`.
- **Mensajes y avisos:** el cliente escribe desde su enlace; el personal recibe avisos push.
- **Resumen:** hallazgos enviados, autorizados y rechazados, valor y tiempos por estado.
- **Carga de clientes** desde un CSV, con vista previa.
- **WhatsApp sin integración:** la app arma el enlace `wa.me` con el mensaje ya escrito y la persona solo pulsa enviar.

Estado: fases 0 a 8 del [plan](PLAN.md) terminadas. La especificación está en [`SPEC.md`](SPEC.md) y el guion para enseñar la demo en [`docs/guion-demo.md`](docs/guion-demo.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth y Storage) · Zod · `web-push` · Vitest y PGlite para las pruebas.

## Cómo correrlo sin cuenta de Supabase

Requiere Node.js.

```bash
npm install
```

1. Copia `.env.example` a `.env.local` y descomenta la línea `DEMO_BD=local`. Deja lo demás vacío.
2. Arranca el servidor:

   ```bash
   npm run dev
   ```

3. Abre <http://localhost:3001> y entra a `/entrar`. En modo local aparecen **Probar como gerente** y **Probar como jefe de patio**, o puedes entrar con `dueno@local.test` y cualquier contraseña (solo desarrollo).

El modo local crea una base PGlite en `.local/` con las migraciones y un taller de demostración. Se recrea sola cuando cambian las migraciones y los datos de prueba se pierden.

## Con Supabase

Las variables están descritas en [`.env.example`](.env.example). `SUPABASE_URL` y `SUPABASE_ANON_KEY` son **solo del servidor** (sin `NEXT_PUBLIC_`): el navegador nunca habla con Supabase. Las migraciones están en `supabase/migrations/` y el esquema unido en `supabase/esquema-completo.sql` (`npm run esquema` lo regenera).

## Demo pública

Para que cualquiera la pruebe sin cuentas ni datos reales, la app puede correr con `DEMO_PUBLICA=1`: el mismo Postgres del modo local, abierto al público y con datos ficticios. No necesita Supabase. Tiene dos formas:

- **Sin `DATABASE_URL`: en memoria (PGlite), para un único proceso.** `npm run build` y luego `DEMO_PUBLICA=1 npm start`, o un contenedor o una máquina. **No sirve en un servidor sin estado como Vercel**: cada instancia tendría su propia base y las peticiones de una misma persona caerían en copias distintas (medido: con 12 peticiones, 3 a la vez, 9 cayeron en una copia vacía).
- **Con `DATABASE_URL`: una base Postgres compartida (p. ej. Neon, gratis).** Es la que sirve en Vercel: todas las copias de la app ven los mismos datos y la misma sesión (medido con dos servidores a la vez: 84 de 84 respuestas correctas). Al primer arranque arma el esquema y la demo, la recrea si cambian las migraciones y la vuelve a sembrar sola cada 3 horas. Usa una base **vacía**: si ya tiene otras tablas, se niega a tocarla.

En los dos modos:

- Lo que se haga en la demo se borra solo: al reciclarse el proceso (en memoria) o a las 3 horas (compartida).
- No hay entrada por contraseña: se entra con **Probar como gerente** o **Probar como jefe de patio**.
- Las fotos viven en la memoria o en la propia base (tabla `demo.archivos`), con un tope de 40 MB. **Más → Reiniciar la demo** las vacía.
- No hay avisos push ni envío real de WhatsApp: la app solo arma el enlace `wa.me`.

Para montarla en Vercel: crea una base Neon vacía, conéctala al proyecto (Vercel agrega `DATABASE_URL`) y define `DEMO_PUBLICA=1`.

## Decisiones de diseño

- Las escrituras van por funciones RPC `security definer`; el cliente nunca escribe tablas.
- El cliente sin cuenta solo ejecuta funciones `publico_*`. La lista exacta está fijada por una prueba.
- Toda tabla de negocio lleva `taller_id` y RLS. Una prueba falla si falta.
- Las fotos las sirve la propia app por id; la ruta del bucket nunca sale al navegador.
- La app no usa la llave `service_role` en ninguna parte.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo en el puerto 3001 |
| `npm run verificar` | Lint, typecheck y pruebas |
| `npm test` | Solo las pruebas (Postgres en memoria con PGlite, sin Docker) |
| `npm run esquema` | Regenera `supabase/esquema-completo.sql` |
| `npm run iconos` | Regenera los íconos de la PWA |
| `npm run vapid` | Genera las llaves de los avisos push |

## Licencia

Código publicado para leerlo y probar la demo. **Todos los derechos reservados**: no se permite copiarlo, modificarlo,
usarlo ni desplegarlo sin autorización escrita. Ver [`LICENSE`](LICENSE).
