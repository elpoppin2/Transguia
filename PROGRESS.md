# TransGuía — Estado del proyecto (léeme primero)

## Qué es esto
Plataforma logística para transportistas peruanos: registro de unidades y
choferes según normativa del MTC, generación de tickets de traslado
vinculados a la Guía de Remisión Electrónica (GRE-Transportista) de SUNAT,
y seguimiento de despacho / tránsito / entrega.

## Sobre la persona que lidera esto
Es analista de Supply Chain, no viene de sistemas. Hasta ahora hemos
avanzado paso a paso, con explicaciones no técnicas, confirmando cada
resultado (con capturas de pantalla) antes de seguir al siguiente paso.
Por favor mantén ese mismo estilo: explica en términos simples, no des
por sentado vocabulario técnico, y confirma antes de hacer cambios
grandes o instalar cosas nuevas.

## Entorno
- Windows. Proyecto en `E:\Proyecto\transguia-backend`
- Node.js, VS Code y Git ya instalados y verificados
- Base de datos: proyecto de Supabase (Postgres) ya creado — nombre
  "TransGuia", región São Paulo (sa-east-1), organización "Proyecto Hub
  Logístico"
- El schema completo (`transguia-schema.sql`) ya se ejecutó ahí: las 10
  tablas + 1 vista (`vencimientos_proximos`) ya existen en Supabase

## Qué existe hoy en el código
- `server.js` — API Express. Rutas de salud, auth, unidades, choferes,
  documentos, vencimientos y tickets. **Con autenticación**: todo exige
  `Authorization: Bearer <token>` salvo `/api/health` y `/api/auth/login`;
  el `empresaId` sale del token. Rol `operador` vs `admin_empresa`.
- `src/auth/sesion.js` — token de sesión firmado con HMAC (sin librerías,
  sin tabla; dura 12 h). Secreto en `SESSION_SECRET` del `.env`.
- `src/auth/middleware.js` — `requiereSesion` y `requiereRol(...)`.
- `src/documentos/` — SOAT, revisión técnica, licencias, certificados
  médicos (tablas `documentos_unidad` / `documentos_chofer`) + la vista
  `vencimientos_proximos`. La licencia vigente del chofer se manda en la GRE.
- `src/gre/` — interfaz desacoplada para emitir la GRE:
  - `EmisorGRE.js` (contrato común)
  - `EmisorGREDemo.js` (simulador, funciona sin credenciales — el activo
    hoy, vía `GRE_PROVIDER=demo`)
  - `EmisorGREPSE.js` (plantilla para un PSE real tipo Nubefact/EFACT,
    con TODOs marcados)
  - `EmisorGREDirectoSunat.js` (sin implementar a propósito — requiere
    certificado digital real y no se puede probar sin él)
- Patrón repetido en `src/auth/`, `src/unidades/`, `src/choferes/`,
  `src/tickets/`: un `...Service.js` con las reglas de negocio + dos
  repositorios con el mismo contrato (`...RepoMemoria.js` y
  `...RepoPostgres.js`). El servicio no sabe cuál usa. **Todos los
  servicios ya usan Postgres real; la versión en memoria queda para
  `demo.js` y pruebas.**
- `src/db/pool.js` — conexión a Supabase + helper `enTransaccion()` para
  escrituras que tocan varias tablas.
- `transguia-schema.sql` — DDL completo, ya corrido en Supabase. (Además,
  `server.js`/los scripts crean la secuencia `transguia_ticket_codigo_seq`
  si no existe — es el correlativo de `codigo_interno`.)
- `transguia-prototipo.html` — interfaz de una sola página (sin build ni
  dependencias). **La sirve el propio backend** en `/` (mismo origen que
  la API, llamadas relativas `fetch("/api/...")`, cero configuración).
  Login con token, pestañas de unidades, choferes, tickets, vencimientos
  y (solo admin) usuarios; gestión de documentos por unidad/chofer.
- `contrato-api.yaml` — contrato de la API en OpenAPI 3.1 (pegable en
  editor.swagger.io).
- `MODELO-DE-DATOS-Y-API.md` — diagrama de entidades + para qué sirve
  cada endpoint.
- `DESPLIEGUE.md` — guía para subir el backend a Render / Railway.
- Repo Git iniciado; `.gitignore` protege `.env`, `node_modules/` y
  `certificados/`. `Procfile` para el hosting.
- Scripts de prueba contra la base real (`probar-*.js`, todos limpian lo
  que crean salvo los de unidades/choferes que solo desactivan);
  `probar-todo.js` los corre en fila (`npm run probar`).
- Scripts de datos: `sembrar-datos.js` (demo completa, idempotente),
  `borrar-datos-demo.js` (la borra), `crear-empresa.js` (empresa nueva +
  su primer admin).

## Dónde quedamos (siguiente paso inmediato)

Todo lo que es **código** de la hoja de ruta está hecho (puntos 5, 6, y
los extras de sesiones/roles y documentos). El proyecto corre entero
contra Supabase real y pasa `npm run probar`.

**Siguiente paso: punto 7 — desplegar** el backend en Render o Railway.
Requiere una cuenta del usuario; los pasos están en `DESPLIEGUE.md`. El
usuario todavía no eligió plataforma.

Después quedan cosas que dependen de terceros (punto 8: contratar un PSE
o certificado digital; punto 9: piloto con transportistas reales).

### Para levantar y demostrar ahora mismo (local)
1. `node server.js`
2. `node sembrar-datos.js` — empresa + usuario `andina`/`demo2026seguro`
   + 4 unidades + 4 choferes + documentos + 2 tickets. Idempotente.
3. Abrir **http://localhost:3001** en el navegador. El backend sirve la
   interfaz; ya no hay que configurar ninguna URL de API (las llamadas
   son relativas al mismo servidor).
4. `node borrar-datos-demo.js` — limpia lo sembrado (`--empresa` borra
   también la empresa).

## Después de eso (hoja de ruta pendiente, en orden)
5. Repetir el patrón de `usuariosRepoPostgres.js` para unidades, choferes
   y `tickets_traslado`:
   - [x] **Unidades** (hecho el 2026-09-08). Nuevos archivos en
     `src/unidades/`: `unidadesService.js` (validación: placa peruana
     3+3, categoría MTC N1/N2/N3, año 1970–actual, config. vehicular del
     Anexo IV), `unidadesRepoMemoria.js` y `unidadesRepoPostgres.js`
     (mismo contrato). Endpoints en `server.js`: `GET/POST /api/unidades`
     y `POST /api/unidades/:id/desactivar` (baja lógica, campo `activo`).
     Prueba: `node probar-unidades-db.js` (pasó). Deja unidades de prueba
     `TGx-xxx` inactivas en Supabase, borrables.
   - [x] **Choferes** (hecho el 2026-09-08). Archivos en `src/choferes/`:
     `choferesService.js` (valida DNI de 8 dígitos), `choferesRepoMemoria.js`
     y `choferesRepoPostgres.js`. Endpoints en `server.js`:
     `GET/POST /api/choferes` y `POST /api/choferes/:id/desactivar`.
     `dni` en la base es CHAR fijo → los repos hacen `trim()` al leer.
     UNIQUE es por (empresa_id, dni), así que `buscarPorDni` recibe
     empresaId. Prueba: `node probar-choferes-db.js` (pasó). Solo cubre
     identidad del chofer; sus documentos/licencias (tabla
     `documentos_chofer`) son un paso aparte pendiente.
   - [x] **tickets_traslado** (hecho el 2026-09-08). `ticketService.js`
     reescrito a pura orquestación: constructor ahora recibe un objeto
     `{ emisorGRE, repositorioTickets, repositorioUnidades,
     repositorioChoferes, proveedorGre }`. Nuevos
     `ticketsRepoMemoria.js` / `ticketsRepoPostgres.js`. Un ticket vive
     en 3 tablas (tickets_traslado + emisiones_gre +
     historial_estado_ticket); las escrituras multi-tabla van en
     transacción.
     - **Decisión (opción B):** al crear un ticket se pasan `unidadId` y
       `choferId` (la unidad y el chofer deben estar registrados antes).
       El servicio valida que existan, sean de la empresa y estén activos.
     - `creado_por` y `historial_estado_ticket.usuario_id` ahora se
       llenan con el usuario del token (ver "Sesiones y roles" abajo).
     - Se escribe `historial_estado_ticket` en cada cambio de estado.
     - `motivo` libre → enum (`VENTA` / `TRASLADO_ENTRE_ESTABLECIMIENTOS`
       / `OTROS`); vacío = `VENTA`, no reconocido = `OTROS`.
     - `codigo_interno` = `TCK-` + secuencia Postgres (no se repite).
     - Regla mantenida: solo se avanza de estado si la GRE fue `ACEPTADO`
       (excepto `ANULADO`).
     - `choferLicencia`: el servicio busca la licencia de conducir
       vigente del chofer (módulo de documentos) y la manda en la GRE.
     - Endpoints (ver `contrato-api.yaml`): `GET/POST /api/tickets`,
       `GET /api/tickets/:id`, `POST /api/tickets/:id/avanzar`.
       Prueba: `node probar-tickets-db.js` (pasó).
6. [x] **Prototipo web conectado** (2026-09-08). `transguia-prototipo.html`
   creado de cero (el original nunca estuvo en el repo): archivo único,
   sin build, login con token, pestañas unidades / choferes / tickets /
   vencimientos / usuarios, gestión de documentos por fila. URL de la API
   editable y guardada en `localStorage`.
6b. [x] **Sesiones y roles** (2026-09-09). Token HMAC (`src/auth/sesion.js`),
   middleware `requiereSesion` / `requiereRol`. El `empresaId` sale del
   token; `operador` no puede tocar configuración (403). Login devuelve
   `token`. Registro de usuarios pasa a ser (admin) y entra a la empresa
   del que lo crea. `crear-empresa.js` para el primer admin de una empresa.
6c. [x] **Documentos y vencimientos** (2026-09-09). `src/documentos/`
   (SOAT, revisión técnica, licencias, certificados médicos) + endpoint
   `GET /api/vencimientos` sobre la vista `vencimientos_proximos`. La
   licencia vigente del chofer va en la GRE. Prueba: `probar-documentos-db.js`.
6d. [x] **Preparación de despliegue** (2026-09-09). `.gitignore`, `Procfile`,
   `engines`, `GET /api/health`, `SESSION_SECRET`, repo Git.
6e. [x] **Listo para Vercel** (2026-09-09, decisión del usuario). La app
   Express se movió a `src/app.js` (sin `listen`); `server.js` la
   levanta como proceso normal y `api/index.js` + `vercel.json` la
   sirven como función serverless. En Vercel (autodetectado por la
   variable `VERCEL`): emisión de GRE **síncrona** — `ticketService`
   tiene la opción `emisionSincrona` y espera el resultado antes de
   responder, porque la función se apaga al contestar; el esquema se
   prepara en la 1ª petición; el pool `pg` usa `max: 1` y hace falta la
   cadena **Transaction pooler** (6543) de Supabase. Con `demo` es
   instantáneo. Pasos en `DESPLIEGUE.md`.
6f. [x] **Front y back integrados** (2026-09-09, decisión del usuario).
   `src/app.js` sirve `transguia-prototipo.html` en `/`, `/index.html` y
   `/prototipo`. El prototipo hace `fetch("/api/...")` relativo (default
   `estado.api = ""`); se quitó el campo "API" del header. Un solo
   despliegue = front + API. `vercel.json` incluye el HTML en el bundle
   de la función (`includeFiles`). Para desarrollo se puede apuntar a
   otro backend con `localStorage.setItem("transguia.api", "...")`.
7. **(pendiente — necesita cuenta del usuario)** Deploy a Vercel. Todo el
   código y la config están; solo falta importar el repo en vercel.com y
   cargar las variables de entorno. **Un solo deploy** publica la
   interfaz y la API juntas. Guía en `DESPLIEGUE.md`.
8. **(pendiente — externo)** Conseguir un PSE (Nubefact, EFACT…) o
   certificado digital para emitir la GRE real ante SUNAT.
9. **(pendiente — externo)** Pilotear con 1-2 transportistas reales.

## Decisiones de diseño a respetar
- Todo lo relacionado a la emisión de la GRE pasa por la interfaz
  `EmisorGRE` — nunca acoplar `ticketService.js` a un proveedor
  específico de forma directa
- Nunca guardar contraseñas en texto plano
- El `empresaId` de una petición SIEMPRE sale del token de sesión, nunca
  de la query ni del cuerpo — así un usuario no puede ver datos de otra
  empresa
- En producción `SESSION_SECRET` debe tener un valor propio y largo; el
  `.env` nunca se sube al repo
- No inventar valores de `peso_bruto_maximo_kg` en
  `configuraciones_vehiculares` sin la fuente oficial (Anexo IV del
  Reglamento Nacional de Vehículos) — dejarlo en NULL antes que adivinar
- Antes de reemplazar carpetas completas del proyecto, avisar si hay
  riesgo de perder el archivo `.env` (contiene credenciales reales)
