const { verificarToken } = require('./sesion');

/**
 * Middlewares de Express para proteger rutas.
 *
 *   requiereSesion            -> exige un token válido; deja req.sesion = { usuarioId, empresaId, rol }
 *   requiereRol('admin_empresa') -> exige que req.sesion.rol esté en la lista
 *
 * El empresaId SIEMPRE sale del token, nunca del cuerpo ni de la query:
 * así un usuario no puede leer ni tocar datos de otra empresa.
 */
function requiereSesion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  const sesion = verificarToken(token);
  if (!sesion) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a ingresar.' });
  }
  req.sesion = sesion;
  next();
}

function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.sesion || !rolesPermitidos.includes(req.sesion.rol)) {
      return res.status(403).json({
        error: `Esta acción está reservada para: ${rolesPermitidos.join(', ')}`
      });
    }
    next();
  };
}

/**
 * De qué empresa son los datos que pide esta petición:
 *  - usuario normal (admin_empresa / operador): su propia empresa (del token).
 *  - superadmin: la que indique en ?empresaId=<uuid> (obligatorio).
 * Se usa en las rutas de LECTURA; las de escritura siguen atadas al token.
 */
function empresaDeLaPeticion(req) {
  if (req.sesion.rol === 'superadmin') {
    const id = req.query.empresaId || (req.body && req.body.empresaId);
    if (!id) {
      const e = new Error('Como superadmin, indica la empresa con ?empresaId=<uuid>');
      e.status = 400;
      throw e;
    }
    return String(id);
  }
  return req.sesion.empresaId;
}

module.exports = { requiereSesion, requiereRol, empresaDeLaPeticion };
