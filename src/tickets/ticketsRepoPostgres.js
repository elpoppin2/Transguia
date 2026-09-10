const { pool, enTransaccion } = require('../db/pool');

/**
 * Mismo contrato que TicketsRepositorioMemoria, pero repartido en las 3
 * tablas reales:
 *   - tickets_traslado          (el traslado)
 *   - emisiones_gre             (el resultado de la GRE ante SUNAT)
 *   - historial_estado_ticket   (cada cambio de estado operativo)
 *
 * Las escrituras que tocan varias tablas van dentro de una transacción
 * (enTransaccion) para que nunca quede a medias.
 */

// El código interno del ticket lo genera una secuencia de Postgres:
// nunca se repite aunque se reinicie el servidor.
const SECUENCIA_CODIGO = 'transguia_ticket_codigo_seq';

// Vista pública de un ticket: junta el traslado con su unidad, su chofer
// y su última emisión de GRE. Devuelve los nombres en camelCase, igual
// que la versión en memoria.
const SELECT_VISTA = `
  select
    t.id,
    t.codigo_interno                  as "codigoInterno",
    t.empresa_id                      as "empresaId",
    t.unidad_id                       as "unidadId",
    t.chofer_id                       as "choferId",
    u.placa,
    u.configuracion_vehicular         as "configuracionVehicular",
    trim(c.dni)                       as "choferDni",
    (c.nombres || ' ' || c.apellidos) as "choferNombres",
    t.origen,
    t.destino,
    t.motivo,
    t.descripcion_mercancia           as "descripcionMercancia",
    t.peso_bruto_kg::float8           as "pesoBrutoKg",
    t.estado_operativo                as "estadoOperativo",
    coalesce(e.estado::text, 'ENVIANDO') as "estadoSunat",
    e.serie_correlativo               as "serieCorrelativoGre",
    e.motivo_rechazo                  as "motivoRechazo",
    t.fecha_traslado                  as "fechaTraslado",
    t.fecha_entrega                   as "fechaEntrega",
    t.creado_por                      as "creadoPor",
    t.creado_en                       as "creadoEn"
  from tickets_traslado t
  join unidades u on u.id = t.unidad_id
  join choferes c on c.id = t.chofer_id
  left join lateral (
    select estado, serie_correlativo, motivo_rechazo
    from emisiones_gre
    where ticket_id = t.id
    order by creado_en desc
    limit 1
  ) e on true
`;

class TicketsRepositorioPostgres {
  /**
   * Crea la secuencia del código interno si todavía no existe. Se llama
   * una vez al arrancar el servidor (o el script de prueba).
   */
  async asegurarEsquema() {
    await pool.query(`create sequence if not exists ${SECUENCIA_CODIGO}`);
  }

  async crear({ empresaId, unidad, chofer, origen, destino, motivo, descripcionMercancia, pesoBrutoKg, proveedorGre, creadoPor }) {
    let ticketId;
    try {
      ticketId = await enTransaccion(async (cli) => {
        const { rows: seq } = await cli.query(`select nextval('${SECUENCIA_CODIGO}') as n`);
        const codigoInterno = `TCK-${String(seq[0].n).padStart(6, '0')}`;

        const { rows } = await cli.query(
          `insert into tickets_traslado
             (codigo_interno, empresa_id, unidad_id, chofer_id, origen, destino,
              motivo, descripcion_mercancia, peso_bruto_kg, creado_por)
           values ($1, $2, $3, $4, $5, $6, $7::motivo_traslado, $8, $9, $10)
           returning id`,
          [codigoInterno, empresaId, unidad.id, chofer.id, origen, destino, motivo, descripcionMercancia, pesoBrutoKg, creadoPor ?? null]
        );
        ticketId = rows[0].id;

        await cli.query(
          `insert into historial_estado_ticket (ticket_id, estado_anterior, estado_nuevo, usuario_id)
           values ($1, null, 'GENERADO'::estado_operativo_ticket, $2)`,
          [ticketId, creadoPor ?? null]
        );

        await cli.query(
          `insert into emisiones_gre (ticket_id, proveedor, estado)
           values ($1, $2::proveedor_gre, 'ENVIANDO'::estado_gre)`,
          [ticketId, proveedorGre]
        );

        return ticketId;
      });
    } catch (error) {
      throw traducirError(error);
    }
    return this.obtenerPorId(ticketId);
  }

  async registrarResultadoGre(ticketId, resultado) {
    await pool.query(
      `update emisiones_gre
          set estado = $2::estado_gre,
              serie_correlativo = $3,
              hash_cdr = $4,
              motivo_rechazo = $5,
              respuesta_cruda = $6::jsonb
        where id = (
          select id from emisiones_gre where ticket_id = $1 order by creado_en desc limit 1
        )`,
      [
        ticketId,
        mapEstadoGre(resultado.estado),
        resultado.serieCorrelativo ?? null,
        resultado.hash ?? null,
        resultado.motivoRechazo ?? null,
        JSON.stringify(resultado)
      ]
    );
    return this.obtenerPorId(ticketId);
  }

  async obtenerPorId(id) {
    const { rows } = await pool.query(`${SELECT_VISTA} where t.id = $1`, [id]);
    return rows[0] || null;
  }

  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `${SELECT_VISTA} where t.empresa_id = $1 order by t.creado_en desc`,
      [empresaId]
    );
    return rows;
  }

  async actualizarEstado(id, nuevoEstado, usuarioId) {
    return enTransaccion(async (cli) => {
      const { rows: actual } = await cli.query(
        `select estado_operativo from tickets_traslado where id = $1 for update`,
        [id]
      );
      if (actual.length === 0) throw new Error(`El ticket ${id} no existe`);
      const anterior = actual[0].estado_operativo;

      await cli.query(
        `update tickets_traslado
            set estado_operativo = $2::estado_operativo_ticket,
                fecha_traslado = case when $2 = 'EN_TRANSITO' and fecha_traslado is null
                                      then now() else fecha_traslado end,
                fecha_entrega  = case when $2 = 'ENTREGADO' and fecha_entrega is null
                                      then now() else fecha_entrega end
          where id = $1`,
        [id, nuevoEstado]
      );

      await cli.query(
        `insert into historial_estado_ticket (ticket_id, estado_anterior, estado_nuevo, usuario_id)
         values ($1, $2::estado_operativo_ticket, $3::estado_operativo_ticket, $4)`,
        [id, anterior, nuevoEstado, usuarioId ?? null]
      );

      const { rows } = await cli.query(`${SELECT_VISTA} where t.id = $1`, [id]);
      return rows[0];
    });
  }
}

/**
 * El contrato EmisorGRE usa ACEPTADO | RECHAZADO | OBSERVADO. El enum
 * estado_gre de la base agrega ENVIANDO. Cualquier valor raro cae en
 * OBSERVADO en vez de romper el insert.
 */
function mapEstadoGre(estado) {
  const validos = ['ENVIANDO', 'ACEPTADO', 'RECHAZADO', 'OBSERVADO'];
  return validos.includes(estado) ? estado : 'OBSERVADO';
}

function traducirError(error) {
  if (error.code === '23503') {
    const detalle = String(error.detail);
    if (detalle.includes('unidad_id')) return new Error('La unidad indicada no existe');
    if (detalle.includes('chofer_id')) return new Error('El chofer indicado no existe');
    if (detalle.includes('empresa_id')) return new Error('La empresa indicada no existe');
  }
  return error;
}

module.exports = { TicketsRepositorioPostgres };
