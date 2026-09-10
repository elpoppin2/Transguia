// Servidor de TransGuía para correr como proceso normal (local, Render,
// Railway...). Para Vercel se usa api/index.js, que reusa la misma app.
//
// Ejecutar con:  node server.js   (o  npm start)

require('dotenv').config();
const { app, prepararEsquema, emisionSincrona } = require('./src/app');

const PUERTO = process.env.PORT || 3001;

prepararEsquema()
  .then(() => {
    app.listen(PUERTO, () => {
      console.log(`TransGuía en http://localhost:${PUERTO}  (interfaz web y API)`);
      console.log(`Proveedor de GRE activo: ${process.env.GRE_PROVIDER || 'demo'}` +
        (emisionSincrona ? ' (emisión síncrona)' : ''));
      if (!process.env.SESSION_SECRET) {
        console.warn('AVISO: SESSION_SECRET no está definido en .env — usando el secreto de desarrollo (NO usar en producción).');
      }
    });
  })
  .catch((error) => {
    console.error('No se pudo preparar la base de datos al arrancar:', error.message);
    process.exit(1);
  });
