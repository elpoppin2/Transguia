const { pool } = require('../db/pool');

/**
 * Mismo contrato que UnidadesRepositorioMemoria, pero contra la tabla
 * `unidades` de Supabase. unidadesService.js no cambia ni una línea al
 * usar esta clase en vez de la de memoria.
 *
 * Traduce los nombres de columna (snake_case en la base) a los nombres
 * que usa el resto del código (camelCase), igual que usuariosRepoPostgres.
 */
const COLUMNAS = `
  id,
  empresa_id            as "empresaId",
  placa,
  marca,
  modelo,
  anio_fabricacion      as "anioFabricacion",
  categoria_mtc         as "categoriaMtc",
  configuracion_vehicular as "configuracionVehicular",
  activo,
  creado_en             as "creadoEn"
`;

class UnidadesRepositorioPostgres {
  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from unidades where empresa_id = $1 order by placa`,
      [empresaId]
    );
    return rows;
  }

  async buscarPorPlaca(placa) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from unidades where placa = $1`,
      [placa]
    );
    return rows[0] || null;
  }

  async buscarPorId(id) {
    const { rows } = await pool.query(
      `select ${COLUMNAS} from unidades where id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async crearUnidad({ empresaId, placa, marca, modelo, anioFabricacion, categoriaMtc, configuracionVehicular }) {
    try {
      const { rows } = await pool.query(
        `insert into unidades
           (empresa_id, placa, marca, modelo, anio_fabricacion, categoria_mtc, configuracion_vehicular)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning ${COLUMNAS}`,
        [empresaId, placa, marca, modelo, anioFabricacion ?? null, categoriaMtc, configuracionVehicular]
      );
      return rows[0];
    } catch (error) {
      throw traducirErrorPostgres(error);
    }
  }

  async cambiarActivo(id, activo) {
    const { rows } = await pool.query(
      `update unidades set activo = $2 where id = $1 returning ${COLUMNAS}`,
      [id, activo]
    );
    if (rows.length === 0) throw new Error('La unidad indicada no existe');
    return rows[0];
  }
}

/**
 * Convierte los códigos de error de Postgres en mensajes que una persona
 * de negocio pueda entender, en vez de dejar salir el error crudo.
 */
function traducirErrorPostgres(error) {
  if (error.code === '23505') {
    return new Error('Ya existe una unidad registrada con esa placa');
  }
  if (error.code === '23503') {
    if (String(error.detail).includes('configuracion_vehicular')) {
      return new Error(
        'La configuración vehicular no es válida: debe ser un código del ' +
        'Anexo IV del RNV (por ejemplo C2, C3, T3S3)'
      );
    }
    if (String(error.detail).includes('empresa_id')) {
      return new Error('La empresa indicada no existe');
    }
  }
  if (error.code === '22P02' && String(error.message).includes('categoria_mtc')) {
    return new Error('La categoría MTC debe ser N1, N2 o N3');
  }
  return error;
}

module.exports = { UnidadesRepositorioPostgres };
