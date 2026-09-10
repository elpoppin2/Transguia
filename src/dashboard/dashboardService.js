const ESTADOS = ['GENERADO', 'EN_TRANSITO', 'ENTREGADO', 'ANULADO'];

/**
 * Arma los datos del dashboard para una empresa (o todas, si empresaId
 * es null: vista acumulada del superadmin).
 */
class DashboardService {
  /**
   * @param {object} deps
   * @param {object} deps.repositorioDashboard
   * @param {object} deps.repositorioEmpresas - para resolver el nombre de la empresa
   */
  constructor({ repositorioDashboard, repositorioEmpresas }) {
    if (!repositorioDashboard || !repositorioEmpresas) {
      throw new Error('DashboardService requiere repositorioDashboard y repositorioEmpresas');
    }
    this.repo = repositorioDashboard;
    this.empresas = repositorioEmpresas;
  }

  /**
   * @param {{ empresaId: string|null, agrupar?: 'dia'|'mes' }} opciones
   */
  async generar({ empresaId = null, agrupar }) {
    const agrupacion = agrupar === 'mes' ? 'mes' : 'dia';

    let alcance = 'Todas las empresas';
    if (empresaId) {
      const empresa = await this.empresas.buscarPorId(empresaId);
      if (!empresa) throw new Error('La empresa indicada no existe');
      alcance = empresa.razonSocial;
    }

    const [periodo, estado, materiales, tiempos] = await Promise.all([
      this.repo.trasladosPorPeriodo(empresaId, agrupacion),
      this.repo.porEstado(empresaId),
      this.repo.toneladasPorMaterial(empresaId),
      this.repo.tiemposFinalizacion(empresaId)
    ]);

    const porEstadoOperativo = Object.fromEntries(ESTADOS.map((e) => [e, 0]));
    for (const r of estado) {
      if (r.estado in porEstadoOperativo) porEstadoOperativo[r.estado] = r.cantidad;
    }

    const horas = tiempos.map((t) => t.horas);
    const tiempoFinalizacion = horas.length
      ? {
          promedioHoras: redondear(horas.reduce((a, b) => a + b, 0) / horas.length),
          minHoras: redondear(Math.min(...horas)),
          maxHoras: redondear(Math.max(...horas)),
          muestras: horas.length,
          recientes: tiempos.slice(0, 12)
        }
      : { promedioHoras: null, minHoras: null, maxHoras: null, muestras: 0, recientes: [] };

    return {
      alcance,
      agrupacion,
      trasladosPorPeriodo: periodo,          // [{ periodo, cantidad }]
      porEstadoOperativo,                    // { GENERADO, EN_TRANSITO, ENTREGADO, ANULADO }
      toneladasPorMaterial: materiales,      // [{ material, toneladas, traslados }]
      tiempoFinalizacion                     // { promedioHoras, minHoras, maxHoras, muestras, recientes }
    };
  }
}

const redondear = (n) => Math.round(n * 10) / 10;

module.exports = { DashboardService };
