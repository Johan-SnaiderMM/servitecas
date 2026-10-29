# Servitecas

PWA **mobile-first** y **multi-taller** para servitecas de Colombia: el cliente ve el avance de su vehículo y autoriza
los trabajos adicionales desde el celular, sin llamar al jefe de patio. Es una **demo vendible**: datos SIEMPRE ficticios
(nunca datos, nombres ni números de un cliente real).
Especificación en `SPEC.md`, fases en `PLAN.md` (no empieza una fase sin la aprobación de la anterior).
Base técnica tomada de Barberías, otro proyecto del mismo autor (mismo stack y patrones); flujo de órdenes y fotos inspirado en
un proyecto anterior de taller. Se consultan, no se copian módulos de negocio.

## Convenciones

- Todo en español: interfaz, comentarios, commits, nombres de tablas y funciones SQL.
- Dinero (precio de un hallazgo): pesos enteros (`integer`), nunca `numeric`/`float`.
- Anular con motivo en vez de borrar (`fn_bloquear_borrado` en toda tabla de negocio). `created_at` y `registrado_por`
  en todo lo que se registra.
- Toda tabla de negocio lleva `taller_id NOT NULL` + RLS (una prueba falla si no). Llaves foráneas compuestas
  `(taller_id, id)`. `talleres` es la única tabla sin `taller_id`.
- Las escrituras van por funciones RPC `security definer`; el cliente nunca escribe tablas (una prueba lo exige).
  Los visitantes sin cuenta solo ejecutan funciones `publico_*` (la lista exacta la fija `permisos-funciones.test.ts`).
  `fn_*` y `requerir_*` son internas. Una `publico_*` que llame a otra función debe ser `security definer`.
- Permisos por área (`fn_areas` en SQL y `src/lib/areas.ts`, una prueba las compara). Toda función de escritura nueva
  pide su área con `requerir_area('…')` (o `requerir_dueno`), nunca solo `requerir_taller()`: una prueba
  (`permisos-por-area.test.ts`) falla si una función volátil de la API queda sin guardia. La única excepción es
  `canjear_invitacion` (su permiso es el código). Nadie da más áreas de las que tiene (`fn_exigir_roles_asignables`).
- Equipo: el dueño entra con correo y contraseña (`fn_crear_taller` lo da de alta desde el SQL Editor); el resto entra
  con un código en `/unirme` (sesión anónima de Supabase + `canjear_invitacion` con la MISMA conexión; hay que activar
  "Allow anonymous sign-ins" en Supabase).
- Pantallas del personal: `src/app/(app)/<pantalla>/page.tsx` (o `(tarea)/…` para una sola tarea) empieza con
  `revisarPermiso("<pantalla>")`, maneja `permitido` con `<SinPermiso>` y la pantalla se agrega a `PANTALLAS`
  (`src/lib/areas.ts`) y, si lleva botón en la barra, a `ITEMS` de `barra-navegacion.tsx`. `/`, `/entrar`, `/unirme`
  y `/o/<token>` son las únicas páginas exentas (una prueba lo exige).
- Órdenes (migración `0006`): placa, celular y estados tienen espejo en TypeScript (`placa.ts`, `telefono.ts`,
  `ordenes.ts`) y una prueba compara ambos con la misma tabla de casos (`src/test/casos-*.ts`). `recibir_vehiculo` usa
  como id la clave que manda la pantalla (`nuevaClave()`): un reintento devuelve la misma orden. Cada cambio deja una
  fila en `orden_eventos` con el NOMBRE de quien lo hizo (si sale del equipo, la historia no se pierde).
- Enlace del cliente `/o/<token>`: exento de `revisarPermiso`, solo llama `publico_orden` (primeros nombres, nunca
  celulares, apellidos ni notas internas; una prueba lo revisa). Deja de mostrarse 30 días después de cerrada.
- Fotos (migración `0007`): el celular las achica a JPEG (`src/lib/imagen.ts`; una acción acepta 1 MB) y la acción
  `subirFotoOrden` sube con la sesión de quien la toma y luego registra (`registrar_foto_orden`, la clave es el id). La
  ruta (`src/lib/fotos.ts`, igual a la de la base) NUNCA sale de la app: se sirven por id en `/api/foto/orden/<id>`
  (personal) y `/o/<token>/foto/<id>` (cliente) con `BaseDatos.leerArchivoPublico`. El bucket es público solo para
  poder leer sin sesión; no tiene política de lectura para anon (nadie lo lista). Nunca URLs firmadas con `service_role`.
- Hallazgos (migración `0008`): categorías con espejo en `src/lib/hallazgos.ts` (comparadas por prueba). La respuesta
  del cliente es ÚNICA (`publico_responder_hallazgo` devuelve `{ok:false, motivo}` si ya respondió, si no existe o si la
  orden está cerrada; nunca lanza al cliente). Un error del taller se anula con motivo; la respuesta no se edita.
  Lo que `anon` ejecuta son 8 funciones `publico_*` (lista fijada en `permisos-funciones.test.ts`).
- Supabase SOLO desde el servidor: `SUPABASE_URL` y `SUPABASE_ANON_KEY` van sin `NEXT_PUBLIC_` y la CSP no deja al navegador
  conectarse a Supabase (`llaves-solo-servidor.test.ts`). Sin la llave nadie llama la API por su cuenta: es lo que impide
  que un cliente pida con su token los avisos push del personal (`publico_tomar_aviso*` los devuelve) o que un visitante
  cambie la contraseña de la cuenta de la demo con su sesión. Si un componente del navegador necesitara Supabase, revisar
  esas dos cosas ANTES de exponer la llave.
- Avisos push (`0008`, como en Barberías): sin `service_role`, el servidor toma las suscripciones con
  `publico_tomar_aviso(token, hallazgo)` (una vez, 10 min) y manda con `web-push` desde `after()`; `src/lib/push.ts` nunca
  lanza. Sin las tres variables VAPID (`npm run vapid`) no se manda nada. El service worker (`public/sw.js`) solo muestra
  el aviso y abre la orden. A quién le llega lo decide SOLO `fn_suscripciones_de_orden` (`0009`): quien atiende el vehículo
  o, si nadie, todo el patio.
- Mensajes (`0009`): el cliente escribe con `publico_enviar_mensaje(token, clave, texto)` solo con la orden abierta; 10 por
  hora por orden (`fn_limite_mensajes_hora`, espejo en `src/lib/mensajes.ts`). Devuelve `{ok:false, motivo}`, nunca lanza.
  El taller responde con `enviar_mensaje_orden` (recepción o patio) y le avisa por `wa.me`; responder o abrir la orden
  (`marcar_mensajes_leidos`, sin revalidar para no borrar el «Nuevo» en pantalla) los marca vistos. Al cliente solo le
  sale el primer nombre de quien respondió. Aviso push con `publico_tomar_aviso_mensaje` (igual que las respuestas).
- Resumen (`0010`): `obtener_resumen(p_desde, p_hasta)` (área `resumen`) envuelve `fn_resumen(taller, desde, hasta)`; los
  días son de Bogotá e inclusivos. Los hallazgos cuentan por su `created_at` (sin anulados); los tiempos por estado salen de
  `orden_eventos` con `estado` (cada uno abre un tramo que cierra el siguiente), solo de vehículos recibidos en el periodo y
  con el tramo terminado. Los periodos de la pantalla viven en `src/lib/resumen.ts`.
- Demo (`0011`, como en Barberías): `fn_cargar_datos_demo(taller, ahora)` borra y recrea TODO lo de un taller `es_demo`
  (activa `app.reiniciando_demo`) con `fn_demo_hash` (sin `random()`): dos cargas con el mismo `ahora` dan lo mismo
  (`demo.test.ts` lo compara). Inserta directo copiando lo que dejan las funciones de la API (`fn_demo_orden`,
  `fn_demo_hallazgo`); si cambias una regla de órdenes o hallazgos, cambia también esas. Las respuestas de ejemplo llevan
  `aviso_at` (nadie recibe avisos de cosas inventadas). El jefe de la demo es `talleres.demo_jefe` y sobrevive al reinicio.
  «Probar como gerente / como jefe de patio» aparecen con `DEMO_EMAIL`/`DEMO_PASSWORD` y `DEMO_JEFE_EMAIL`/`DEMO_JEFE_PASSWORD`
  (`src/lib/demo.ts`) o en modo local. Guion de venta: `docs/guion-demo.md` (si cambias una pantalla que nombra, actualízalo).
- Carga de clientes (`0012`): el celular revisa el CSV (`src/lib/importar-clientes.ts`) y `importar_clientes(p_filas,
  p_guardar)` (área `clientes`) vuelve a normalizar cada fila. La vista previa (`p_guardar` false) corre el MISMO código y lo deshace
  con `raise ... errcode 'SV001'` dentro de un bloque (las variables conservan las cuentas). Lo que ya está en la app manda.
- Dinero: `src/lib/dinero.ts` (`formatearPesos`, `leerPesos`), escrito a mano para que servidor y navegador coincidan.
- Migraciones (`supabase/migrations/`, nombre `AAAAMMDDNNNNNN_tema.sql`): toda migración que agregue funciones termina
  con `select public.fn_aplicar_permisos();` y se corre `npm run esquema` para regenerar `supabase/esquema-completo.sql`
  (una prueba lo verifica). Al redefinir una función, copiar la ÚLTIMA versión; si cambia su firma, `drop function` de
  la anterior (si no, queda una sobrecarga).
- SQL: cuidado con los NULL en las validaciones (`jsonb_typeof(x -> 'clave')` es NULL si falta la clave y un `or` con
  NULL no dispara el `raise`): usa `coalesce`. Una función plpgsql que devuelve `table (...)` lleva
  `#variable_conflict use_column` si sus consultas usan los mismos nombres de columna.
- Errores de negocio en español con `errcode` `P0001` (validación), `P0002` (no existe) o `42501` (sin permiso): se
  muestran tal cual (`src/lib/errores.ts`); todo lo demás sale como mensaje genérico.
- Pruebas de SQL/RLS: Postgres real en memoria con PGlite (`src/test/base-datos.ts`), sin Docker. Las funciones de la
  API se llaman con `rpc(db, actor, "nombre", {...})` (actor `null` = visitante sin sesión). PGlite atiende una
  consulta a la vez: las pruebas "concurrentes" verifican el RESULTADO que garantiza la restricción, no carreras reales.
- Fechas: instantes en `timestamptz`; "hoy" en Bogotá (`hoy_bogota`, `fecha_bogota`). Las pruebas usan instantes fijos,
  nunca el reloj. En páginas, `ahoraMs()` de `src/lib/reloj.ts` en vez de `Date.now()` (regla `react-hooks/purity`).
- WhatsApp: la app nunca envía mensajes. Arma el enlace `wa.me` con el texto y el jefe de patio lo manda desde su
  WhatsApp.
- Formularios: React 19 limpia los campos SIN control al terminar una acción. Si el formulario debe conservar lo
  escrito (p. ej. para confirmar), todos sus campos van controlados (`useState`).
- Contraste (`contraste.test.ts`, como en Barberías): el texto llega a 4,5:1 sobre blanco, papel y hueso. Los campos van con
  `<Input>`, `<AreaTexto>` o `<Selector>` (`components/ui/input.tsx`: borde `borde-campo` 3:1, foco `tinta`, ejemplo `tinta-2`);
  `linea` es solo para tarjetas y separadores. Sin `text-xs` ni guion largo. Carga y error: `loading.tsx` SOLO en `(app)` y
  `(tarea)` (en `/o/<token>` se perdería el 404), `error.tsx` y `global-error.tsx` (`pantallas-de-estado.test.ts`).
- Diseño: objetivos táctiles ≥ 48 px, texto ≥ 16 px, acciones principales abajo, sin `hover`, sin scroll horizontal;
  lo apagado se ve con borde punteado y fondo gris, nunca con `opacity`. Verificar a 360×640 y 390×844.
  Estilo "ultra clean": bordes de 1 px `border-linea` (nunca `border-2` ni negro), títulos `font-semibold`, etiquetas
  `font-medium` en mayúsculas (14 px), texto secundario `text-tinta-2`, íconos de línea fina. Los colores salen de los
  tokens de `globals.css`; no usar hex sueltos.
- Los componentes `"use client"` no importan Zod ni `server-only`.
- Next: esta versión tiene cambios de API. Leer `node_modules/next/dist/docs/` antes de escribir código de Next
  (aquí `middleware` es `src/proxy.ts`). No usar los tipos globales `LayoutProps`/`PageProps`: tipar `children` con
  `ReactNode`.
- Todo lo que dependa de la sesión o lea la base (cookies) declara `export const dynamic = "force-dynamic"`: sin eso,
  un `next build` sin Supabase configurado intenta prerenderizarlo y falla.
- `.next/dev/types` a veces queda con basura y rompe `tsc` y `next build`: `npm run typecheck` y `npm run build` lo
  borran antes (`scripts/limpiar-tipos-dev.mjs`).
- Modo local sin Supabase: `.env.local` con `DEMO_BD=local` crea en `.local/` una base PGlite con las migraciones
  (se recrea sola cuando cambian; los datos de prueba se pierden), el "Taller de Prueba" y la demo (`demo@local.test`
  gerente, `jefe-demo@local.test` jefe). Se entra en `/entrar` con `dueno@local.test` y cualquier contraseña (solo
  desarrollo; en producción está apagado). La base se abre una vez por
  proceso: tras cambiar migraciones, reinicia `npm run dev`.
- Demo pública (`DEMO_PUBLICA=1`; `src/lib/local/` → `bd-local.ts`, `motor.ts`, `archivos.ts`, `preparar.ts`): sin `DATABASE_URL` es PGlite en memoria para UN solo proceso (NO sirve en Vercel: cada instancia tendría su propia base, medido el 2026-10-29); con `DATABASE_URL` es una base Postgres compartida y vacía (p. ej. Neon) que sí sirve en Vercel, se vuelve a sembrar cada 3 h y se niega a tocar tablas ajenas (`bd-postgres.test.ts`). Con las
  fotos también en memoria (tope de 40 MB). Es el único caso en que el modo local corre en producción, así que se cierra lo que en
  desarrollo es cómodo: no hay entrada por contraseña (solo «Probar como gerente / jefe de patio» y el código del equipo), hay tope de
  usuarios anónimos y el reinicio de la demo también vacía las fotos. En memoria, cada instancia del servidor tiene su propia copia: lo que se
  haga se borra cuando se recicla. No lleva ninguna clave ni cuenta externa (`servidor.test.ts` fija cuándo se enciende).
- El servidor de desarrollo usa el puerto **3001** (Barberías usa el 3000).

## Comandos

`npm run dev` · `npm run verificar` (lint + typecheck + test, obligatorio antes de dar algo por terminado) ·
`npm run esquema` · `npm test` · `npm run iconos` · `npm run vapid` (llaves de los avisos push, una vez).

## No hacer sin avisar

Commits, push, despliegues, tocar Supabase / Vercel / GitHub / DNS, agregar dependencias o servicios externos, pasar
algo de "Después de la demo" a la demo. Nunca `service_role` en la app, nunca claves en commits ni en el chat.
