const { pool } = require('../db/pool');

/**
 * Consultas agregadas para el dashboard de indicadores de gestión.
 * `empresaId` null = todas las empresas (vista acumulada del superadmin).
 * Todo se mide sobre una ventana móvil de `dias` días hacia atrás; los
 * KPI además traen el valor de la ventana previa (misma longitud) para
 * calcular la variación.
 */
class DashboardRepositorioPostgres {
  // Devuelve { sql, params, n } donde `n` es el nº del siguiente $ libre.
  _emp(empresaId) {
    return empresaId
      ? { sql: 'and t.empresa_id = $1', params: [empresaId], n: 2 }
      : { sql: '', params: [], n: 1 };
  }

  /** Contadores de la ventana actual y de la previa (para las variaciones). */
  async kpis(empresaId, dias) {
    const e = this._emp(empresaId);
    const D = `$${e.n}`;
    const { rows } = await pool.query(`
      with base as (
        select t.*,
               (creado_en >= now() - make_interval(days => ${D}::int))               as act,
               (creado_en >= now() - make_interval(days => ${D}::int * 2)
                  and creado_en < now() - make_interval(days => ${D}::int))           as prev
        from tickets_traslado t
        where creado_en >= now() - make_interval(days => ${D}::int * 2) ${e.sql}
      )
      select
        coalesce(sum(peso_bruto_kg) filter (where act  and estado_operativo <> 'ANULADO'), 0) / 1000.0 as ton_act,
        coalesce(sum(peso_bruto_kg) filter (where prev and estado_operativo <> 'ANULADO'), 0) / 1000.0 as ton_prev,
        count(*) filter (where act  and estado_operativo <> 'ANULADO')::int  as viajes_act,
        count(*) filter (where prev and estado_operativo <> 'ANULADO')::int  as viajes_prev,
        count(*) filter (where act)::int                                     as total_act,
        count(*) filter (where prev)::int                                    as total_prev,
        count(*) filter (where act  and estado_operativo = 'ANULADO')::int   as anulados_act,
        count(*) filter (where prev and estado_operativo = 'ANULADO')::int   as anulados_prev,
        count(distinct unidad_id) filter (where act and estado_operativo <> 'ANULADO')::int as unidades_con_viaje,
        avg(extract(epoch from (fecha_entrega - creado_en)) / 3600.0)
          filter (where act  and estado_operativo = 'ENTREGADO' and fecha_entrega is not null) as ciclo_act,
        avg(extract(epoch from (fecha_entrega - creado_en)) / 3600.0)
          filter (where prev and estado_operativo = 'ENTREGADO' and fecha_entrega is not null) as ciclo_prev,
        avg(extract(epoch from (fecha_traslado - creado_en)) / 3600.0)
          filter (where act and estado_operativo = 'ENTREGADO' and fecha_traslado is not null) as despacho_act,
        avg(extract(epoch from (fecha_entrega - fecha_traslado)) / 3600.0)
          filter (where act and estado_operativo = 'ENTREGADO'
                  and fecha_entrega is not null and fecha_traslado is not null)               as transito_act
      from base
    `, [...e.params, dias]);
    return rows[0];
  }

  /** Aceptación de la GRE por SUNAT en la ventana (por fecha del ticket). */
  async gre(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select count(*)::int as total,
             count(*) filter (where g.estado = 'ACEPTADO')::int              as aceptadas,
             count(*) filter (where g.estado in ('RECHAZADO', 'OBSERVADO'))::int as rechazadas
      from emisiones_gre g
      join tickets_traslado t on t.id = g.ticket_id
      where t.creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
    `, [...e.params, dias]);
    return rows[0];
  }

  /** Unidades habilitadas (aprobadas y activas) — denominador de la utilización. */
  async flotaHabilitada(empresaId) {
    const cond = empresaId ? 'and empresa_id = $1' : '';
    const { rows } = await pool.query(
      `select count(*)::int as n from unidades
       where estado_registro = 'APROBADA' and activo ${cond}`,
      empresaId ? [empresaId] : []
    );
    return rows[0].n;
  }

  /** Toneladas trasladadas por día (o por mes si la ventana es larga). */
  async toneladasPorPeriodo(empresaId, dias, mensual) {
    const e = this._emp(empresaId);
    const trunc = mensual ? 'month' : 'day';
    const fmt = mensual ? 'YYYY-MM' : 'YYYY-MM-DD';
    const { rows } = await pool.query(`
      select to_char(date_trunc('${trunc}', creado_en), '${fmt}') as periodo,
             round((sum(peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas,
             count(*)::int as viajes
      from tickets_traslado t
      where estado_operativo <> 'ANULADO'
        and creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by 1 order by 1
    `, [...e.params, dias]);
    return rows;
  }

  /** Cantidad de tickets por estado operativo en la ventana. */
  async porEstado(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select estado_operativo as estado, count(*)::int as cantidad
      from tickets_traslado t
      where creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by 1
    `, [...e.params, dias]);
    return rows;
  }

  /** Toneladas por material (mercancía) en la ventana. */
  async toneladasPorMaterial(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select descripcion_mercancia as material,
             round((sum(peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas,
             count(*)::int as viajes
      from tickets_traslado t
      where estado_operativo <> 'ANULADO'
        and creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by 1 order by 2 desc limit 12
    `, [...e.params, dias]);
    return rows;
  }

  /** Viajes (y toneladas) por unidad en la ventana — las 10 más activas. */
  async viajesPorUnidad(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select u.placa,
             count(*)::int as viajes,
             round((sum(t.peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas
      from tickets_traslado t
      join unidades u on u.id = t.unidad_id
      where t.estado_operativo <> 'ANULADO'
        and t.creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by u.placa order by viajes desc, toneladas desc limit 10
    `, [...e.params, dias]);
    return rows;
  }

  /** Viajes (y toneladas) por chofer en la ventana — los 10 más activos. */
  async viajesPorChofer(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select (c.nombres || ' ' || c.apellidos) as chofer,
             count(*)::int as viajes,
             round((sum(t.peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas
      from tickets_traslado t
      join choferes c on c.id = t.chofer_id
      where t.estado_operativo <> 'ANULADO'
        and t.creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by c.id, c.nombres, c.apellidos order by viajes desc, toneladas desc limit 10
    `, [...e.params, dias]);
    return rows;
  }

  /** Toneladas y viajes por corredor (centro de origen -> destino) en la ventana. */
  async corredores(empresaId, dias) {
    const e = this._emp(empresaId);
    const { rows } = await pool.query(`
      select origen, destino,
             round((sum(peso_bruto_kg) / 1000.0)::numeric, 2)::float8 as toneladas,
             count(*)::int as viajes
      from tickets_traslado t
      where estado_operativo <> 'ANULADO'
        and creado_en >= now() - make_interval(days => $${e.n}::int) ${e.sql}
      group by origen, destino
    `, [...e.params, dias]);
    return rows;
  }
}

module.exports = { DashboardRepositorioPostgres };
