const crypto = require('crypto');

/**
 * scrypt viene incluido en Node.js — no hace falta instalar nada para esto.
 * Nunca guardamos la contraseña, solo un hash del que es prácticamente
 * imposible reconstruir la contraseña original.
 */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verificarPassword(password, hashGuardado) {
  return new Promise((resolve, reject) => {
    const [salt, hashOriginal] = hashGuardado.split(':');
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      const a = Buffer.from(derivedKey.toString('hex'), 'hex');
      const b = Buffer.from(hashOriginal, 'hex');
      resolve(a.length === b.length && crypto.timingSafeEqual(a, b));
    });
  });
}

module.exports = { hashPassword, verificarPassword };
