const { pool } = require('../db/pool');

/**
 * Mismo contrato que ChoferesRepositorioMemoria, pero contra la tabla
 * `choferes` de Supabase. choferesService.js no distingue cuál usa.
 *
 * MAPA_COLUMNAS traduce camelCase -> snake_case en un solo lugar (sirve
 * para el SELECT y el INSERT/UPDATE), igual que unidadesRepoPostgres.
 */
const MAPA_COLUMNAS = {
  empresaId: 'empresa_id',
  tipoDocIdentidad: 'tipo_doc_identidad',
  dni: 'dni',
  apellidoPaterno: 'apellido_paterno',
  apellidoMaterno: 'apellido_materno',
  primerNombre: 'primer_nombre',
  segundoNombre: 'segundo_nombre',
  nombres: 'nombres',
  apellidos: 'apellidos',
  celular: 'celular',
  departamento: 'departamento',
  provincia: 'provincia',
  distrito: 'distrito',
  direccion: 'direccion'
};
const COLUMNAS_ESTADO = {
  estadoRegistro: 'estado_registro',
  motivoRechazo: 'motivo_rechazo',
  revisadoPor: 'revisado_por',
  revisadoEn: 'revisado_en'
};

function armarSelect(prefijo = '') {
  const p = prefijo ? `${prefijo}.` : '';
  const base = { id: 'id', activo: 'activo', creadoEn: 'creado_en' };
  return Object.entries({ ...base, ...MAPA_COLUMNAS, ...COLUMNAS_ESTADO })
    .map(([js, col]) => (col === 'dni' ? `trim(${p}dni) as "dni"` : `${p}${col} as "${js}"`))
    .join(', ');
}
const SELECT = armarSelect();

class ChoferesRepositorioPostgres {
  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `select ${SELECT} from choferes where empresa_id = $1 order by apellidos, nombres`,
      [empresaId]
    );
    return rows;
  }

  async buscarPorDni(empresaId, dni) {
    const { rows } = await pool.query(
      `select ${SELECT} from choferes where empresa_id = $1 and trim(dni) = $2`,
      [empresaId, String(dni).trim()]
    );
    return rows[0] || null;
  }

  async buscarPorId(id) {
    const { rows } = await pool.query(`select ${SELECT} from choferes where id = $1`, [id]);
    return rows[0] || null;
  }

  async crearChofer(datos) {
    const cols = [];
    const valores = [];
    const marcadores = [];
    for (const [js, col] of Object.entries(MAPA_COLUMNAS)) {
      if (datos[js] === undefined) continue;
      cols.push(col);
      valores.push(datos[js]);
      marcadores.push(`$${valores.length}`);
    }
    try {
      const { rows } = await pool.query(
        `insert into choferes (${cols.join(', ')})
         values (${marcadores.join(', ')})
         returning ${SELECT}`,
        valores
      );
      return rows[0];
    } catch (error) {
      throw traducirErrorPostgres(error);
    }
  }

  async actualizar(id, datos) {
    const sets = [];
    const valores = [id];
    for (const [js, col] of Object.entries(MAPA_COLUMNAS)) {
      if (js === 'empresaId' || datos[js] === undefined) continue;
      valores.push(datos[js]);
      sets.push(`${col} = $${valores.length}`);
    }
    if (!sets.length) return this.buscarPorId(id);
    try {
      const { rows } = await pool.query(
        `update choferes set ${sets.join(', ')} where id = $1 returning ${SELECT}`,
        valores
      );
      if (rows.length === 0) throw new Error('El chofer indicado no existe');
      return rows[0];
    } catch (error) {
      throw traducirErrorPostgres(error);
    }
  }

  async cambiarEstadoRegistro(id, estadoRegistro, { motivoRechazo = null, revisadoPor = null } = {}) {
    const { rows } = await pool.query(
      `update choferes
         set estado_registro = $2, motivo_rechazo = $3,
             revisado_por = $4, revisado_en = now()
       where id = $1 returning ${SELECT}`,
      [id, estadoRegistro, motivoRechazo, revisadoPor]
    );
    if (rows.length === 0) throw new Error('El chofer indicado no existe');
    return rows[0];
  }

  async listarPendientes() {
    const { rows } = await pool.query(
      `select ${armarSelect('c')}, e.razon_social as "empresaRazonSocial"
       from choferes c join empresas e on e.id = c.empresa_id
       where c.estado_registro = 'PENDIENTE'
       order by c.creado_en`
    );
    return rows;
  }

  async cambiarActivo(id, activo) {
    const { rows } = await pool.query(
      `update choferes set activo = $2 where id = $1 returning ${SELECT}`,
      [id, activo]
    );
    if (rows.length === 0) throw new Error('El chofer indicado no existe');
    return rows[0];
  }
}

function traducirErrorPostgres(error) {
  if (error.code === '23505') {
    return new Error('Ya existe un chofer con ese documento en esta empresa');
  }
  if (error.code === '23503' && String(error.detail).includes('empresa_id')) {
    return new Error('La empresa indicada no existe');
  }
  return error;
}

module.exports = { ChoferesRepositorioPostgres };
