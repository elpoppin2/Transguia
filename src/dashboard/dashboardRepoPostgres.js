const { pool } = require('../db/pool');

/**
 * Consultas agregadas para el dashboard. `empresaId` null = todas las
 * empresas (vista acumulada del superadmin).
 */
class DashboardRepositorioPostgres {
  /** Cantidad de traslados (tickets no anulados) por día o por mes. */
  async trasladosPorPeriodo(empresaId, agrupar) {
    const trunc = agrupar === 'mes' ? 'month' : 'day';
    const fmt = agrupar === 'mes' ? 'YYYY-MM' : 'YYYY-MM-DD';
    const rango = agrupar === 'mes' ? '11 months' : '59 days';
    const cond = empresaId ? 'and empresa_id = $1' : '';
    const params = empresaId ? [empresaId] : [];
    const { rows } = await pool.query(`
      select to_char(date_trunc('${trunc}', creado_en), '${fmt}') as periodo,
             count(*)::int as cantidad
      from tickets_traslado
      where estado_operativo <> 'ANULADO'
        and creado_en >= date_trunc('${trunc}', now()) - interval '${rango}'
        ${cond}
      group by 1
      order by 1
    `, params);
    return rows;
  }

  /** Cantidad de tickets por estado operativo. */
  async porEstado(empresaId) {
    const cond = empresaId ? 'where empresa_id = $1' : '';
    const params = empresaId ? [empresaId] : [];
    const { rows } = await pool.query(
      `select estado_operativo as estado, count(*)::int as cantidad
       from tickets_traslado ${cond}
       group by 1`,
      params
    );
    return rows;
  }

  /** Toneladas trasladadas agrupadas por descripción de mercancía. */
  async toneladasPorMaterial(empresaId) {
    const cond = empresaId ? 'and empresa_id = $1' : '';
    const params = empresaId ? [empresaId] : [];
    const { rows } = await pool.query(`
      select descripcion_mercancia as material,
             round((sum(peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas,
             count(*)::int as traslados
      from tickets_traslado
      where estado_operativo <> 'ANULADO' ${cond}
      group by 1
      order by 2 desc
      limit 15
    `, params);
    return rows;
  }

  /**
   * Tiempo de finalización (horas) de cada ticket ENTREGADO:
   * fecha_entrega − fecha_traslado (o − creado_en si no hubo despacho).
   * Ordenado del más reciente al más antiguo.
   */
  async tiemposFinalizacion(empresaId) {
    const cond = empresaId ? 'and empresa_id = $1' : '';
    const params = empresaId ? [empresaId] : [];
    const { rows } = await pool.query(`
      select codigo_interno as codigo,
             round((extract(epoch from (fecha_entrega - coalesce(fecha_traslado, creado_en))) / 3600.0)::numeric, 1)::float8 as horas
      from tickets_traslado
      where estado_operativo = 'ENTREGADO' and fecha_entrega is not null ${cond}
      order by fecha_entrega desc
    `, params);
    return rows.filter((r) => r.horas != null && r.horas >= 0);
  }
}

module.exports = { DashboardRepositorioPostgres };
