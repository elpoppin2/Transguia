// Punto de entrada para Vercel (funciones serverless).
// Reusa exactamente la misma app Express que server.js.
//
// El esquema se prepara en la primera petición (middleware en src/app.js).
// La emisión de la GRE es síncrona en Vercel (ver src/app.js) porque la
// función se apaga apenas responde.

require('dotenv').config();
const { app } = require('../src/app');

module.exports = app;
