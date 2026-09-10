# TransGuía — módulo de emisión de GRE desacoplado

Este backend implementa la parte que discutimos como "interfaz
desacoplada": la creación de un ticket de traslado nunca sabe *cómo*
se emite la GRE-Transportista, solo le pide a un `EmisorGRE` que la
emita. Eso permite arrancar en modo demo hoy mismo y cambiar de
proveedor después sin tocar el resto del sistema.

```
src/
  gre/
    EmisorGRE.js               contrato común (interfaz)
    EmisorGREDemo.js           simulador, funciona sin credenciales (por defecto)
    EmisorGREPSE.js            plantilla para un PSE homologado (Nubefact, EFACT...)
    EmisorGREDirectoSunat.js   esqueleto de integración directa con SUNAT (sin terminar, ver más abajo)
    crearEmisorGRE.js          fábrica: lee GRE_PROVIDER y devuelve la implementación correcta
  tickets/
    ticketService.js           crea tickets y coordina el estado con el emisor, sin conocerlo
demo.js                        prueba de consola, sin dependencias
server.js                      API mínima (Express) para conectar el prototipo web
```

## Probar la demo (sin instalar nada)

```
node demo.js
```

Crea dos tickets de ejemplo, simula el envío a SUNAT con una demora y
un porcentaje de rechazo aleatorio, y muestra por consola cómo cambia
el estado del ticket cuando la GRE queda aceptada o rechazada.

## Levantar la API (para conectarla al prototipo web)

```
npm install
npm start
```

Expone (todo contra la base de datos real de Supabase):

- `POST /api/auth/registro` · `POST /api/auth/login`
- `GET/POST /api/unidades` · `POST /api/unidades/:id/desactivar`
- `GET/POST /api/choferes` · `POST /api/choferes/:id/desactivar`
- `POST /api/tickets` — crea un ticket (body: `empresaId`, `unidadId`,
  `choferId`, `origen`, `destino`, `motivo?`, `descripcionMercancia`,
  `pesoBrutoKg`) y dispara la emisión de la GRE
- `GET /api/tickets?empresaId=...` — lista los tickets de una empresa
- `GET /api/tickets/:id` — detalle de un ticket
- `POST /api/tickets/:id/avanzar` — cambia el estado operativo (body
  `{ estadoOperativo }`: `EN_TRANSITO`, `ENTREGADO`, `ANULADO`)

Ver `PROGRESS.md` para el estado detallado del proyecto.

El prototipo `transguia-prototipo.html` genera los tickets en el
propio navegador (para poder demostrarlo sin backend). Conectarlo a
esta API es cuestión de reemplazar esas funciones por `fetch()` a
estos endpoints — con gusto lo armamos si quieres dar ese siguiente paso.

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

La persistencia ya está: usuarios, unidades, choferes y tickets viven en
Postgres (Supabase). El siguiente paso es conectar
`transguia-prototipo.html` a esta API en vez de simular todo en el
navegador. Detalle en `PROGRESS.md`.

`demo.js` sigue corriendo todo en memoria a propósito, para poder
mostrarlo sin base de datos ni credenciales.
