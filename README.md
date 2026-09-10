# TransGuía — módulo de emisión de GRE desacoplado

Este backend implementa la parte que discutimos como "interfaz
desacoplada": la creación de un ticket de traslado nunca sabe *cómo*
se emite la GRE-Transportista, solo le pide a un `EmisorGRE` que la
emita. Eso permite arrancar en modo demo hoy mismo y cambiar de
proveedor después sin tocar el resto del sistema.

```
src/
  auth/        registro/login, hash de contraseña, token de sesión (HMAC), middleware de rol
  empresas/    vistas de plataforma para el superadmin (listar/crear empresas, totales)
  dashboard/   métricas agregadas para la pestaña Dashboard (gráficos)
  unidades/    alta/listado/baja de vehículos + validaciones del MTC
  choferes/    alta/listado/baja de choferes
  documentos/  papeles con vencimiento (SOAT, licencias...) + vista de vencimientos
  tickets/     ticketService (orquesta) + repos memoria/postgres
  gre/         interfaz EmisorGRE + implementaciones (demo / pse / directo)
  db/          pool de conexión a Postgres + transacciones + migraciones idempotentes
  app.js       arma la app Express (rutas + servicios + sirve el prototipo en /), sin listen
server.js                 levanta la app como proceso normal (local / Render / Railway)
api/index.js              entrada para Vercel (misma app, serverless)
transguia-prototipo.html  interfaz de una sola página; la sirve el backend en /
sembrar-datos.js          carga una demo completa en la base
crear-empresa.js          crea una empresa nueva + su primer admin
probar-todo.js            corre todos los scripts de prueba (npm run probar)
contrato-api.yaml         contrato OpenAPI 3.1
MODELO-DE-DATOS-Y-API.md  diagrama de entidades + explicación de endpoints
DESPLIEGUE.md             cómo subirlo a Render / Railway
```

## Arrancar en local

```
npm install
cp .env.example .env      # y completar DATABASE_URL y SESSION_SECRET
npm start                 # interfaz + API en http://localhost:3001
npm run sembrar           # empresa + usuario andina/demo2026seguro + datos de demo
```

Después, abrir **http://localhost:3001** en el navegador e ingresar con
`andina` / `demo2026seguro`. El backend sirve el prototipo; no hay que
configurar ninguna URL de API.

```
npm run probar            # corre todas las pruebas contra la base real
npm run demo              # demo de consola, todo en memoria, sin base ni credenciales
```

## API (resumen)

Público: `GET /api/health`, `POST /api/auth/login`. Todo lo demás exige
`Authorization: Bearer <token>` (el token lo da el login, dura 12 h). El
`empresaId` sale del token. Rutas de configuración: solo rol
`admin_empresa`. Rol `superadmin`: ve todas las empresas y consulta
cualquiera con `?empresaId=<uuid>` (solo lectura).

- **Auth:** `POST /api/auth/login`, `POST /api/auth/registro` *(admin)*
- **Plataforma *(superadmin)*:** `GET /api/resumen`, `GET/POST /api/empresas`
- **Dashboard *(admin / superadmin)*:** `GET /api/dashboard?agrupar=dia|mes`
- **Unidades:** `GET/POST /api/unidades`, `POST /api/unidades/:id/desactivar`,
  `GET/POST/DELETE /api/unidades/:id/documentos[/:docId]`
- **Choferes:** `GET/POST /api/choferes`, `POST /api/choferes/:id/desactivar`,
  `GET/POST/DELETE /api/choferes/:id/documentos[/:docId]`
- **Vencimientos:** `GET /api/vencimientos?dias=30`
- **Tickets:** `GET/POST /api/tickets`, `GET /api/tickets/:id`,
  `POST /api/tickets/:id/avanzar`

El detalle completo (cuerpos, respuestas, roles) está en
`contrato-api.yaml` y `MODELO-DE-DATOS-Y-API.md`. Estado del proyecto en
`PROGRESS.md`.

## Cambiar de proveedor

Todo pasa por la variable `GRE_PROVIDER` en tu `.env` (copia
`.env.example`):

| Valor     | Qué hace                                                                 |
|-----------|---------------------------------------------------------------------------|
| `demo`    | Simula la respuesta de SUNAT. No requiere nada más. Es el valor por defecto. |
| `pse`     | Llama a un PSE homologado por REST. Requiere completar `EmisorGREPSE.js` con el contrato real de tu proveedor (cada uno es distinto) y sus credenciales en `.env`. |
| `directo` | Integración directa con los webservices de SUNAT. **No está implementada** — ver la nota abajo. |

## Sobre `EmisorGREDirectoSunat`

A propósito lo dejamos sin terminar. Implementarlo de verdad requiere:

1. Ser emisor electrónico habilitado ante SUNAT y tener certificado digital vigente.
2. Generar el XML de la GRE en formato UBL 2.1 exactamente como lo pide el Manual del Programador de SUNAT.
3. Firmarlo digitalmente (XMLDSig).
4. Enviarlo por SOAP al ambiente beta de SUNAT primero, y procesar el CDR de respuesta.

Nada de eso se puede probar sin tus credenciales reales, así que en vez
de simular algo que parecería funcionar sin estarlo, dejamos la clase
lanzando un error explícito. Si más adelante van por esta vía, conviene
apoyarse en una librería especializada en facturación electrónica
peruana para los pasos 2 y 3 en vez de construir el XML a mano.

## Siguiente paso sugerido

Todo el código está: persistencia real, autenticación con roles,
documentos y vencimientos, prototipo conectado, y adaptado para
**Vercel** (`api/index.js` + `vercel.json`). El siguiente paso es
**desplegarlo** — ver `DESPLIEGUE.md`. Después: contratar un PSE /
certificado para la GRE real, y pilotear.

`demo.js` sigue corriendo todo en memoria a propósito, para poder
mostrarlo sin base de datos ni credenciales.
