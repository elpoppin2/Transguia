# TransGuía — Contexto para retomar en otra sesión

> Documento de traspaso. Si estás empezando una sesión nueva (con o sin
> asistente de IA), **lee esto primero**. Los detalles finos están en los
> otros `.md` que se mencionan más abajo.
> Última actualización: 2026-10-23.
>
> **Estado al 2026-10-23:** en producción en **https://transguias.vercel.app**.
> Cada push a `main` se despliega solo en Vercel. Si la app deja de
> responder, revisar primero si Supabase pausó el proyecto por
> inactividad (se reactiva con *Restore project*).

---

## 1. Qué es TransGuía

Plataforma logística para transportistas peruanos:

- Registro de **unidades** (camiones) y **choferes** según normativa del MTC.
- **Documentos con vencimiento** (SOAT, revisión técnica, licencia de
  conducir, certificado médico) y alertas de vencimiento.
- **Tickets de traslado** vinculados a la **GRE-Transportista** de SUNAT
  (hoy simulada — ver punto 8).
- Seguimiento operativo: generado → en tránsito → entregado (o anulado).
- **Dashboard** con gráficos por empresa y, para el superadmin, de toda
  la plataforma.
- **Dos tipos de empresa**: `TRANSPORTISTA` (todo lo de arriba) y
  `PROVEEDOR` — proveedor de materiales con flota propia, que **solo
  controla su flota** (unidades, choferes, documentos, programación,
  dashboard de flota) y no emite tickets ni guías.

### Quién lidera esto

Analista de **Supply Chain**, no viene de sistemas. El trabajo se ha
hecho **paso a paso**, con explicaciones **en lenguaje simple**,
confirmando cada resultado antes de seguir. **Mantené ese estilo**: nada
de jerga sin explicar, y avisá antes de cambios grandes o de instalar
cosas nuevas.

---

## 2. Estado actual (todo lo que YA funciona)

Todo corre contra la base de datos real (Supabase) y pasa `npm run probar`.

| Área | Estado |
|---|---|
| Base de datos (Supabase, Postgres) | 10 tablas + 1 vista, ya creadas. Schema en `transguia-schema.sql`. |
| Registro / login | ✅ con **token de sesión** (HMAC, 12 h). |
| Roles | ✅ `operador`, `admin_empresa`, `superadmin`. |
| Unidades / choferes | ✅ alta, listado, baja lógica (`activo`). Validaciones MTC. |
| Documentos + vencimientos | ✅ CRUD + `GET /api/vencimientos`. La licencia vigente va en la GRE. |
| Tickets de traslado | ✅ crear + emitir GRE + avanzar estado. Vive en 3 tablas, con transacción. |
| Superadmin multi-empresa | ✅ ve todas las empresas, crea empresas, segmentador. Solo lectura de datos de empresa. |
| Dashboard | ✅ 4 gráficos de barras (CSS puro). Por empresa o acumulado. |
| Interfaz web | ✅ `transguia-prototipo.html`, **la sirve el propio backend** en `/`. Sin configurar URLs. |
| Preparado para desplegar en **Vercel** | ✅ `api/index.js` + `vercel.json`. Falta que el usuario haga el deploy. |
| Repo Git | ✅ iniciado, 5 commits. `.env` protegido por `.gitignore`. |

| Proveedores con flota propia | ✅ `empresas.tipo_empresa`; sin tickets (403), unidades/choferes sin revisión, `GET /api/dashboard/flota`. |
| Identidad visual | ✅ "carretera y cantera" (asfalto, concreto, amarillo vial), tipografía Archivo, placas dibujadas como placas peruanas. |

Repo: github.com/elpoppin2/Transguia (rama `main`). La bitácora completa
está en `PROGRESS.md`; el historial, en `git log`.

---

## 3. Cómo arrancar (local)

Entorno: **Windows**, proyecto en `E:\HUECO\Transguia`.
Node.js, VS Code y Git ya instalados.

```bash
npm install                       # solo la primera vez (3 deps: express, pg, dotenv)
# el .env ya existe con DATABASE_URL y SESSION_SECRET reales
node server.js                    # interfaz + API en http://localhost:3001
node sembrar-datos.js             # carga la demo (idempotente)
```

Abrir **http://localhost:3001** en el navegador. Usuarios de demo:

| Usuario | Contraseña | Rol |
|---|---|---|
| `andina` | `demo2026seguro` | admin de "Transportes Andina S.A.C." |
| `delsur` | `delsur2026seguro` | admin de "Logística del Sur E.I.R.L." |
| `lurin` | `lurin2026seguro` | admin de "Agregados y Canteras Lurín S.A.C." (**proveedor** con flota propia) |
| `super` | `superdemo2026` | superadmin (ve las tres) |

Otros comandos:
```bash
npm run probar             # corre las 6 baterías de prueba contra la base
npm run demo               # demo de consola, todo en memoria, sin base ni credenciales
node borrar-datos-demo.js  # limpia lo sembrado (--empresa borra también las empresas)
node crear-empresa.js <RUC> "<Razón>" <usuario> <clave> "<Nombre>"   # empresa + su admin
node crear-superadmin.js <usuario> <clave> "<Nombre>"                # otro superadmin
```

---

## 4. Stack

**Deliberadamente minimalista.** Node.js + Express + PostgreSQL, **sin ORM
y sin framework de frontend**. Solo 3 dependencias: `express`, `pg`, `dotenv`.

| Capa | Qué usa |
|---|---|
| Servidor | Express 4 (`src/app.js` arma la app; `server.js` la levanta; `api/index.js` para Vercel) |
| Base de datos | PostgreSQL en **Supabase**, con driver `pg` directo, SQL a mano |
| Contraseñas | `crypto` nativo — **scrypt** (sin bcrypt) |
| Sesiones | token firmado **HMAC-SHA256**, stateless, sin tabla (sin `jsonwebtoken`) |
| Emisión GRE | patrón de interfaz propio (`EmisorGRE`), sin SDK |
| Frontend | `transguia-prototipo.html` — 1 archivo, JS vanilla, CSS a mano, **sin build** |
| Gráficos | barras hechas con CSS (sin Chart.js ni CDN) |
| Pruebas | scripts `node` planos (sin Jest/Mocha) |
| Despliegue | Vercel (serverless). Alternativa: Render/Railway (servidor normal). |

---

## 5. Estructura del código

```
src/
  app.js            arma la app Express (rutas + servicios + sirve el HTML en /), SIN listen
  auth/             login/registro, password (scrypt), sesion (token HMAC), middleware (requiereSesion/requiereRol/empresaDeLaPeticion)
  empresas/         superadmin: listar empresas con resumen, crear empresa + admin, totales
  dashboard/        métricas agregadas para los 4 gráficos
  unidades/  choferes/  documentos/  tickets/
                    cada uno: <X>Service.js (reglas) + <X>RepoMemoria.js + <X>RepoPostgres.js (mismo contrato)
  gre/              EmisorGRE (interfaz) + Demo (activo) / PSE (plantilla) / DirectoSunat (sin implementar)
  db/               pool.js (conexión + transacciones) · migraciones.js (ajustes idempotentes al arrancar)

server.js                 levanta la app como proceso normal (local / Render / Railway)
api/index.js + vercel.json  entrada y config para Vercel
transguia-prototipo.html  interfaz de una sola página
sembrar-datos.js / borrar-datos-demo.js / crear-empresa.js / crear-superadmin.js
probar-*.js  +  probar-todo.js  (npm run probar)

transguia-schema.sql       DDL completo (ya corrido en Supabase)
contrato-api.yaml          contrato OpenAPI 3.1 de toda la API
MODELO-DE-DATOS-Y-API.md   diagrama de entidades (Mermaid) + para qué sirve cada endpoint
DESPLIEGUE.md              cómo subirlo a Vercel (o Render/Railway)
PROGRESS.md                bitácora detallada, paso a paso, de todo lo hecho
```

**Patrón repetido**: cada recurso tiene un *Service* con las reglas de
negocio y dos *repositorios* con el mismo contrato (memoria y Postgres).
El servicio no sabe cuál usa. Hoy todo usa Postgres; la versión en
memoria es para `demo.js` y algunas pruebas.

---

## 6. Los 3 roles

| Rol | Qué puede hacer |
|---|---|
| `operador` | Crear y mover tickets de **su** empresa. |
| `admin_empresa` | Lo del operador + registrar unidades, choferes, documentos, usuarios de **su** empresa. Ve el Dashboard de su empresa. |
| `superadmin` | Rol de **plataforma, sin empresa propia** (`empresa_id` nulo). Ve **todas** las empresas (`/api/empresas`, `/api/resumen`), crea empresas, y el Dashboard acumulado o por empresa. **Solo lectura** de datos de empresa (403 si intenta escribir). Usa `?empresaId=<uuid>` en las rutas de lectura; en el prototipo, un segmentador. |

Además del rol, cuenta el **tipo de empresa**: un `admin_empresa` de un
`PROVEEDOR` no ve Tickets (el backend responde 403 con
`soloTransportistas`), registra unidades y choferes que quedan
aprobados al instante y los puede editar siempre. El tipo se lee de la
base en cada petición (`esFlotaPropia` en `src/app.js`), no del token.

Regla de oro de seguridad: **el `empresaId` sale del token**, nunca del
cliente. La única excepción es el superadmin, que puede pasar
`?empresaId=` en las rutas de lectura (a los demás roles se les ignora).
Lógica central en `src/auth/middleware.js` → `empresaDeLaPeticion(req)`.

---

## 7. API (resumen)

Público: `GET /api/health`, `POST /api/auth/login`. Todo lo demás:
`Authorization: Bearer <token>`.

- **Auth**: `POST /api/auth/login`, `POST /api/auth/registro` *(admin)*
- **Plataforma** *(superadmin)*: `GET /api/resumen`, `GET/POST /api/empresas`
- **Dashboard** *(admin / superadmin)*: `GET /api/dashboard?agrupar=dia|mes`
- **Unidades**: `GET/POST /api/unidades`, `POST /api/unidades/:id/desactivar`,
  `GET/POST/DELETE /api/unidades/:id/documentos[/:docId]`
- **Choferes**: idem con `/api/choferes`
- **Vencimientos**: `GET /api/vencimientos?dias=30`
- **Tickets**: `GET/POST /api/tickets`, `GET /api/tickets/:id`,
  `POST /api/tickets/:id/avanzar`

El contrato completo (cuerpos, respuestas, roles, 400/401/403/404) está
en **`contrato-api.yaml`** (pegable en editor.swagger.io).

### El dashboard (4 métricas)

`GET /api/dashboard` devuelve:
1. `trasladosPorPeriodo` — traslados por día (o mes si `agrupar=mes`)
2. `porEstadoOperativo` — { GENERADO, EN_TRANSITO, ENTREGADO, ANULADO }
3. `toneladasPorMaterial` — suma de peso por `descripcion_mercancia`, en toneladas
4. `tiempoFinalizacion` — promedio/mín/máx de `fecha_entrega − fecha_traslado` + barra por ticket

---

## 8. Decisiones de diseño a respetar

- **La emisión de la GRE pasa SIEMPRE por la interfaz `EmisorGRE`.** Nunca
  acoplar `ticketService.js` a un proveedor concreto.
- Hoy `GRE_PROVIDER=demo`: un **simulador** que no llama a SUNAT, no usa
  certificado, no sale a internet. `EmisorGREPSE.js` es una plantilla con
  TODOs; `EmisorGREDirectoSunat.js` lanza error a propósito.
- **Nunca** contraseñas en texto plano (scrypt).
- El `empresaId` siempre del token (ver punto 6).
- En producción, `SESSION_SECRET` debe tener un valor propio y largo. El
  `.env` nunca se sube al repo.
- **No inventar** `peso_bruto_maximo_kg` en `configuraciones_vehiculares`
  sin la fuente oficial (Anexo IV del Reglamento Nacional de Vehículos) —
  dejarlo en NULL antes que adivinar.
- En **Vercel** la emisión de la GRE es **síncrona** (espera el resultado
  antes de responder) porque la función se apaga al contestar. En un
  servidor normal corre en segundo plano. Lo maneja la opción
  `emisionSincrona` de `ticketService`, autodetectada por la variable
  `VERCEL`.
- Cambios chicos de esquema van en `src/db/migraciones.js` (idempotentes,
  corren al arrancar), no a mano en Supabase.

---

## 9. Lo que falta (hoja de ruta)

### Depende del usuario (no de código)
1. **Desplegar en Vercel.** Todo el código y la config están listos.
   Pasos en `DESPLIEGUE.md`: subir el repo a GitHub, importar en
   vercel.com, cargar 5 variables de entorno (usar la cadena
   **"Transaction pooler"** de Supabase, puerto 6543). Un solo deploy
   publica interfaz + API.

### Depende de terceros
2. **GRE real ante SUNAT.** Contratar un **PSE** (Nubefact, EFACT,
   Bizlinks…) o sacar un certificado digital. Al cambiar a
   `GRE_PROVIDER=pse` hay que completar `EmisorGREPSE.js` con el contrato
   real del proveedor y, probablemente, volver al modelo asíncrono (mejor
   Render/Railway que Vercel para eso).
3. **Piloto** con 1-2 transportistas reales.

### Mejoras de código posibles (nadie las pidió aún)
- Restringir `Access-Control-Allow-Origin` (hoy `*`) al dominio del front.
- `operador` no ve Dashboard hoy; se puede habilitar si lo piden.
- Editar/desactivar usuarios (hoy solo se crean).
- Paginación en listados si una empresa acumula muchos tickets.

---

## 10. Cosas para tener en cuenta (gotchas)

- El archivo **`.env` tiene credenciales reales** (DATABASE_URL de
  Supabase, SESSION_SECRET). Está en `.gitignore`. Al reemplazar carpetas
  del proyecto, cuidarlo.
- El simulador de GRE (`demo`) rechaza ~12% de las emisiones al azar. En
  `sembrar-datos.js` se usa un emisor con `probabilidadRechazo: 0` para
  que la siembra sea predecible.
- El **serie-correlativo** de la GRE en modo demo se reinicia al reiniciar
  el servidor (contador en memoria del simulador). Es esperable: en un PSE
  real lo asigna el proveedor.
- `dni` en la tabla `choferes` es `CHAR` de largo fijo: los repos hacen
  `trim()` al leer.
- Los scripts `probar-unidades-db.js` y `probar-choferes-db.js` **no
  borran** lo que crean (solo lo desactivan); los demás `probar-*` sí
  limpian. `borrar-datos-demo.js` deja limpio todo.
- El schema (`transguia-schema.sql`) **ya está aplicado** en Supabase. No
  hace falta correrlo salvo que se cree un proyecto de base nuevo.
- El prototipo, servido desde el backend, usa rutas relativas
  (`fetch("/api/...")`). Si se abre el `.html` como archivo suelto
  (`file://`) **no funciona**; hay que entrar por `http://localhost:3001`.
  Para apuntar a otro backend en desarrollo:
  `localStorage.setItem("transguia.api", "http://...")` en la consola.

---

## 11. Base de datos (Supabase)

- Proyecto **"TransGuia"**, región São Paulo (`sa-east-1`), organización
  "Proyecto Hub Logístico".
- 10 tablas: `empresas`, `usuarios`, `configuraciones_vehiculares`,
  `unidades`, `choferes`, `documentos_unidad`, `documentos_chofer`,
  `tickets_traslado`, `emisiones_gre`, `historial_estado_ticket`.
- 1 vista: `vencimientos_proximos`.
- 1 secuencia: `transguia_ticket_codigo_seq` (la crea el backend).
- La contraseña de la base se rotó una vez por seguridad.
- Empresa de demo "Transportes Andina S.A.C.", id
  `d8cb77bd-33f4-4efe-8337-70c12002efc9`.

Diagrama de entidades completo en `MODELO-DE-DATOS-Y-API.md`.

---

## 12. Documentos del repo (dónde está cada cosa)

| Archivo | Para qué |
|---|---|
| **`CONTEXTO-SESION.md`** | Este documento. Empezá acá. |
| `PROGRESS.md` | Bitácora detallada paso a paso. Historia de decisiones. |
| `MODELO-DE-DATOS-Y-API.md` | Diagrama de entidades + explicación de cada endpoint. |
| `contrato-api.yaml` | Contrato formal de la API (OpenAPI 3.1). |
| `DESPLIEGUE.md` | Cómo subirlo a Vercel (o Render/Railway). |
| `README.md` | Resumen técnico corto. |
| `transguia-schema.sql` | DDL de la base. |
