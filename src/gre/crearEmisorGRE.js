const { EmisorGREDemo } = require('./EmisorGREDemo');
const { EmisorGREPSE } = require('./EmisorGREPSE');
const { EmisorGREDirectoSunat } = require('./EmisorGREDirectoSunat');

/**
 * Único lugar del código que sabe qué proveedor concreto existe.
 * Todo lo demás (ticketService, rutas de la API, la interfaz web)
 * solo debería trabajar contra la clase EmisorGRE.
 *
 * Cambiar de proveedor en producción es cambiar GRE_PROVIDER en el
 * .env — no tocar ticketService.js ni las rutas.
 */
function crearEmisorGRE(env = process.env) {
  const proveedor = env.GRE_PROVIDER || 'demo';

  switch (proveedor) {
    case 'demo':
      return new EmisorGREDemo({
        serie: env.GRE_SERIE || 'T001',
        correlativoInicial: Number(env.GRE_CORRELATIVO_INICIAL || 1)
      });

    case 'pse':
      return new EmisorGREPSE({
        baseUrl: env.PSE_BASE_URL,
        apiToken: env.PSE_API_TOKEN,
        rucEmisor: env.RUC_EMISOR
      });

    case 'directo':
      return new EmisorGREDirectoSunat({
        certificadoPath: env.SUNAT_CERTIFICADO_PATH,
        certificadoPassword: env.SUNAT_CERTIFICADO_PASSWORD,
        rucEmisor: env.RUC_EMISOR,
        ambiente: env.SUNAT_AMBIENTE || 'beta'
      });

    default:
      throw new Error(`GRE_PROVIDER desconocido: "${proveedor}" (usa demo | pse | directo)`);
  }
}

module.exports = { crearEmisorGRE };
