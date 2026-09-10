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
- `server.js` — API Express con endpoints de auth, unidades, choferes y
  tickets. Al arrancar prepara la secuencia del código de ticket.
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
  dependencias) YA conectada a la API real de `server.js` vía `fetch`.
- `contrato-api.yaml` — contrato de la API en formato OpenAPI 3.1
  (pegable en editor.swagger.io para ver la documentación).
- Scripts de prueba contra la base real: `probar-conexion-db.js` (auth),
  `probar-unidades-db.js`, `probar-choferes-db.js`, `probar-tickets-db.js`
  (este último limpia lo que crea).
- Scripts de datos: `sembrar-datos.js` (carga una demo completa,
  idempotente) y `borrar-datos-demo.js` (la borra).

## Dónde quedamos (siguiente paso inmediato)
El registro/login de usuarios YA está conectado a la base de datos real
(hecho el 2026-09-08):
1. [x] Archivo `.env` creado con el `DATABASE_URL` real ("Session
   pooler" de Supabase, contraseña rotada una vez)
2. [x] `npm install` corrido (`pg` y `dotenv` instalados)
3. [x] Empresa de prueba insertada en Supabase ("Transportes Andina
   S.A.C.", id `d8cb77bd-33f4-4efe-8337-70c12002efc9`)
4. [x] `node probar-conexion-db.js` pasó: conexión OK, usuario creado y
   login verificado contra la base real. Nota: dejó un usuario de prueba
   `prueba_1788924673620` en la tabla `usuarios` (borrable).

Siguiente paso inmediato: punto 7 — subir el backend a internet (Render o
Railway). Puntos 5 y 6 ya están hechos.

### Para levantar y demostrar ahora mismo (local)
1. `node server.js` — API en http://localhost:3001
2. `node sembrar-datos.js` — deja empresa + usuario + 4 unidades + 4
   choferes + 2 tickets. Idempotente. Login del prototipo:
   usuario `andina`, contraseña `demo2026seguro`.
3. Abrir `transguia-prototipo.html` en el navegador (doble clic). El
   campo "API" arriba a la derecha ya apunta a localhost:3001.
4. `node borrar-datos-demo.js` — limpia todo lo sembrado (agrega
   `--empresa` para borrar también la empresa).

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
     - `creado_por` se deja NULL por ahora (falta sesión de usuario real).
     - Se escribe `historial_estado_ticket` en cada cambio de estado.
     - `motivo` libre → enum (`VENTA` / `TRASLADO_ENTRE_ESTABLECIMIENTOS`
       / `OTROS`); vacío = `VENTA`, no reconocido = `OTROS`.
     - `codigo_interno` = `TCK-` + secuencia Postgres (no se repite).
     - Regla mantenida: solo se avanza de estado si la GRE fue `ACEPTADO`
       (excepto `ANULADO`).
     - `choferLicencia` va en null al emisor (TODO: sacarla de
       `documentos_chofer` cuando se implemente esa tabla).
     - Endpoints: `POST /api/tickets` (body con `empresaId`, `unidadId`,
       `choferId`, `origen`, `destino`, `motivo?`, `descripcionMercancia`,
       `pesoBrutoKg`), `GET /api/tickets?empresaId=...`,
       `GET /api/tickets/:id`, `POST /api/tickets/:id/avanzar` (body
       `{ estadoOperativo }`). Prueba: `node probar-tickets-db.js` (pasó).
6. [x] **Prototipo web conectado** (hecho el 2026-09-08). El
   `transguia-prototipo.html` original nunca estuvo en el repo, así que
   se creó de cero: archivo único, sin dependencias ni build, con login,
   alta de unidades/choferes y creación de tickets (con dropdowns de
   unidad/chofer y sondeo del estado de la GRE). Habla con la API real
   vía `fetch`; la URL base es editable y se guarda en `localStorage`.
   Scripts de datos nuevos: `sembrar-datos.js` (idempotente) y
   `borrar-datos-demo.js`. Contrato de la API en `contrato-api.yaml`
   (OpenAPI 3.1).
7. Subir el backend a internet (Render o Railway) para que no dependa
   de que la computadora de la persona esté prendida
8. Conseguir un PSE (Nubefact, EFACT, etc.) o certificado digital para
   emitir la GRE real ante SUNAT (hoy solo está simulada)
9. Pilotear con 1-2 transportistas reales antes de escalar

## Decisiones de diseño a respetar
- Todo lo relacionado a la emisión de la GRE pasa por la interfaz
  `EmisorGRE` — nunca acoplar `ticketService.js` a un proveedor
  específico de forma directa
- Nunca guardar contraseñas en texto plano
- No inventar valores de `peso_bruto_maximo_kg` en
  `configuraciones_vehiculares` sin la fuente oficial (Anexo IV del
  Reglamento Nacional de Vehículos) — dejarlo en NULL antes que adivinar
- Antes de reemplazar carpetas completas del proyecto, avisar si hay
  riesgo de perder el archivo `.env` (contiene credenciales reales)
