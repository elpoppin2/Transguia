/**
 * Reglas de negocio para registrar y listar choferes. No sabe si los
 * datos se guardan en memoria o en Postgres: eso lo decide el
 * repositorio que recibe por constructor.
 *
 * Alcance: solo los datos de identidad del chofer (tabla `choferes`).
 * Sus documentos (licencia de conducir, certificado médico y sus
 * vencimientos) van en la tabla `documentos_chofer`, que es un paso
 * aparte más adelante.
 */
class ChoferesService {
  /**
   * @param {{ listarPorEmpresa: Function, buscarPorDni: Function, crearChofer: Function, cambiarActivo: Function }} repositorioChoferes
   */
  constructor(repositorioChoferes) {
    this.repo = repositorioChoferes;
  }

  async listarChoferes(empresaId) {
    if (!empresaId) throw new Error('empresaId es obligatorio');
    return this.repo.listarPorEmpresa(empresaId);
  }

  async registrarChofer(datos) {
    const chofer = normalizarYValidar(datos);

    const existente = await this.repo.buscarPorDni(chofer.empresaId, chofer.dni);
    if (existente) {
      throw new Error('Ya existe un chofer con ese DNI en esta empresa');
    }

    return this.repo.crearChofer(chofer);
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

function normalizarYValidar({ empresaId, dni, nombres, apellidos }) {
  const obligatorios = { empresaId, dni, nombres, apellidos };
  const faltantes = Object.entries(obligatorios)
    .filter(([, valor]) => valor === undefined || valor === null || String(valor).trim() === '')
    .map(([campo]) => campo);
  if (faltantes.length) {
    throw new Error(`Faltan campos obligatorios: ${faltantes.join(', ')}`);
  }

  const dniLimpio = String(dni).trim();
  if (!/^\d{8}$/.test(dniLimpio)) {
    throw new Error('El DNI debe tener exactamente 8 dígitos');
  }

  return {
    empresaId: String(empresaId).trim(),
    dni: dniLimpio,
    nombres: String(nombres).trim(),
    apellidos: String(apellidos).trim()
  };
}

module.exports = { ChoferesService };
