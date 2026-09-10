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

  async crearChofer({ empresaId, dni, nombres, apellidos }) {
    if (await this.buscarPorDni(empresaId, dni)) {
      throw new Error('Ya existe un chofer con ese DNI en esta empresa');
    }
    const chofer = {
      id: crypto.randomUUID(),
      empresaId,
      dni,
      nombres,
      apellidos,
      activo: true,
      creadoEn: new Date().toISOString()
    };
    this.choferes.set(chofer.id, chofer);
    return chofer;
  }

  async cambiarActivo(id, activo) {
    const chofer = this.choferes.get(id);
    if (!chofer) throw new Error('El chofer indicado no existe');
    chofer.activo = activo;
    return chofer;
  }
}

module.exports = { ChoferesRepositorioMemoria };
