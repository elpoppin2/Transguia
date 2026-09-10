const CATEGORIAS_MTC = ['N1', 'N2', 'N3'];
const ESTADOS_REGISTRO = ['PENDIENTE', 'APROBADA', 'RECHAZADA'];

/**
 * Reglas de negocio para registrar y listar unidades (vehículos de
 * carga). No sabe si los datos se guardan en memoria o en Postgres: eso
 * lo decide el repositorio que recibe por constructor.
 *
 * Campos obligatorios al registrar: placa, rucPropietario y
 * dniTransportista. Todo lo demás (datos del dueño, ubicación del
 * transportista, ficha técnica, dimensiones) es opcional y se puede
 * completar después. El SOAT y el CITV (revisión técnica) no se guardan
 * acá: van como documentos con vencimiento de la unidad.
 */
class UnidadesService {
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

  /** Solicitudes de registro pendientes de todas las empresas (superadmin). */
  async listarPendientes() {
    return this.repo.listarPendientes();
  }

  /**
   * Edita la ficha de una unidad.
   *  - admin_empresa: solo su empresa y solo si está PENDIENTE o RECHAZADA.
   *    Si estaba RECHAZADA, al guardar vuelve a PENDIENTE (reenvío).
   *  - superadmin: cualquier unidad, sin cambiar el estado.
   */
  async editarUnidad(id, datos, sesion = {}) {
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('La unidad indicada no existe');

    const esAdmin = sesion.rol === 'admin_empresa';
    if (esAdmin) {
      if (actual.empresaId !== sesion.empresaId) {
        throw new Error('Esa unidad no pertenece a tu empresa');
      }
      if (!['PENDIENTE', 'RECHAZADA'].includes(actual.estadoRegistro)) {
        throw new Error('Solo se puede editar una solicitud pendiente o rechazada');
      }
    } else if (sesion.rol !== 'superadmin') {
      throw new Error('No tenés permiso para editar unidades');
    }

    const combinado = normalizarYValidar({ ...actual, ...datos, empresaId: actual.empresaId });
    let unidad = await this.repo.actualizar(id, combinado);

    if (esAdmin && actual.estadoRegistro === 'RECHAZADA') {
      unidad = await this.repo.cambiarEstadoRegistro(id, 'PENDIENTE', { revisadoPor: null });
    }
    return unidad;
  }

  /** El superadmin libera una solicitud: queda APROBADA y ya se puede usar. */
  async aprobarUnidad(id, sesion = {}) {
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('La unidad indicada no existe');
    return this.repo.cambiarEstadoRegistro(id, 'APROBADA', { revisadoPor: sesion.usuarioId || null });
  }

  /** El superadmin rechaza una solicitud con un motivo. El admin puede corregir y reenviar. */
  async rechazarUnidad(id, motivo, sesion = {}) {
    const texto = String(motivo || '').trim();
    if (!texto) throw new Error('El rechazo necesita un motivo');
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('La unidad indicada no existe');
    return this.repo.cambiarEstadoRegistro(id, 'RECHAZADA', {
      motivoRechazo: texto, revisadoPor: sesion.usuarioId || null
    });
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

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';

function texto(v) {
  return vacio(v) ? undefined : String(v).trim();
}

function numero(v, campo, { min = 0, max = Infinity, entero = false } = {}) {
  if (vacio(v)) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) {
    throw new Error(`${campo} no es válido`);
  }
  return n;
}

/** Acepta true/false, "SI"/"NO", "sí", "1"/"0". Vacío => undefined. */
function booleano(v, campo) {
  if (vacio(v)) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (['si', 'true', '1', 'x'].includes(s)) return true;
  if (['no', 'false', '0'].includes(s)) return false;
  throw new Error(`${campo} debe ser Sí o No`);
}

function normalizarYValidar(datos = {}) {
  const d = datos;

  if (vacio(d.empresaId)) throw new Error('empresaId es obligatorio');

  const faltan = ['placa', 'rucPropietario', 'dniTransportista'].filter((c) => vacio(d[c]));
  if (faltan.length) {
    throw new Error(`Faltan campos obligatorios: ${faltan.join(', ')}`);
  }

  const rucPropietario = String(d.rucPropietario).replace(/\D/g, '');
  if (!/^\d{11}$/.test(rucPropietario)) {
    throw new Error('El RUC del dueño debe tener exactamente 11 dígitos');
  }
  const dniTransportista = String(d.dniTransportista).replace(/\D/g, '');
  if (!/^\d{8}$/.test(dniTransportista)) {
    throw new Error('El DNI del transportista debe tener exactamente 8 dígitos');
  }

  const anioActual = new Date().getFullYear();

  const categoriaMtc = texto(d.categoriaMtc) && String(d.categoriaMtc).toUpperCase().trim();
  if (categoriaMtc && !CATEGORIAS_MTC.includes(categoriaMtc)) {
    throw new Error('La categoría MTC debe ser N1, N2 o N3');
  }

  const out = {
    empresaId: String(d.empresaId).trim(),
    placa: normalizarPlaca(d.placa),
    rucPropietario,
    dniTransportista,
    nombrePropietario: texto(d.nombrePropietario),
    direccionPropietario: texto(d.direccionPropietario),
    departamento: texto(d.departamento),
    provincia: texto(d.provincia),
    distrito: texto(d.distrito),
    tipoVehiculo: texto(d.tipoVehiculo),
    marca: texto(d.marca),
    modelo: texto(d.modelo),
    anioFabricacion: numero(d.anioFabricacion, 'El año de fabricación', { min: 1970, max: anioActual + 1, entero: true }),
    categoriaMtc: categoriaMtc || undefined,
    configuracionVehicular: texto(d.configuracionVehicular) && String(d.configuracionVehicular).toUpperCase().trim(),
    nroEjes: numero(d.nroEjes, 'El número de ejes', { min: 2, max: 12, entero: true }),
    rodadaEjeDelantero: texto(d.rodadaEjeDelantero),
    rodadaC1: texto(d.rodadaC1),
    rodadaC2: texto(d.rodadaC2),
    pesoSecoKg: numero(d.pesoSecoKg, 'El peso seco', { min: 0, max: 80000 }),
    tolvaCerrada: booleano(d.tolvaCerrada, 'Tolva cerrada'),
    carretaConPiston: booleano(d.carretaConPiston, 'Carreta con pistón'),
    unidadAGas: booleano(d.unidadAGas, 'Unidad a gas'),
    formaApertura: texto(d.formaApertura),
    alturaM: numero(d.alturaM, 'La altura', { min: 0, max: 6 }),
    anchoM: numero(d.anchoM, 'El ancho', { min: 0, max: 4 }),
    largoM: numero(d.largoM, 'El largo', { min: 0, max: 25 }),
    alturaPlataformaM: numero(d.alturaPlataformaM, 'La altura de plataforma', { min: 0, max: 4 })
  };

  // No mandamos claves sin valor: así el repo inserta solo lo que hay.
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

module.exports = { UnidadesService, CATEGORIAS_MTC, ESTADOS_REGISTRO };
