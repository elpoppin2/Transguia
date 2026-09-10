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

module.exports = { requiereSesion, requiereRol };
