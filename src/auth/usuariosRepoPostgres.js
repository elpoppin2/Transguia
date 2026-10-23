const { pool } = require('../db/pool');

/**
 * Mismo contrato que UsuariosRepositorioMemoria: buscarPorUsername y
 * crearUsuario. authService.js no cambia ni una línea al usar esta
 * clase en vez de la de memoria — es exactamente la idea de la
 * "interfaz desacoplada" que armamos para la GRE, aplicada aquí también.
 */
class UsuariosRepositorioPostgres {
  async buscarPorUsername(username) {
    // El tipo y nombre de la empresa viajan en el login para que la
    // interfaz muestre las pantallas que le tocan (transportista o
    // proveedor). El superadmin no tiene empresa: quedan en null.
    const { rows } = await pool.query(
      `select u.id, u.empresa_id as "empresaId", u.username,
              u.password_hash as "passwordHash", u.nombre_completo as "nombreCompleto", u.rol,
              e.tipo_empresa as "tipoEmpresa", e.razon_social as "empresaRazonSocial"
       from usuarios u
       left join empresas e on e.id = u.empresa_id
       where u.username = $1`,
      [username]
    );
    return rows[0] || null;
  }

  async crearUsuario({ empresaId, username, passwordHash, nombreCompleto, rol }) {
    try {
      const { rows } = await pool.query(
        `insert into usuarios (empresa_id, username, password_hash, nombre_completo, rol)
         values ($1, $2, $3, $4, $5)
         returning id, empresa_id as "empresaId", username,
                   password_hash as "passwordHash", nombre_completo as "nombreCompleto", rol`,
        [empresaId, username, passwordHash, nombreCompleto, rol]
      );
      return rows[0];
    } catch (error) {
      if (error.code === '23503' && String(error.detail).includes('empresa_id')) {
        throw new Error('La empresa indicada no existe (revisa el empresaId)');
      }
      if (error.code === '22P02' && String(error.message).includes('rol_usuario')) {
        throw new Error('El rol debe ser admin_empresa u operador');
      }
      throw error;
    }
  }
}

module.exports = { UsuariosRepositorioPostgres };
