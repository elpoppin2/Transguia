const { pool } = require('../db/pool');

/**
 * Mismo contrato que UnidadesRepositorioMemoria, pero contra la tabla
 * `unidades` de Supabase. unidadesService.js no distingue cuál usa.
 *
 * MAPA_COLUMNAS traduce los nombres camelCase que usa el resto del código
 * a las columnas snake_case de la base, en un solo lugar: sirve tanto
 * para armar el SELECT como el INSERT.
 */
const MAPA_COLUMNAS = {
  empresaId: 'empresa_id',
  placa: 'placa',
  rucPropietario: 'ruc_propietario',
  nombrePropietario: 'nombre_propietario',
  direccionPropietario: 'direccion_propietario',
  dniTransportista: 'dni_transportista',
  departamento: 'departamento',
  provincia: 'provincia',
  distrito: 'distrito',
  tipoVehiculo: 'tipo_vehiculo',
  marca: 'marca',
  modelo: 'modelo',
  anioFabricacion: 'anio_fabricacion',
  categoriaMtc: 'categoria_mtc',
  configuracionVehicular: 'configuracion_vehicular',
  nroEjes: 'nro_ejes',
  rodadaEjeDelantero: 'rodada_eje_delantero',
  rodadaC1: 'rodada_c1',
  rodadaC2: 'rodada_c2',
  pesoSecoKg: 'peso_seco_kg',
  tolvaCerrada: 'tolva_cerrada',
  carretaConPiston: 'carreta_con_piston',
  unidadAGas: 'unidad_a_gas',
  formaApertura: 'forma_apertura',
  alturaM: 'altura_m',
  anchoM: 'ancho_m',
  largoM: 'largo_m',
  alturaPlataformaM: 'altura_plataforma_m'
};

const SELECT = ['id', 'activo', 'creado_en as "creadoEn"']
  .concat(Object.entries(MAPA_COLUMNAS).map(([js, col]) => (col === js ? col : `${col} as "${js}"`)))
  .join(', ');

class UnidadesRepositorioPostgres {
  async listarPorEmpresa(empresaId) {
    const { rows } = await pool.query(
      `select ${SELECT} from unidades where empresa_id = $1 order by placa`,
      [empresaId]
    );
    return rows;
  }

  async buscarPorPlaca(placa) {
    const { rows } = await pool.query(`select ${SELECT} from unidades where placa = $1`, [placa]);
    return rows[0] || null;
  }

  async buscarPorId(id) {
    const { rows } = await pool.query(`select ${SELECT} from unidades where id = $1`, [id]);
    return rows[0] || null;
  }

  async crearUnidad(datos) {
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
        `insert into unidades (${cols.join(', ')})
         values (${marcadores.join(', ')})
         returning ${SELECT}`,
        valores
      );
      return rows[0];
    } catch (error) {
      throw traducirErrorPostgres(error);
    }
  }

  async cambiarActivo(id, activo) {
    const { rows } = await pool.query(
      `update unidades set activo = $2 where id = $1 returning ${SELECT}`,
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
