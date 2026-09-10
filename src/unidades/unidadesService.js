const CATEGORIAS_MTC = ['N1', 'N2', 'N3'];

/**
 * Reglas de negocio para registrar y listar unidades (vehículos de
 * carga). No sabe si los datos se guardan en memoria o en Postgres: eso
 * lo decide el repositorio que recibe por constructor.
 */
class UnidadesService {
  /**
   * @param {{ listarPorEmpresa: Function, buscarPorPlaca: Function, crearUnidad: Function, cambiarActivo: Function }} repositorioUnidades
   */
  constructor(repositorioUnidades) {
    this.repo = repositorioUnidades;
  }

  async listarUnidades(empresaId) {
    if (!empresaId) throw new Error('empresaId es obligatorio');
    return this.repo.listarPorEmpresa(empresaId);
  }

  async registrarUnidad(datos) {
    const unidad = normalizarYValidar(datos);

    const existente = await this.repo.buscarPorPlaca(unidad.placa);
    if (existente) {
      throw new Error('Ya existe una unidad registrada con esa placa');
    }

    return this.repo.crearUnidad(unidad);
  }

  async desactivarUnidad(id) {
    if (!id) throw new Error('id es obligatorio');
    return this.repo.cambiarActivo(id, false);
  }

  async reactivarUnidad(id) {
    if (!id) throw new Error('id es obligatorio');
    return this.repo.cambiarActivo(id, true);
  }
}

/**
 * Placas peruanas de carga: 3 letras + 3 números (con o sin guion).
 * Aceptamos ambos formatos y guardamos siempre "ABC-123".
 */
function normalizarPlaca(placa) {
  const limpia = String(placa).toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{6}$/.test(limpia)) {
    throw new Error('La placa debe tener 6 caracteres (por ejemplo ABC-123 o F1A-234)');
  }
  return `${limpia.slice(0, 3)}-${limpia.slice(3)}`;
}

function normalizarYValidar({ empresaId, placa, marca, modelo, anioFabricacion, categoriaMtc, configuracionVehicular }) {
  const obligatorios = { empresaId, placa, marca, modelo, categoriaMtc, configuracionVehicular };
  const faltantes = Object.entries(obligatorios)
    .filter(([, valor]) => valor === undefined || valor === null || String(valor).trim() === '')
    .map(([campo]) => campo);
  if (faltantes.length) {
    throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
  }

  const categoria = String(categoriaMtc).toUpperCase().trim();
  if (!CATEGORIAS_MTC.includes(categoria)) {
    throw new Error('La categoría MTC debe ser N1, N2 o N3');
  }

  let anio = null;
  if (anioFabricacion !== undefined && anioFabricacion !== null && String(anioFabricacion).trim() !== '') {
    anio = Number(anioFabricacion);
    const anioActual = new Date().getFullYear();
    if (!Number.isInteger(anio) || anio < 1970 || anio > anioActual + 1) {
      throw new Error(`El año de fabricación debe ser un número entre 1970 y ${anioActual + 1}`);
    }
  }

  return {
    empresaId: String(empresaId).trim(),
    placa: normalizarPlaca(placa),
    marca: String(marca).trim(),
    modelo: String(modelo).trim(),
    anioFabricacion: anio,
    categoriaMtc: categoria,
    configuracionVehicular: String(configuracionVehicular).toUpperCase().trim()
  };
}

module.exports = { UnidadesService, CATEGORIAS_MTC };
