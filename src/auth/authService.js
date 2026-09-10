const { hashPassword, verificarPassword } = require('./password');

class AuthService {
  /**
   * @param {{ buscarPorUsername: Function, crearUsuario: Function }} repositorioUsuarios
   */
  constructor(repositorioUsuarios) {
    this.repo = repositorioUsuarios;
  }

  async registrarUsuario({ empresaId, username, password, nombreCompleto, rol = 'operador' }) {
    if (!empresaId || !username || !password || !nombreCompleto) {
      throw new Error('empresaId, username, password y nombreCompleto son obligatorios');
    }
    if (password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    const existente = await this.repo.buscarPorUsername(username);
    if (existente) {
      throw new Error('Ese nombre de usuario ya está en uso');
    }

    const passwordHash = await hashPassword(password);
    const usuario = await this.repo.crearUsuario({ empresaId, username, passwordHash, nombreCompleto, rol });

    // Nunca devolvemos passwordHash, ni siquiera al front-end propio.
    return { id: usuario.id, username: usuario.username, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol };
  }

  async validarCredenciales(username, password) {
    const usuario = await this.repo.buscarPorUsername(username);
    if (!usuario) return null; // no reveles si el usuario existe o no

    const coincide = await verificarPassword(password, usuario.passwordHash);
    if (!coincide) return null;

    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      username: usuario.username,
      nombreCompleto: usuario.nombreCompleto,
      rol: usuario.rol
    };
  }
}

module.exports = { AuthService };
