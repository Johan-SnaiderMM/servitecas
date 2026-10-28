# Servitecas · Especificación de la demo

> Hoja de ruta aprobada el 17/10/2026. Esta especificación es el contrato de la demo: lo que no está aquí no se
> construye sin decisión explícita. El modelo de datos (§4) es un borrador y se ajusta al construir cada fase.

## 1. Objetivo

Una demo **funcional y multi-taller** para mostrar a servitecas: el cliente ve el avance de su vehículo y autoriza los
trabajos adicionales desde su celular, sin instalar nada. El taller recibe menos llamadas, decide más rápido y deja
registro de cada autorización.

No es un sistema de gestión: no reemplaza el software de facturación, inventario ni contabilidad que el taller ya tiene.

### Usuarios

| Quién | Qué hace | Cómo entra |
|---|---|---|
| **Dueño / gerente** | Configura el taller, invita al equipo, ve el resumen | Correo y contraseña |
| **Jefe de patio** | Recibe vehículos, toma fotos de ingreso, envía hallazgos, responde mensajes. Siempre con el celular encima | Código de invitación |
| **Recepción** | Registra vehículos y ve todas las órdenes | Código de invitación |
| **Cliente del taller** | Abre el enlace que le llega por WhatsApp, ve el avance y autoriza o rechaza | Sin cuenta: el token del enlace es su único permiso |
| **Soporte (proveedor)** | Da de alta talleres y administra la demo | SQL en Supabase |

### Qué es un "sí" para la demo

En **5 minutos y con dos celulares**: se recibe un vehículo con fotos de ingreso, el jefe de patio envía un hallazgo
por WhatsApp, el cliente lo autoriza desde su enlace y el jefe de patio ve la autorización al instante.

## 2. Alcance

### Dentro de la demo (fases 1 a 9 de `PLAN.md`)

Taller y equipo con permisos · vehículos y órdenes · fotos de ingreso · hallazgos con autorización · enlace del
cliente · mensajes desde el enlace · resumen · demo con datos ficticios y reinicio · carga de clientes desde CSV ·
publicación en GitHub, Supabase y Vercel.

### Después de la demo (en este orden aproximado)

1. Modo sin conexión (cola local).
2. WhatsApp oficial (Cloud API de Meta) con envío automático al cambiar el estado.
3. Fotos de todo el equipo asignado al vehículo (no solo jefes de patio).
4. Varias sedes dentro de un mismo taller.
5. Hora estimada de entrega y aviso de "listo".

### Fuera de alcance (no agregar sin decisión explícita)

Facturación electrónica, inventario, cobros y contabilidad, integración continua con el software del taller,
aplicación en tiendas (se instala desde el navegador), video.

## 3. Funcionalidades y criterios de aceptación

### F1. Taller, equipo y permisos (Fase 1)
- Un taller = un inquilino. Soporte lo da de alta con `fn_crear_taller(correo, nombre, nombre_dueño)`.
- Roles iniciales: **Dueño**, **Jefe de patio**, **Recepción**. Los permisos van por **áreas** (`fn_areas` en SQL y
  `src/lib/areas.ts`, comparadas por prueba); toda función de escritura pide su área.
- El equipo entra con un **código de invitación** (8 caracteres, 72 h, un solo uso) en `/unirme`.
- **Aceptación:** una prueba demuestra que un taller no ve ni escribe nada de otro, ni por RLS ni por funciones.

### F2. Vehículos y órdenes (Fase 2)
- **Registro rápido:** placa, celular del cliente y servicio. Si la placa ya existe en el taller, trae al cliente.
- Placa normalizada (mayúsculas, sin espacios ni guiones): carro `ABC123`, moto `ABC12D`. Única por taller.
- Celular normalizado a `+57` + 10 dígitos. Nombre del cliente opcional.
- Estados de la orden: **Recibido → Diagnóstico → En proceso → Listo → Entregado**; **Cancelada** con motivo.
  Un vehículo tiene a lo sumo una orden abierta.
- La orden se **asigna a un jefe de patio**; "Mis carros" muestra las suyas primero.
- **Aceptación:** un jefe de patio abre una orden en menos de 30 s desde el celular.

### F3. Fotos de ingreso (Fase 3)
- Al recibir el vehículo: fotos de su estado (golpes, rayones), con la cámara o de la galería (varias a la vez). Se
  comprimen en el celular (JPEG, ≤ 1280 px, ~100–300 KB). Hasta 12 por orden; quitar una = anularla con motivo.
- Bucket `fotos`, ruta `<taller_id>/<orden_id>/<clave>.jpg` (la clave la genera el celular: un reintento no duplica).
- **Sin `service_role`, la app sirve las fotos:** al personal con su sesión (`/api/foto/orden/<id>`) y al cliente con
  el token de su enlace (`/o/<token>/foto/<id>`). Para leerlas sin sesión el bucket es público, pero nadie puede
  listarlo y la ruta (dos uuid) nunca sale de la app.
- **Aceptación:** la foto queda en la orden y el cliente la ve en su enlace; nadie de otro taller puede leerla.

### F4. Hallazgos y autorización (Fase 4)
- **Catálogo por taller** (31 hallazgos precargados: llantas, alineación y dirección, frenos, suspensión, motor,
  eléctrico) con la descripción ya escrita para el cliente; lo ajusta quien abre el área «catalogo».
- Hallazgo = ítem del catálogo + foto opcional + **precio opcional** (pesos enteros) + nota opcional.
- Estados: **Pendiente → Autorizado / Rechazado**; **Anulado** con motivo. La respuesta del cliente es única; el jefe
  de patio puede registrar una respuesta dada por teléfono ("respondió por llamada").
- "Enviar" abre `wa.me` con el mensaje y el enlace ya escritos; el jefe solo pulsa enviar en su WhatsApp.
- El jefe de patio recibe un **aviso push** cuando el cliente responde.
- **Aceptación:** flujo completo de punta a punta en dos celulares.

### F5. Enlace del cliente (`/o/<token>`, Fases 2 a 4)
- Token aleatorio largo; es el único permiso del cliente. Muestra: taller, vehículo, estado, fotos de ingreso y
  hallazgos con sus botones. Nunca muestra datos de otros clientes ni notas internas.
- Deja de mostrar el detalle 30 días después de entregado.

### F6. Mensajes desde el enlace (Fase 5)
- El cliente escribe mientras la orden está abierta; el mensaje llega al jefe asignado (o a todo el patio si nadie la
  tiene) por push. El taller responde desde la app y avisa por `wa.me`; el cliente ve «Visto» cuando alguien lo abrió.
- Límite anti-spam: 10 mensajes del cliente por hora por orden. Nada se edita ni se borra.

### F7. Resumen (Fase 6)
- Hallazgos enviados, autorizados, rechazados y su valor, por periodo; tiempo promedio por estado.
- Periodos: hoy, 7 días, 30 días y este mes (días de Bogotá). Lo ve quien abre el área `resumen` (el dueño siempre).
- También: cuántos respondieron desde el enlace, en cuánto tiempo, lo que más se autoriza y de recibido a entregado.

### F8. Modo demo (Fase 7)
- Taller ficticio "Llantas y Servicios Demo" con datos relativos a hoy. **Reiniciar demo** con PIN, solo en talleres
  `es_demo`. Cuentas de dueño y de jefe de patio. Guion de 5 minutos para mostrarla.
- El reinicio deja siempre lo mismo (determinista) y conserva al gerente y al jefe de la demo; los invitados se van.
  Las fotos no se recrean: se toman en vivo en la visita. Las cuentas de la demo viven en variables del servidor.

### F9. Carga de clientes (Fase 8)
- Archivo CSV (placa, nombre, celular). Limpia celulares, detecta duplicados y muestra un resumen antes de guardar.

## 4. Modelo de datos (borrador)

| Tabla | Para qué |
|---|---|
| `talleres` | Inquilino: nombre, slug, WhatsApp, `es_demo` |
| `perfiles` | Usuario → taller, rol (`dueno` / `equipo`), nombre |
| `roles_equipo`, `perfil_roles` | Roles con sus áreas y quién los tiene |
| `invitaciones` | Códigos para entrar al equipo |
| `clientes` | Nombre opcional y celular, únicos por taller |
| `vehiculos` | Placa única por taller, cliente, marca/línea opcionales |
| `ordenes` | Vehículo, servicio, estado, jefe asignado, token del enlace |
| `orden_eventos` | Historia de cambios de estado (quién y cuándo) |
| `fotos_orden` | Fotos de ingreso y de hallazgos (ruta en Storage, autor) |
| `catalogo_hallazgos` | Hallazgos predefinidos del taller |
| `hallazgos` | Hallazgo de una orden: precio, foto, estado y respuesta |
| `mensajes_orden` | Mensajes entre el cliente y el taller |
| `suscripciones_push` | Celulares del personal que reciben avisos |

## 5. Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo en `http://localhost:3001` |
| `npm run verificar` | Lint + typecheck + pruebas (obligatorio antes de cerrar una tarea) |
| `npm test` | Solo las pruebas |
| `npm run esquema` | Regenera `supabase/esquema-completo.sql` |
| `npm run iconos` | Regenera los íconos de la PWA |

## 6. Estructura del proyecto

```
supabase/migrations/   SQL numerado (la verdad del modelo y de los permisos)
supabase/esquema-completo.sql   unión de las migraciones para pegar en Supabase
src/app/               pantallas (Next App Router)
src/lib/               lógica sin pantalla (datos, errores, fechas…)
src/lib/supabase/      conexión a la base (Supabase o PGlite local, misma interfaz)
src/lib/local/         modo local de desarrollo (PGlite en .local/)
src/test/              pruebas de SQL y RLS con PGlite
scripts/               utilidades (esquema, íconos)
```

## 7. Reglas de código

Las de `CLAUDE.md`. En resumen: todo en español, multi-taller con `taller_id` y RLS desde la primera tabla, escrituras
solo por funciones, `anon` solo `publico_*`, anular en vez de borrar, pesos enteros, fechas de Bogotá.

## 8. Estrategia de pruebas

- **SQL y permisos con PGlite** (Postgres real en memoria): aislamiento entre talleres, permisos por área, lista
  exacta de funciones públicas, reglas de cada función.
- **Lógica de TypeScript** con Vitest (normalización de placa y celular, mensajes de WhatsApp, compresión).
- **Revisión visual** en el navegador a 360×640 y 390×844 al cerrar cada fase.

## 9. Límites

**Siempre:** datos ficticios en la demo; `npm run verificar` en verde antes de cerrar algo.
**Preguntar antes:** commits, push, crear o tocar proyectos en GitHub/Supabase/Vercel, nuevas dependencias.
**Nunca:** `service_role` en la app; claves en el repositorio o en el chat; datos reales de un cliente.

## 10. Riesgos principales

- **Adopción:** si registrar un vehículo toma más de 30 s, los jefes de patio no lo usarán. Todo se diseña para 3 toques.
- **WhatsApp manual:** depende de que el jefe pulse enviar. Mitigación: el mensaje sale armado y el enlace se
  actualiza solo.
- **Fotos y datos de clientes:** almacenamiento privado, enlace con token largo y sin datos de terceros.

## 11. Preguntas abiertas

1. **Nombre del producto** (hoy "Servitecas", provisional; se cambia en `src/lib/marca.ts`).
2. **Dominio o subdominio** de la demo.
3. **Planes:** Supabase Free sirve para la demo pero se pausa por inactividad; Vercel Hobby no permite uso comercial.
4. ¿El precio del hallazgo debe ser obligatorio para algunos talleres?
