const crypto = require('crypto');

/**
 * Guarda los usuarios en memoria (se pierden al reiniciar el proceso).
 * El día que conectemos la base de datos real, se reemplaza esta clase
 * por una que consulte la tabla `usuarios` de schema.sql — con los
 * mismos dos métodos, para no tocar authService.js.
 */
class UsuariosRepositorioMemoria {
  constructor() {
    this.usuarios = new Map();
  }

  async buscarPorUsername(username) {
    return this.usuarios.get(username) || null;
  }

  async crearUsuario({ empresaId, username, passwordHash, nombreCompleto, rol }) {
    const usuario = {
      id: crypto.randomUUID(),
      empresaId,
      username,
      passwordHash,
      nombreCompleto,
      rol,
      creadoEn: new Date().toISOString()
    };
    this.usuarios.set(username, usuario);
    return usuario;
  }
}

module.exports = { UsuariosRepositorioMemoria };
