const { pool } = require('../db/pool');

/**
 * Consultas de plataforma (las usa el superadmin): listar todas las
 * empresas con un resumen, crear una empresa, y totales globales.
 *
 * Solo Postgres: es una funcionalidad de la base real, no se usa en
 * memoria ni en demo.js.
 */
class EmpresasRepositorioPostgres {
  async listarConResumen() {
    const { rows } = await pool.query(`
      select
        e.id,
        e.ruc,
        e.razon_social as "razonSocial",
        e.creado_en    as "creadoEn",
        (select count(*)::int from unidades u
           where u.empresa_id = e.id and u.activo and u.estado_registro = 'APROBADA') as "unidadesActivas",
        (select count(*)::int from unidades u
           where u.empresa_id = e.id and u.estado_registro = 'PENDIENTE')            as "unidadesPendientes",
        (select count(*)::int from choferes c where c.empresa_id = e.id and c.activo) as "choferesActivos",
        (select count(*)::int from tickets_traslado t where t.empresa_id = e.id)      as "tickets",
        (select count(*)::int from tickets_traslado t
           where t.empresa_id = e.id and t.estado_operativo = 'EN_TRANSITO')          as "ticketsEnTransito",
        (select count(*)::int from vencimientos_proximos v
           where v.empresa_id = e.id and v.fecha_vencimiento < current_date)          as "documentosVencidos"
      from empresas e
      order by e.razon_social
    `);
    return rows;
  }

  async buscarPorId(id) {
    const { rows } = await pool.query(
      'select id, ruc, razon_social as "razonSocial", creado_en as "creadoEn" from empresas where id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async buscarPorRuc(ruc) {
    const { rows } = await pool.query('select id from empresas where ruc = $1', [ruc]);
    return rows[0] || null;
  }

  async crear({ ruc, razonSocial }) {
    const { rows } = await pool.query(
      'insert into empresas (ruc, razon_social) values ($1, $2) returning id, ruc, razon_social as "razonSocial", creado_en as "creadoEn"',
      [ruc, razonSocial]
    );
    return rows[0];
  }

  async resumenGlobal() {
    const { rows } = await pool.query(`
      select
        (select count(*)::int from empresas)                                       as "empresas",
        (select count(*)::int from unidades where activo and estado_registro = 'APROBADA') as "unidadesActivas",
        (select count(*)::int from unidades where estado_registro = 'PENDIENTE')    as "unidadesPendientes",
        (select count(*)::int from choferes where activo)                          as "choferesActivos",
        (select count(*)::int from tickets_traslado)                               as "tickets",
        (select count(*)::int from tickets_traslado where estado_operativo = 'GENERADO')     as "ticketsGenerados",
        (select count(*)::int from tickets_traslado where estado_operativo = 'EN_TRANSITO')  as "ticketsEnTransito",
        (select count(*)::int from tickets_traslado where estado_operativo = 'ENTREGADO')    as "ticketsEntregados",
        (select count(*)::int from vencimientos_proximos where fecha_vencimiento < current_date) as "documentosVencidos"
    `);
    return rows[0];
  }
}

module.exports = { EmpresasRepositorioPostgres };
