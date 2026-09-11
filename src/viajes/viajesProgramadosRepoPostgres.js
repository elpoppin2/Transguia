const { pool } = require('../db/pool');

const SELECT = `
  vp.id, vp.empresa_id as "empresaId", vp.unidad_id as "unidadId", vp.chofer_id as "choferId",
  to_char(vp.fecha_programada, 'YYYY-MM-DD') as "fechaProgramada",
  vp.origen, vp.destino, vp.descripcion_mercancia as "descripcionMercancia",
  vp.observaciones, vp.estado, vp.motivo_cancelacion as "motivoCancelacion",
  vp.creado_por as "creadoPor", vp.creado_en as "creadoEn",
  u.placa, (c.nombres || ' ' || c.apellidos) as "choferNombre", trim(c.dni) as "choferDni"
`;

/**
 * Programación de viajes: agenda de qué unidad/chofer va a qué ruta un día
 * dado. No tiene versión en memoria (como el dashboard): solo se usa desde
 * la web contra Postgres.
 */
class ViajesProgramadosRepositorioPostgres {
  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `select ${SELECT}
       from viajes_programados vp
       join unidades u on u.id = vp.unidad_id
       join choferes c on c.id = vp.chofer_id
       where vp.empresa_id = $1
       order by vp.fecha_programada, vp.creado_en`,
      [empresaId]
    );
    return rows;
  }

  /** Un viaje PROGRAMADO ya existente el mismo día, para la misma unidad o el mismo chofer. */
  async buscarConflicto(empresaId, unidadId, choferId, fechaProgramada) {
    const { rows } = await pool.query(
      `select id, unidad_id as "unidadId", chofer_id as "choferId"
       from viajes_programados
       where empresa_id = $1 and fecha_programada = $2 and estado = 'PROGRAMADO'
         and (unidad_id = $3 or chofer_id = $4)
       limit 1`,
      [empresaId, fechaProgramada, unidadId, choferId]
    );
    return rows[0] || null;
  }

  async crear({ empresaId, unidadId, choferId, fechaProgramada, origen, destino, descripcionMercancia, observaciones, creadoPor }) {
    const { rows } = await pool.query(
      `insert into viajes_programados
         (empresa_id, unidad_id, chofer_id, fecha_programada, origen, destino, descripcion_mercancia, observaciones, creado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [empresaId, unidadId, choferId, fechaProgramada, origen, destino, descripcionMercancia || null, observaciones || null, creadoPor || null]
    );
    return this.obtenerPorId(rows[0].id);
  }

  async obtenerPorId(id) {
    const { rows } = await pool.query(
      `select ${SELECT}
       from viajes_programados vp
       join unidades u on u.id = vp.unidad_id
       join choferes c on c.id = vp.chofer_id
       where vp.id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async cambiarEstado(id, estado, motivoCancelacion) {
    const { rows } = await pool.query(
      `update viajes_programados
       set estado = $2, motivo_cancelacion = coalesce($3, motivo_cancelacion)
       where id = $1
       returning id`,
      [id, estado, motivoCancelacion || null]
    );
    if (!rows[0]) return null;
    return this.obtenerPorId(id);
  }
}

module.exports = { ViajesProgramadosRepositorioPostgres };
