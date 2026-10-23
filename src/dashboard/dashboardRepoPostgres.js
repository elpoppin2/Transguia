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

  /**
   * Cumplimiento del plan: viajes programados con fecha dentro de la
   * ventana (ya pasada, sin contar los cancelados) vs. tickets realmente
   * ENTREGADOs en esa misma ventana (por fecha de entrega real). No hay
   * vínculo 1 a 1 entre un viaje programado y un ticket concreto: es una
   * comparación agregada de plan vs. ejecución, no un cruce exacto.
   */
  async cumplimientoProgramacion(empresaId, dias) {
    const condVp = empresaId ? 'and vp.empresa_id = $2' : '';
    const condT = empresaId ? 'and t.empresa_id = $2' : '';
    const params = empresaId ? [dias, empresaId] : [dias];
    const { rows } = await pool.query(`
      select
        (select count(*)::int from viajes_programados vp
          where vp.estado <> 'CANCELADO'
            and vp.fecha_programada >= (now() - make_interval(days => $1::int))::date
            and vp.fecha_programada <= now()::date
            ${condVp}) as programados,
        (select count(*)::int from tickets_traslado t
          where t.estado_operativo = 'ENTREGADO'
            and t.fecha_entrega >= now() - make_interval(days => $1::int)
            and t.fecha_entrega <= now()
            ${condT}) as entregados
    `, params);
    return rows[0];
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

  // ==================== DASHBOARD DE FLOTA (proveedores) ====================
  // Sin tickets: se mide sobre la flota, sus documentos y los viajes
  // programados. `empresaId` null = todas las empresas PROVEEDOR.

  // Filtro por empresa para la tabla con alias `a`, empezando en $n.
  _flota(empresaId, a, n = 1) {
    return empresaId
      ? { sql: `and ${a}.empresa_id = $${n}`, params: [empresaId], n: n + 1 }
      : { sql: `and ${a}.empresa_id in (select id from empresas where tipo_empresa = 'PROVEEDOR')`, params: [], n };
  }

  /**
   * Situación documental de cada unidad habilitada, según su SOAT y su
   * revisión técnica (el que venza primero manda):
   * AL_DIA | POR_VENCER (≤ 30 días) | VENCIDA | SIN_DOCUMENTOS.
   */
  async situacionFlota(empresaId) {
    const e = this._flota(empresaId, 'u');
    const { rows } = await pool.query(`
      with f as (
        select u.placa, u.marca, u.tipo_vehiculo,
          (select max(d.fecha_vencimiento) from documentos_unidad d
             where d.unidad_id = u.id and d.tipo_documento = 'SOAT')             as soat,
          (select max(d.fecha_vencimiento) from documentos_unidad d
             where d.unidad_id = u.id and d.tipo_documento = 'REVISION_TECNICA') as rt
        from unidades u
        where u.activo and u.estado_registro = 'APROBADA' ${e.sql}
      )
      select placa, marca, tipo_vehiculo as "tipoVehiculo",
             to_char(soat, 'YYYY-MM-DD') as soat, to_char(rt, 'YYYY-MM-DD') as rt,
             (least(soat, rt) - current_date)::int as "diasRestantes",
             case when soat is null or rt is null           then 'SIN_DOCUMENTOS'
                  when least(soat, rt) < current_date       then 'VENCIDA'
                  when least(soat, rt) <= current_date + 30 then 'POR_VENCER'
                  else 'AL_DIA' end as situacion
      from f
      order by least(soat, rt) nulls first, placa
    `, e.params);
    return rows;
  }

  /** Choferes habilitados y cuántos tienen la licencia de conducir vigente. */
  async choferesFlota(empresaId) {
    const e = this._flota(empresaId, 'c');
    const { rows } = await pool.query(`
      select count(*)::int as activos,
             count(*) filter (where exists (
               select 1 from documentos_chofer d
               where d.chofer_id = c.id and d.tipo_documento = 'LICENCIA_CONDUCIR'
                 and d.fecha_vencimiento >= current_date))::int as "conLicencia"
      from choferes c
      where c.activo and c.estado_registro = 'APROBADA' ${e.sql}
    `, e.params);
    return rows[0];
  }

  /** Documentos (de unidades y choferes) ya vencidos y por vencer en 30 días. */
  async documentosFlota(empresaId) {
    const e = this._flota(empresaId, 'v');
    const { rows } = await pool.query(`
      select count(*) filter (where fecha_vencimiento < current_date)::int as vencidos,
             count(*) filter (where fecha_vencimiento >= current_date
                                and fecha_vencimiento <= current_date + 30)::int as "porVencer"
      from vencimientos_proximos v
      where true ${e.sql}
    `, e.params);
    return rows[0];
  }

  /**
   * Viajes programados de la ventana (por fecha programada, hasta hoy) y
   * de la ventana previa, más los ya agendados para los próximos 7 días.
   */
  async viajesFlota(empresaId, dias) {
    const e = this._flota(empresaId, 'vp');
    const D = `$${e.n}::int`;
    const { rows } = await pool.query(`
      with b as (
        select vp.*,
          (fecha_programada >  current_date - ${D}     and fecha_programada <= current_date)           as act,
          (fecha_programada >  current_date - ${D} * 2 and fecha_programada <= current_date - ${D})    as prev
        from viajes_programados vp
        where fecha_programada > current_date - ${D} * 2 ${e.sql}
      )
      select
        count(*) filter (where act  and estado <> 'CANCELADO')::int  as "viajesAct",
        count(*) filter (where prev and estado <> 'CANCELADO')::int  as "viajesPrev",
        count(*) filter (where act  and estado = 'CUMPLIDO')::int    as "cumplidosAct",
        count(*) filter (where prev and estado = 'CUMPLIDO')::int    as "cumplidosPrev",
        count(*) filter (where act  and estado = 'CANCELADO')::int   as "canceladosAct",
        count(*) filter (where act  and estado = 'PROGRAMADO')::int  as "sinCerrarAct",
        count(distinct unidad_id) filter (where act and estado <> 'CANCELADO')::int as "unidadesConViaje",
        (select count(*)::int from viajes_programados vp
          where vp.estado = 'PROGRAMADO'
            and vp.fecha_programada > current_date
            and vp.fecha_programada <= current_date + 7 ${e.sql}) as "proximos7d"
      from b
    `, [...e.params, dias]);
    return rows[0];
  }

  /** Viajes (no cancelados) por día programado, o por mes si la ventana es larga. */
  async viajesFlotaPorPeriodo(empresaId, dias, mensual) {
    const e = this._flota(empresaId, 'vp');
    const fmt = mensual ? 'YYYY-MM' : 'YYYY-MM-DD';
    const trunc = mensual ? 'month' : 'day';
    const { rows } = await pool.query(`
      select to_char(date_trunc('${trunc}', fecha_programada), '${fmt}') as periodo,
             count(*)::int as viajes,
             count(*) filter (where estado = 'CUMPLIDO')::int as cumplidos
      from viajes_programados vp
      where estado <> 'CANCELADO'
        and fecha_programada > current_date - $${e.n}::int
        and fecha_programada <= current_date ${e.sql}
      group by 1 order by 1
    `, [...e.params, dias]);
    return rows;
  }

  /** Top 10 por unidad, por chofer o por ruta, de los viajes no cancelados de la ventana. */
  async viajesFlotaPor(empresaId, dias, por) {
    const e = this._flota(empresaId, 'vp');
    const grupos = {
      unidad: { sel: 'u.placa as etiqueta', join: 'join unidades u on u.id = vp.unidad_id', grp: 'u.placa' },
      chofer: { sel: `(c.nombres || ' ' || c.apellidos) as etiqueta`, join: 'join choferes c on c.id = vp.chofer_id', grp: 'c.id, c.nombres, c.apellidos' },
      ruta: { sel: `(vp.origen || ' → ' || vp.destino) as etiqueta`, join: '', grp: 'vp.origen, vp.destino' }
    };
    const g = grupos[por];
    const { rows } = await pool.query(`
      select ${g.sel}, count(*)::int as viajes
      from viajes_programados vp ${g.join}
      where vp.estado <> 'CANCELADO'
        and vp.fecha_programada > current_date - $${e.n}::int
        and vp.fecha_programada <= current_date ${e.sql}
      group by ${g.grp} order by viajes desc, etiqueta limit 10
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
