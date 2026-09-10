/**
 * Reglas de negocio para registrar, editar y aprobar choferes. No sabe si
 * los datos se guardan en memoria o en Postgres: eso lo decide el
 * repositorio que recibe por constructor.
 *
 * Obligatorios al registrar: tipoDocIdentidad + dni (documento),
 * primerNombre y apellidoPaterno. El resto (segundo nombre, apellido
 * materno, celular, ubicación, dirección) es opcional.
 *
 * El chofer nace en estado PENDIENTE; el superadmin lo libera (APROBADA) o
 * lo rechaza con motivo (RECHAZADA). Solo los APROBADOS se pueden usar
 * para emitir tickets.
 *
 * El brevete (nº de licencia, clase-categoría, fecha de expedición y de
 * revalidación) NO se guarda acá: va como documento LICENCIA_CONDUCIR.
 */
const TIPOS_DOC = ['DNI', 'CE', 'PASAPORTE'];
const ESTADOS_REGISTRO = ['PENDIENTE', 'APROBADA', 'RECHAZADA'];

class ChoferesService {
  constructor(repositorioChoferes) {
    this.repo = repositorioChoferes;
  }

  async listarChoferes(empresaId) {
    if (!empresaId) throw new Error('empresaId es obligatorio');
    return this.repo.listarPorEmpresa(empresaId);
  }

  async listarPendientes() {
    return this.repo.listarPendientes();
  }

  async registrarChofer(datos) {
    const chofer = normalizarYValidar(datos);
    const existente = await this.repo.buscarPorDni(chofer.empresaId, chofer.dni);
    if (existente) {
      throw new Error('Ya existe un chofer con ese documento en esta empresa');
    }
    return this.repo.crearChofer(chofer);
  }

  /**
   * Edita la ficha.
   *  - admin_empresa: su chofer y solo si está PENDIENTE o RECHAZADA.
   *    Si estaba RECHAZADA, al guardar vuelve a PENDIENTE (reenvío).
   *  - superadmin: cualquiera, sin cambiar el estado.
   */
  async editarChofer(id, datos, sesion = {}) {
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('El chofer indicado no existe');

    const esAdmin = sesion.rol === 'admin_empresa';
    if (esAdmin) {
      if (actual.empresaId !== sesion.empresaId) {
        throw new Error('Ese chofer no pertenece a tu empresa');
      }
      if (!['PENDIENTE', 'RECHAZADA'].includes(actual.estadoRegistro)) {
        throw new Error('Solo se puede editar una solicitud pendiente o rechazada');
      }
    } else if (sesion.rol !== 'superadmin') {
      throw new Error('No tenés permiso para editar choferes');
    }

    const combinado = normalizarYValidar({ ...actual, ...datos, empresaId: actual.empresaId });
    let chofer = await this.repo.actualizar(id, combinado);

    if (esAdmin && actual.estadoRegistro === 'RECHAZADA') {
      chofer = await this.repo.cambiarEstadoRegistro(id, 'PENDIENTE', { revisadoPor: null });
    }
    return chofer;
  }

  async aprobarChofer(id, sesion = {}) {
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('El chofer indicado no existe');
    return this.repo.cambiarEstadoRegistro(id, 'APROBADA', { revisadoPor: sesion.usuarioId || null });
  }

  async rechazarChofer(id, motivo, sesion = {}) {
    const texto = String(motivo || '').trim();
    if (!texto) throw new Error('El rechazo necesita un motivo');
    const actual = await this.repo.buscarPorId(id);
    if (!actual) throw new Error('El chofer indicado no existe');
    return this.repo.cambiarEstadoRegistro(id, 'RECHAZADA', {
      motivoRechazo: texto, revisadoPor: sesion.usuarioId || null
    });
  }

  async desactivarChofer(id) {
    if (!id) throw new Error('id es obligatorio');
    return this.repo.cambiarActivo(id, false);
  }

  async reactivarChofer(id) {
    if (!id) throw new Error('id es obligatorio');
    return this.repo.cambiarActivo(id, true);
  }
}

const vacio = (v) => v === undefined || v === null || String(v).trim() === '';
const texto = (v) => (vacio(v) ? undefined : String(v).trim());

function normalizarYValidar(d = {}) {
  if (vacio(d.empresaId)) throw new Error('empresaId es obligatorio');

  // Partes del nombre: modo nuevo (4 campos) o compat (nombres/apellidos).
  let apellidoPaterno = texto(d.apellidoPaterno);
  let apellidoMaterno = texto(d.apellidoMaterno);
  let primerNombre = texto(d.primerNombre);
  let segundoNombre = texto(d.segundoNombre);
  if (!apellidoPaterno && !primerNombre && (d.nombres || d.apellidos)) {
    const ap = String(d.apellidos || '').trim().split(/\s+/).filter(Boolean);
    apellidoPaterno = ap[0];
    apellidoMaterno = ap.slice(1).join(' ') || undefined;
    const no = String(d.nombres || '').trim().split(/\s+/).filter(Boolean);
    primerNombre = no[0];
    segundoNombre = no.slice(1).join(' ') || undefined;
  }

  const tipoDoc = String(d.tipoDocIdentidad || 'DNI').toUpperCase().trim();
  if (!TIPOS_DOC.includes(tipoDoc)) {
    throw new Error(`El tipo de documento debe ser uno de: ${TIPOS_DOC.join(', ')}`);
  }
  const doc = String(d.dni || '').trim().toUpperCase();
  if (tipoDoc === 'DNI') {
    if (!/^\d{8}$/.test(doc)) throw new Error('El DNI debe tener exactamente 8 dígitos');
  } else if (!/^[A-Z0-9]{6,15}$/.test(doc)) {
    throw new Error('El documento debe tener entre 6 y 15 caracteres (letras y números)');
  }

  const faltan = [];
  if (!doc) faltan.push('dni');
  if (!primerNombre) faltan.push('primerNombre');
  if (!apellidoPaterno) faltan.push('apellidoPaterno');
  if (faltan.length) throw new Error(`Faltan campos obligatorios: ${faltan.join(', ')}`);

  const nombres = [primerNombre, segundoNombre].filter(Boolean).join(' ');
  const apellidos = [apellidoPaterno, apellidoMaterno].filter(Boolean).join(' ');

  const out = {
    empresaId: String(d.empresaId).trim(),
    tipoDocIdentidad: tipoDoc,
    dni: doc,
    apellidoPaterno,
    apellidoMaterno,
    primerNombre,
    segundoNombre,
    nombres,
    apellidos,
    celular: texto(d.celular),
    departamento: texto(d.departamento),
    provincia: texto(d.provincia),
    distrito: texto(d.distrito),
    direccion: texto(d.direccion)
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

module.exports = { ChoferesService, ESTADOS_REGISTRO };
