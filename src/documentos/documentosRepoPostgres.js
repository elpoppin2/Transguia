const { pool } = require('../db/pool');

/**
 * Acceso a las tablas documentos_unidad y documentos_chofer, y a la
 * vista vencimientos_proximos. Mismo contrato que
 * documentosRepoMemoria.js.
 *
 * Un documento acredita algo con fecha de vencimiento: SOAT, revisión
 * técnica y tarjeta de circulación de una unidad; licencia de conducir y
 * certificado médico de un chofer.
 */
// Las fechas van como texto AAAA-MM-DD (si no, pg las devuelve como
// Date con hora y zona, y el JSON queda feo).
const COLS_UNIDAD = `
  id,
  unidad_id                    as "unidadId",
  tipo_documento               as "tipoDocumento",
  numero_documento             as "numeroDocumento",
  to_char(fecha_emision, 'YYYY-MM-DD')     as "fechaEmision",
  to_char(fecha_vencimiento, 'YYYY-MM-DD') as "fechaVencimiento",
  archivo_url                  as "archivoUrl",
  archivo_nombre               as "archivoNombre",
  (archivo is not null)        as "tieneArchivo",
  creado_en                    as "creadoEn"
`;
const COLS_CHOFER = `
  id,
  chofer_id                    as "choferId",
  tipo_documento               as "tipoDocumento",
  numero_documento             as "numeroDocumento",
  categoria_licencia           as "categoriaLicencia",
  to_char(fecha_emision, 'YYYY-MM-DD')     as "fechaEmision",
  to_char(fecha_vencimiento, 'YYYY-MM-DD') as "fechaVencimiento",
  creado_en                    as "creadoEn"
`;

class DocumentosRepositorioPostgres {
  async listarDeUnidad(unidadId) {
    const { rows } = await pool.query(
      `select ${COLS_UNIDAD} from documentos_unidad
       where unidad_id = $1 order by fecha_vencimiento`,
      [unidadId]
    );
    return rows;
  }

  async agregarAUnidad({ unidadId, tipoDocumento, numeroDocumento, fechaEmision, fechaVencimiento, archivoUrl, archivo, archivoNombre, archivoTipo }) {
    try {
      const { rows } = await pool.query(
        `insert into documentos_unidad
           (unidad_id, tipo_documento, numero_documento, fecha_emision, fecha_vencimiento,
            archivo_url, archivo, archivo_nombre, archivo_tipo)
         values ($1, $2::tipo_documento_unidad, $3, $4, $5, $6, $7, $8, $9)
         returning ${COLS_UNIDAD}`,
        [
          unidadId, tipoDocumento, numeroDocumento ?? null, fechaEmision ?? null, fechaVencimiento ?? null,
          archivoUrl ?? null, archivo ?? null, archivoNombre ?? null, archivoTipo ?? null
        ]
      );
      return rows[0];
    } catch (error) {
      throw traducir(error, 'unidad');
    }
  }

  async eliminarDeUnidad(docId) {
    const { rowCount } = await pool.query('delete from documentos_unidad where id = $1', [docId]);
    if (rowCount === 0) throw new Error('El documento indicado no existe');
  }

  /** El PDF de un documento de unidad (bytes + nombre + tipo), para descargarlo. */
  async obtenerArchivoDeUnidad(docId) {
    const { rows } = await pool.query(
      `select unidad_id as "unidadId", archivo, archivo_nombre as "archivoNombre", archivo_tipo as "archivoTipo"
       from documentos_unidad where id = $1`,
      [docId]
    );
    return rows[0] || null;
  }

  async listarDeChofer(choferId) {
    const { rows } = await pool.query(
      `select ${COLS_CHOFER} from documentos_chofer
       where chofer_id = $1 order by fecha_vencimiento`,
      [choferId]
    );
    return rows;
  }

  async agregarAChofer({ choferId, tipoDocumento, numeroDocumento, categoriaLicencia, fechaEmision, fechaVencimiento }) {
    try {
      const { rows } = await pool.query(
        `insert into documentos_chofer
           (chofer_id, tipo_documento, numero_documento, categoria_licencia, fecha_emision, fecha_vencimiento)
         values ($1, $2::tipo_documento_chofer, $3, $4::categoria_licencia, $5, $6)
         returning ${COLS_CHOFER}`,
        [choferId, tipoDocumento, numeroDocumento ?? null, categoriaLicencia ?? null, fechaEmision ?? null, fechaVencimiento]
      );
      return rows[0];
    } catch (error) {
      throw traducir(error, 'chofer');
    }
  }

  async eliminarDeChofer(docId) {
    const { rowCount } = await pool.query('delete from documentos_chofer where id = $1', [docId]);
    if (rowCount === 0) throw new Error('El documento indicado no existe');
  }

  /**
   * Licencia de conducir vigente (o la más reciente si ninguna está
   * vigente) del chofer. Se usa para la GRE.
   */
  async licenciaVigenteDeChofer(choferId) {
    const { rows } = await pool.query(
      `select ${COLS_CHOFER} from documentos_chofer
       where chofer_id = $1 and tipo_documento = 'LICENCIA_CONDUCIR'
       order by (fecha_vencimiento >= current_date) desc, fecha_vencimiento desc
       limit 1`,
      [choferId]
    );
    return rows[0] || null;
  }

  /**
   * Documentos (de unidades y choferes de la empresa) que ya vencieron o
   * vencen dentro de `dias` días.
   */
  async vencimientosProximos(empresaId, dias) {
    const { rows } = await pool.query(
      `select tipo, referencia, documento,
              to_char(fecha_vencimiento, 'YYYY-MM-DD') as "fechaVencimiento",
              (fecha_vencimiento - current_date) as "diasRestantes"
       from vencimientos_proximos
       where empresa_id = $1
         and fecha_vencimiento <= current_date + ($2 || ' days')::interval
       order by fecha_vencimiento`,
      [empresaId, String(dias)]
    );
    return rows;
  }
}

function traducir(error, entidad) {
  if (error.code === '23503') {
    return new Error(`La ${entidad} indicada no existe`);
  }
  if (error.code === '23514' && String(error.constraint) === 'chk_vencimiento_segun_tipo') {
    return new Error('Este tipo de documento necesita fecha de vencimiento');
  }
  if (error.code === '22P02') {
    if (String(error.message).includes('categoria_licencia')) {
      return new Error('La categoría de licencia no es válida (A-I, A-IIa, A-IIb, A-IIIa, A-IIIb, A-IIIc)');
    }
    return new Error('El tipo de documento no es válido');
  }
  return error;
}

module.exports = { DocumentosRepositorioPostgres };
