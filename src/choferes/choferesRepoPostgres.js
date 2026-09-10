const { pool } = require('../db/pool');

/**
 * Mismo contrato que ChoferesRepositorioMemoria, pero contra la tabla
 * `choferes` de Supabase. choferesService.js no cambia al usar esta
 * clase en vez de la de memoria.
 *
 * Nota: en la base, `dni` es CHAR de largo fijo, así que puede venir con
 * espacios al final ("12345678  "). Lo recortamos al leer con trim().
 */
const COLUMNAS = `
  id,
  empresa_id   as "empresaId",
  trim(dni)    as dni,
  nombres,
  apellidos,
  activo,
  creado_en    as "creadoEn"
`;

class ChoferesRepositorioPostgres {
  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from choferes where empresa_id = $1 order by apellidos, nombres`,
      [empresaId]
    );
    return rows;
  }

  async buscarPorDni(empresaId, dni) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from choferes where empresa_id = $1 and trim(dni) = $2`,
      [empresaId, dni]
    );
    return rows[0] || null;
  }

  async buscarPorId(id) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from choferes where id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async crearChofer({ empresaId, dni, nombres, apellidos }) {
    try {
      const { rows } = await pool.query(
        `insert into choferes (empresa_id, dni, nombres, apellidos)
         values ($1, $2, $3, $4)
         returning ${COLUMNAS}`,
        [empresaId, dni, nombres, apellidos]
      );
      return rows[0];
    } catch (error) {
      throw traducirErrorPostgres(error);
    }
  }

  async cambiarActivo(id, activo) {
    const { rows } = await pool.query(
      `update choferes set activo = $2 where id = $1 returning ${COLUMNAS}`,
      [id, activo]
    );
    if (rows.length === 0) throw new Error('El chofer indicado no existe');
    return rows[0];
  }
}

function traducirErrorPostgres(error) {
  if (error.code === '23505') {
    return new Error('Ya existe un chofer con ese DNI en esta empresa');
  }
  if (error.code === '23503' && String(error.detail).includes('empresa_id')) {
    return new Error('La empresa indicada no existe');
  }
  return error;
}

module.exports = { ChoferesRepositorioPostgres };
