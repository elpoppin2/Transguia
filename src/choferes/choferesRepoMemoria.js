const crypto = require('crypto');

/**
 * Guarda los choferes en memoria: se pierden al reiniciar el proceso.
 * Tiene exactamente los mismos métodos que choferesRepoPostgres.js, para
 * que choferesService.js no distinga cuál está usando.
 */
class ChoferesRepositorioMemoria {
  constructor() {
    this.choferes = new Map(); // id -> chofer
  }

  async listarPorEmpresa(empresaId) {
    return Array.from(this.choferes.values())
      .filter((c) => c.empresaId === empresaId)
      .sort((a, b) => a.apellidos.localeCompare(b.apellidos));
  }

  async buscarPorDni(empresaId, dni) {
    return (
      Array.from(this.choferes.values()).find(
        (c) => c.empresaId === empresaId && c.dni === dni
      ) || null
    );
  }

  async buscarPorId(id) {
    return this.choferes.get(id) || null;
  }

  async crearChofer(datos) {
    if (await this.buscarPorDni(datos.empresaId, datos.dni)) {
      throw new Error('Ya existe un chofer con ese documento en esta empresa');
    }
    const chofer = {
      id: crypto.randomUUID(),
      activo: true,
      creadoEn: new Date().toISOString(),
      ...datos
    };
    this.choferes.set(chofer.id, chofer);
    return chofer;
  }

  async actualizar(id, datos) {
    const chofer = this.choferes.get(id);
    if (!chofer) throw new Error('El chofer indicado no existe');
    for (const [k, v] of Object.entries(datos)) {
      if (k === 'empresaId' || v === undefined) continue;
      chofer[k] = v;
    }
    return chofer;
  }

  async cambiarEstadoRegistro(id, estadoRegistro, { motivoRechazo = null, revisadoPor = null } = {}) {
    const chofer = this.choferes.get(id);
    if (!chofer) throw new Error('El chofer indicado no existe');
    Object.assign(chofer, { estadoRegistro, motivoRechazo, revisadoPor, revisadoEn: new Date().toISOString() });
    return chofer;
  }

  async listarPendientes() {
    return Array.from(this.choferes.values()).filter((c) => c.estadoRegistro === 'PENDIENTE');
  }

  async cambiarActivo(id, activo) {
    const chofer = this.choferes.get(id);
    if (!chofer) throw new Error('El chofer indicado no existe');
    chofer.activo = activo;
    return chofer;
  }
}

module.exports = { ChoferesRepositorioMemoria };
