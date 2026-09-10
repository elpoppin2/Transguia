// Enganche para autocompletar datos por RUC (SUNAT) y por DNI (RENIEC).
//
// TODAVÍA SIN PROVEEDOR: en el formulario esos campos se llenan a mano.
// Cuando se contrate un servicio de consulta (apis.net.pe, decolecta,
// apiperu.dev, u otro), implementar acá `consultarRuc` y `consultarDni`
// —una sola llamada HTTP en cada una— y el formulario ya los usa.
//
// Config esperada por .env cuando exista:
//   CONSULTA_IDENTIDAD_PROVEEDOR=apis.net.pe
//   CONSULTA_IDENTIDAD_TOKEN=xxxxxxxx

const PROVEEDOR = process.env.CONSULTA_IDENTIDAD_PROVEEDOR || null;

/**
 * @returns {Promise<
 *   | { configurado: false }
 *   | { configurado: true, ruc: string, nombre: string, direccion: string|null }
 * >}
 */
async function consultarRuc(ruc) {
  const limpio = String(ruc || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(limpio)) throw new Error('El RUC debe tener 11 dígitos');
  if (!PROVEEDOR) return { configurado: false };
  throw new Error(`Consulta de RUC no implementada para el proveedor "${PROVEEDOR}"`);
}

/**
 * @returns {Promise<
 *   | { configurado: false }
 *   | { configurado: true, dni: string,
 *       apellidoPaterno: string, apellidoMaterno: string,
 *       primerNombre: string, segundoNombre: string|null,
 *       departamento: string|null, provincia: string|null, distrito: string|null }
 * >}
 */
async function consultarDni(dni) {
  const limpio = String(dni || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(limpio)) throw new Error('El DNI debe tener 8 dígitos');
  if (!PROVEEDOR) return { configurado: false };
  throw new Error(`Consulta de DNI no implementada para el proveedor "${PROVEEDOR}"`);
}

module.exports = { consultarRuc, consultarDni, PROVEEDOR };
