const crypto = require('crypto');

/**
 * Sesiones sin dependencias externas: un token firmado con HMAC-SHA256.
 * El token lleva dentro { usuarioId, empresaId, rol, exp } en claro
 * (base64) + una firma. No se puede falsificar sin el secreto, pero
 * tampoco lleva nada sensible (ni la contraseña ni su hash).
 *
 * Es "stateless": no hay tabla de sesiones, así que sirve igual aunque
 * el servidor se reinicie o corra en varias instancias. A cambio, no se
 * puede revocar un token antes de que expire (12 h). Suficiente para el
 * piloto; si más adelante hace falta cerrar sesión de verdad, se agrega
 * una tabla de tokens revocados.
 *
 * El secreto sale de SESSION_SECRET (.env). En desarrollo hay un valor
 * por defecto; en producción SIEMPRE hay que definir uno propio.
 */
const SECRETO = process.env.SESSION_SECRET || 'transguia-desarrollo-cambia-este-secreto';
const DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas

function b64url(entrada) {
  return Buffer.from(entrada).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function desdeB64url(texto) {
  return Buffer.from(texto.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function firmar(texto) {
  return b64url(crypto.createHmac('sha256', SECRETO).update(texto).digest());
}

function crearToken({ usuarioId, empresaId, rol }) {
  const cuerpo = b64url(JSON.stringify({
    usuarioId, empresaId, rol, exp: Date.now() + DURACION_MS
  }));
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/**
 * Devuelve { usuarioId, empresaId, rol } si el token es válido y no
 * expiró; null en cualquier otro caso.
 */
function verificarToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = firmar(cuerpo);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let datos;
  try { datos = JSON.parse(desdeB64url(cuerpo).toString('utf8')); }
  catch (_) { return null; }

  if (!datos || typeof datos.exp !== 'number' || Date.now() > datos.exp) return null;
  return { usuarioId: datos.usuarioId, empresaId: datos.empresaId, rol: datos.rol };
}

module.exports = { crearToken, verificarToken, DURACION_MS };
