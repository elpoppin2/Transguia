# Desplegar TransGuía

La base de datos (Supabase) ya está en la nube. Falta subir **el backend**
a **Vercel** (elegido). La interfaz (`transguia-prototipo.html`) **la sirve
el propio backend** en `/`, así que con un solo despliegue quedan la web y
la API juntas, en el mismo dominio, sin configurar ninguna URL.

---

## Parte 0 — Subir el código a GitHub (una vez)

```bash
git add .
git commit -m "listo para desplegar"
# crear un repo vacío en github.com y luego:
git remote add origin https://github.com/TU-USUARIO/transguia-backend.git
git push -u origin main
```

> El `.env` **no se sube** (está en `.gitignore`). Las credenciales se
> cargan en el panel de Vercel.

---

## Parte 1 — Backend en Vercel

El repo ya trae lo necesario: `api/index.js` (punto de entrada) y
`vercel.json` (enruta todo a esa función). El código detecta que corre en
Vercel y se adapta solo (emisión de GRE síncrona, pool de 1 conexión).

### 1.1 Cadena de conexión correcta

En Supabase → **Connect** → pestaña **Transaction pooler** (puerto
**6543**, no el 5432). Copiar esa cadena; es la que va en `DATABASE_URL`
en Vercel. *(El transaction pooler es el que conviene para serverless.)*

### 1.2 Importar el proyecto

1. <https://vercel.com> → **Add New → Project** → importar el repo de GitHub.
2. **Framework Preset:** *Other*. No tocar Build/Output (los define `vercel.json`).
3. **Environment Variables** — agregar:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La cadena **Transaction pooler** (puerto 6543) |
   | `SESSION_SECRET` | Cadena larga aleatoria: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `GRE_PROVIDER` | `demo` |
   | `GRE_SERIE` | `T001` |
   | `GRE_CORRELATIVO_INICIAL` | `160` |

   `PORT` no se define (Vercel lo maneja). `VERCEL` la pone Vercel sola.

4. **Deploy.** Al terminar da una URL tipo
   `https://transguia-backend.vercel.app`.

### 1.3 Probar

- `https://TU-URL.vercel.app/api/health` → `{"ok":true,...}`
- `https://TU-URL.vercel.app/` → la interfaz de TransGuía (login).

> La primera petición tras un rato de inactividad tarda ~1–2 s (arranque
> en frío). Normal en serverless y suficiente para el piloto.

---

## Parte 2 — Datos iniciales (una vez)

Desde tu computadora (el `.env` local ya apunta al mismo Supabase):

```bash
node sembrar-datos.js
# o para una empresa real:
node crear-empresa.js <RUC> "<Razón social>" <usuario> <contraseña> "<Nombre>"
```

---

## Parte 3 — La interfaz

No hay nada que hacer: **ya está publicada** en la misma URL del
despliegue (`https://TU-URL.vercel.app/`). Repartís ese link a las
personas del piloto y entran con su usuario y contraseña.

---

## Alternativa — Backend en Render o Railway

Si algún día se prefiere un servidor "siempre prendido" (por ejemplo al
pasar a un PSE real, donde la emisión puede tardar):

- **Render:** New → Web Service → repo de GitHub. Build `npm install`,
  Start `npm start`. Variables: las mismas de arriba **pero con la cadena
  "Session pooler" (puerto 5432)**. No definir `EMISION_SINCRONA` (queda
  en segundo plano, que es lo ideal ahí).
- **Railway:** New Project → Deploy from GitHub. Detecta Node solo.
  Mismas variables. *Generate Domain* para la URL.

El `Procfile` (`web: node server.js`) sirve para ambos.

---

## Cuando se pase a la GRE real (`GRE_PROVIDER=pse` o `directo`)

- Revisar si conviene volver al modelo asíncrono (servidor en Render/
  Railway) en vez de Vercel: una emisión real puede tardar y bloquear la
  petición / llegar al límite de tiempo de la función.
- Las credenciales del PSE o el `.pfx` del certificado van como variables
  de entorno / secreto del hosting, nunca en el repo.

---

## Checklist de seguridad

- [ ] `SESSION_SECRET` con un valor propio y largo (no el de desarrollo).
- [ ] `.env` nunca subido a Git (`git status` no debe listarlo).
- [ ] Contraseña de Supabase rotada si alguna vez se compartió.
- [ ] (Más adelante) Restringir `Access-Control-Allow-Origin` en
      `src/app.js` al dominio del prototipo, en vez de `*`.
