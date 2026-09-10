/**
 * Reglas de negocio de plataforma (superadmin): listar empresas con
 * resumen, crear una empresa junto con su primer usuario administrador,
 * y totales globales.
 */
class EmpresasService {
  /**
   * @param {object} deps
   * @param {object} deps.repositorioEmpresas
   * @param {import('../auth/authService').AuthService} deps.authService - para crear el primer admin
   */
  constructor({ repositorioEmpresas, authService }) {
    if (!repositorioEmpresas || !authService) {
      throw new Error('EmpresasService requiere repositorioEmpresas y authService');
    }
    this.repo = repositorioEmpresas;
    this.auth = authService;
  }

  listar() {
    return this.repo.listarConResumen();
  }

  resumen() {
    return this.repo.resumenGlobal();
  }

  async obtener(id) {
    const empresa = await this.repo.buscarPorId(id);
    if (!empresa) throw new Error('La empresa indicada no existe');
    return empresa;
  }

  /**
   * Crea la empresa y su primer usuario admin_empresa, en un mismo paso.
   * @param {{ ruc: string, razonSocial: string, admin: { username, password, nombreCompleto } }} datos
   */
  async crearConAdmin({ ruc, razonSocial, admin }) {
    const rucLimpio = String(ruc || '').trim();
    if (!/^\d{11}$/.test(rucLimpio)) {
      throw new Error('El RUC debe tener 11 dígitos');
    }
    if (!razonSocial || !String(razonSocial).trim()) {
      throw new Error('La razón social es obligatoria');
    }
    if (!admin || !admin.username || !admin.password || !admin.nombreCompleto) {
      throw new Error('Faltan datos del administrador (username, password, nombreCompleto)');
    }
    if (await this.repo.buscarPorRuc(rucLimpio)) {
      throw new Error(`Ya existe una empresa con RUC ${rucLimpio}`);
    }

    const empresa = await this.repo.crear({ ruc: rucLimpio, razonSocial: String(razonSocial).trim() });
    const usuarioAdmin = await this.auth.registrarUsuario({
      empresaId: empresa.id,
      username: admin.username,
      password: admin.password,
      nombreCompleto: admin.nombreCompleto,
      rol: 'admin_empresa'
    });

    return { empresa, admin: usuarioAdmin };
  }
}

module.exports = { EmpresasService };
