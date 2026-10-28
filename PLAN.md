# Servitecas · Plan por fases

> Depende de `SPEC.md`. Cada fase termina en algo que se puede **abrir en el celular y enseñar**, con capturas a
> 360×640 y 390×844. Regla de oro: no empieza la fase N+1 hasta que `npm run verificar` pasa en la fase N y la
> fase N está aprobada.

## Cómo se ve el conjunto

```
F0 Arranque ─▶ F1 Multi-taller ─▶ F2 Órdenes ─▶ F3 Fotos ─▶ F4 Hallazgos ─▶ F7 Demo   = demo mínima para mostrar
                                                                     └─▶ F5 Mensajes ─▶ F6 Resumen ─▶ F8 CSV ─▶ F9 Publicación
```

**Demo mínima para mostrar:** fases 0 a 4 más la 7. Las fases 5, 6 y 8 la hacen más vendible.

---

## Fase 0 · Arranque ✅

**Meta:** proyecto vacío que arranca, con pruebas de SQL y modo local funcionando.

| # | Tarea | Verificación |
|---|---|---|
| 0.1 | Proyecto Next 16 + TS + Tailwind 4 en la raíz del repositorio, mismas dependencias que Barberías | `npm run dev` abre en el puerto 3001 |
| 0.2 | Conexión a la base con dos implementaciones (Supabase y PGlite local) y `proxy.ts` que refresca la sesión | La portada muestra "Base de datos: Conectada" en modo local |
| 0.3 | Harness de pruebas PGlite (`src/test/base-datos.ts`) | Las pruebas corren en segundos |
| 0.4 | Migración 0001: permisos de funciones, fechas de Bogotá, bloqueo de borrado, `publico_salud` | `base.test.ts`, `permisos-funciones.test.ts` |
| 0.5 | Reglas del esquema (RLS, `taller_id`, sin escritura directa, esquema al día) | `reglas-esquema.test.ts` |
| 0.6 | PWA mínima: manifest, íconos (llanta), columna de celular, portada provisional | Sin scroll horizontal a 360×640 |
| 0.7 | `CLAUDE.md`, `SPEC.md`, `PLAN.md` | Escritos |

---

## Fase 1 · Base multi-taller ✅

**Meta:** el dueño de un taller de prueba entra y ve su taller vacío; un taller no ve nada de otro.

**Hecho (17/10/2026):** migraciones `0002` (talleres, perfiles, RLS), `0003` (áreas y roles), `0004` (alta de taller) y
`0005` (equipo por invitación). Áreas: `recepcion`, `patio`, `clientes`, `catalogo`, `resumen`, `equipo`, `ajustes`.
Roles iniciales: Jefe de patio (recepcion, patio, clientes) y Recepción (recepcion, clientes). Topes: 60 personas y
20 invitaciones sin usar. Pruebas: `aislamiento`, `alta-taller`, `permisos-por-area`, `equipo`, `pantallas-con-permiso`.
Probado en el navegador: el dueño invita a un jefe de patio, este entra con su código y no ve la pantalla de equipo.

| # | Tarea | Verificación |
|---|---|---|
| 1.1 | Migración `talleres` y `perfiles` (slug único, palabras reservadas) y su RLS | Prueba de aislamiento entre dos talleres |
| 1.2 | Roles y **áreas** (`roles_equipo`, `perfil_roles`, `requerir_area`, `src/lib/areas.ts`) | Prueba que compara áreas SQL y TS; toda función de escritura con guardia |
| 1.3 | Alta de taller por soporte (`fn_crear_taller`) | No se puede llamar desde la app |
| 1.4 | `/entrar` (dueño), salir, layout del personal con barra inferior | El dueño de prueba entra en modo local |
| 1.5 | Invitaciones por código y `/unirme` | Un jefe de patio entra con su código |
| 1.6 | Pantalla de equipo (invitar, roles, quitar) | Revisada a 360×640 y 390×844 |

## Fase 2 · Vehículos y órdenes ✅

**Hecho (18/10/2026):** migración `0006` (clientes por celular, vehículos por placa, órdenes con número por taller,
estados, historia en `orden_eventos`, asignación a quien abre "patio", `publico_orden`). Pantallas: el patio en
Inicio (asignados a ti / los demás), Recibir vehículo (`/ordenes/nueva`, trae al cliente si la placa existe y avisa si
ya está en el patio), la orden (`/ordenes/[id]`: avanzar con un toque, otro estado o cancelar en una hoja, asignar,
enviar el enlace por WhatsApp e historia) y el enlace del cliente `/o/<token>` (pasos con hora, se actualiza solo cada
minuto). Pruebas: `ordenes.test.ts` (placa, celular y estados comparados con TypeScript; reintentos sin duplicar;
aislamiento; RLS; enlace de 30 días), `placa`, `ordenes`, `whatsapp`, `telefono`.

| # | Tarea | Verificación |
|---|---|---|
| 2.1 | Normalización de placa y celular (TS y SQL, comparadas por prueba) | Tabla de casos: carro, moto, con guion, con espacios |
| 2.2 | Clientes y vehículos (placa única por taller) | Misma placa en dos talleres no choca |
| 2.3 | Órdenes con estados, historia y una sola abierta por vehículo | Pruebas de transición y de orden duplicada |
| 2.4 | Registro rápido (placa → trae cliente) y asignación a jefe de patio | Menos de 30 s en el celular |
| 2.5 | "Mis carros" y detalle de la orden con cambio de estado | Revisada en los dos tamaños |
| 2.6 | Enlace del cliente `/o/<token>` con estado | Sin datos de otros; token inválido = 404 |

## Fase 3 · Fotos de ingreso ✅

**Hecho (18/10/2026):** migración `0007` (`fotos_orden`, bucket `fotos` con subida solo en la carpeta del taller,
`registrar_foto_orden`, `quitar_foto_orden`, `ruta_foto_orden`, `publico_ruta_foto`; `obtener_orden` y `publico_orden`
traen las fotos por id). En la orden: tomar foto o elegir varias de la galería, se achican en el celular y se suben una a
una; tocar una la abre en grande y se puede quitar. En el enlace del cliente: «Así recibimos tu vehículo». Pruebas:
`fotos.test.ts` (idempotencia, tope de 12, aislamiento, token y 30 días, reglas del bucket), `fotos`, `imagen`.

| # | Tarea | Verificación |
|---|---|---|
| 3.1 | Compresión en el celular (≤ 1280 px) | Prueba de tamaño |
| 3.2 | Bucket privado y políticas por taller; registro de la foto con autor | Otro taller no lee la foto |
| 3.3 | Tomar fotos desde la orden y verlas en el enlace del cliente | Flujo en el navegador |

## Fase 4 · Hallazgos y autorización ✅

**Hecho (18/10/2026):** migración `0008` (catálogo por taller con 31 hallazgos precargados y editable con el área
`catalogo`; `hallazgos` con precio opcional y hasta 3 fotos; respuesta ÚNICA del cliente con
`publico_responder_hallazgo` o anotada por teléfono; anular con motivo; avisos push con `suscripciones_push` y
`publico_tomar_aviso`, una vez y en los 10 minutos siguientes). Pantallas: Más → Lista de hallazgos (crear, editar,
archivar), Registrar un hallazgo desde la orden (buscar en la lista por texto o categoría, ajustar, precio y fotos),
la tarjeta del hallazgo en la orden (pedir autorización por WhatsApp con el mensaje armado, respondió por llamada,
anular), «Necesitamos tu autorización» en el enlace del cliente (elige y confirma) y «Trabajos adicionales»; el patio
muestra cuántos esperan al cliente y cuántos se autorizaron; Más → Avisos de los clientes. Pruebas:
`hallazgos.test.ts`, `hallazgos`, `dinero`, `avisos-push`, `push`. El aviso push no se pudo ver en el navegador de la
app (bloquea las notificaciones): queda probado con la base y con `web-push` simulado; falta en un celular real.

| # | Tarea | Verificación |
|---|---|---|
| 4.1 | Catálogo de hallazgos por taller (precargado y editable) | Pruebas de catálogo |
| 4.2 | Crear hallazgo (catálogo + foto + precio opcionales) y mensaje `wa.me` | Prueba del texto del mensaje |
| 4.3 | Autorizar / rechazar desde el enlace (una sola vez) y respuesta por llamada | Pruebas de doble respuesta |
| 4.4 | Aviso push al jefe de patio cuando el cliente responde | Aviso recibido en el navegador |

## Fase 5 · Mensajes desde el enlace ✅

**Hecho (21/10/2026):** migración `0009` (`mensajes_orden`; el cliente escribe con su token mientras la orden está
abierta, 10 mensajes por hora; el taller responde desde la orden con su nombre; abrir la orden o responder marca «Visto»;
aviso push al que atiende el vehículo con `publico_tomar_aviso_mensaje`, una vez y en 10 minutos; la regla de a quién le
llega quedó en `fn_suscripciones_de_orden` para respuestas y mensajes). Pantallas: «¿Tienes una pregunta?» y el hilo en
el enlace del cliente; «Mensajes» en la orden (los nuevos marcados, responder y «Avisarle por WhatsApp» con el enlace ya
escrito); el patio muestra «1 mensaje nuevo». Pruebas: `mensajes.test.ts` (límite por hora con instantes fijos, clave
repetida, orden cerrada, permisos, aislamiento, aviso una vez), `mensajes`, `avisos-push`, `push`. Probado en dos
pestañas: Pedro pregunta, el patio lo marca, el dueño responde y Pedro ve «Visto» y la respuesta.

| # | Tarea | Verificación |
|---|---|---|
| 5.1 | Hilo de mensajes por orden, con límite anti-spam | Pruebas del límite |
| 5.2 | Responder desde la app y avisar por `wa.me`; push al jefe asignado | Flujo en dos navegadores |

## Fase 6 · Resumen ✅

**Hecho (21/10/2026):** migración `0010` (`obtener_resumen(desde, hasta)` con el área `resumen`, días de Bogotá y hasta un
año; las cifras salen de `fn_resumen`). Pantalla **Resumen** en la barra de abajo (solo quien abre el área): Hoy, 7 días,
30 días o Este mes; «Trabajos adicionales autorizados» en pesos con el porcentaje de los que respondieron; hallazgos
enviados, autorizados, no autorizados y esperando con su valor; cuántos respondieron desde el enlace y en cuánto tiempo;
lo que más se autoriza; vehículos recibidos, entregados y cancelados; de recibido a entregado y el tiempo promedio en
cada estado (barras). Pruebas: `resumen.test.ts` (instantes fijos, borde de medianoche de Bogotá, anulados fuera,
tramos sin terminar fuera, permisos y aislamiento) y `resumen` (periodos y textos).

| # | Tarea | Verificación |
|---|---|---|
| 6.1 | Hallazgos enviados, autorizados, rechazados y su valor por periodo | Pruebas con instantes fijos |
| 6.2 | Tiempo promedio por estado | Pruebas con instantes fijos |

## Fase 7 · Demo vendible ✅

**Hecho (21/10/2026):** migración `0011` (`fn_provisionar_demo(correo, correo_jefe)`, `fn_cargar_datos_demo(taller, ahora)`
determinista y relativa a hoy, `reiniciar_demo(pin)` solo para el gerente de un taller `es_demo`, PIN con 5 intentos y
bloqueo de 5 minutos, `fn_definir_pin_reinicio` solo desde el SQL Editor). «Llantas y Servicios Demo»: 24 clientes
inventados (+57 300 000 20xx), el patio de hoy (6 vehículos: autorizaciones esperando, una autorizada desde el enlace, un
mensaje sin leer, uno sin asignar), 2 entregados hoy y dos semanas de historia (unos 40 vehículos, hallazgos autorizados
y rechazados, un cancelado) para el Resumen. En `/entrar`: **Probar como gerente** y **Probar como jefe de patio**; aviso
de demostración en Inicio y Más; **Más → Reiniciar la demo**; «Salir de la demo». Guion: `docs/guion-demo.md`, probado en
el navegador (patio, hallazgo autorizado desde el enlace, mensajes, resumen y reinicio). Pruebas: `demo.test.ts` (dos
cargas iguales, patio de hoy, historia y numeración, datos inventados, enlace del cliente, reinicio, PIN, alta).

| # | Tarea | Verificación |
|---|---|---|
| 7.1 | Taller ficticio con datos relativos a hoy y reinicio con PIN | El reinicio deja siempre lo mismo |
| 7.2 | "Probar la demo" en `/entrar` (dueño y jefe de patio) | Entra sin pedir datos |
| 7.3 | Guion de 5 minutos para mostrarla | Escrito y probado |

## Fase 8 · Carga de clientes ✅

**Hecho (25/10/2026):** `src/lib/importar-clientes.ts` lee el CSV en el celular (punto y coma, coma o tabulador;
comillas; UTF-8 o Windows-1252 de Excel; títulos como «Teléfono celular» o «Número de placa»), limpia celulares y
placas y separa errores, repetidas y la misma placa con otro celular. Migración `0012`: `importar_clientes(filas,
guardar)` (área `clientes`, hasta 2.000): con `guardar` en false hace todo y lo deshace (vista previa con las mismas
cifras); un nombre existente no se cambia (solo se completa) y un vehículo de otro cliente no cambia de dueño (conflicto);
volver a cargar no duplica. Pantalla **Más → Cargar clientes** con plantilla, resumen antes de guardar, problemas por fila
y confirmación. Al recibir una placa cargada aparece «Ya está registrado». Pruebas: `importar-clientes.test.ts` (SQL y
TypeScript, 500 clientes ficticios sin errores). Probado en el navegador con 504 filas (500 cargadas, 3 problemas, 1
repetida).

| # | Tarea | Verificación |
|---|---|---|
| 8.1 | Leer CSV, limpiar celulares, detectar duplicados y mostrar resumen antes de guardar | 500 clientes ficticios sin errores |

## Fase 9 · Publicación

| # | Tarea | Verificación |
|---|---|---|
| 9.1 | Repositorio privado en GitHub (con tu aprobación) | Código subido sin claves |
| 9.2 | Proyecto en Supabase: esquema, bucket, sesiones anónimas, usuario de demo | Prueba de humo en producción |
| 9.3 | Proyecto en Vercel con variables y subdominio | La demo abre desde el celular con un enlace |
