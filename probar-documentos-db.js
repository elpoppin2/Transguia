// Ejecutar con:  node probar-documentos-db.js
//
// Comprueba, contra la base real de Supabase:
//  - agregar documentos a una unidad y a un chofer
//  - que /vencimientos (la vista vencimientos_proximos) los detecta
//  - que la licencia vigente del chofer llega a la emisión de la GRE
// Al final borra todo lo que creó.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { EmisorGREDemo } = require('./src/gre/EmisorGREDemo');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');
const { DocumentosService } = require('./src/documentos/documentosService');
const { DocumentosRepositorioPostgres } = require('./src/documentos/documentosRepoPostgres');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');

const enDias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

(async () => {
  const { rows: empresas } = await pool.query('select id, razon_social from empresas limit 1');
  if (empresas.length === 0) { console.log('Corre primero probar-conexion-db.js.'); await pool.end(); return; }
  const empresa = empresas[0];
  console.log('[empresa]', empresa.razon_social);

  const unidadesRepo = new UnidadesRepositorioPostgres();
  const choferesRepo = new ChoferesRepositorioPostgres();
  const documentosRepo = new DocumentosRepositorioPostgres();
  const ticketsRepo = new TicketsRepositorioPostgres();
  await ticketsRepo.asegurarEsquema();

  const unidades = new UnidadesService(unidadesRepo);
  const choferes = new ChoferesService(choferesRepo);
  const documentos = new DocumentosService({
    repositorioDocumentos: documentosRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo
  });

  const s = String(Date.now()).slice(-6);
  const unidad = await unidades.registrarUnidad({
    empresaId: empresa.id, placa: `DC${s[0]}-${s.slice(1, 4)}`,
    rucPropietario: '20548712369', dniTransportista: '45678912',
    marca: 'MAN', modelo: 'TGX', anioFabricacion: 2023, categoriaMtc: 'N3', configuracionVehicular: 'T3S3'
  });
  const chofer = await choferes.registrarChofer({
    empresaId: empresa.id, dni: ('5' + s + '0').slice(0, 8), nombres: 'Ana', apellidos: 'Ríos Paz'
  });
  console.log('[unidad]', unidad.placa, ' [chofer]', chofer.dni);

  // Documentos: SOAT de la unidad (vence en 10 días) y licencia del chofer (en 40).
  const soat = await documentos.agregarAUnidad(empresa.id, unidad.id, {
    tipoDocumento: 'SOAT', numeroDocumento: 'SOAT-TEST', fechaVencimiento: enDias(10)
  });
  const lic = await documentos.agregarAChofer(empresa.id, chofer.id, {
    tipoDocumento: 'LICENCIA_CONDUCIR', categoriaLicencia: 'A-IIIc',
    numeroDocumento: 'Q' + chofer.dni, fechaVencimiento: enDias(40)
  });
  console.log('[documentos agregados] SOAT vence', soat.fechaVencimiento, '| licencia vence', lic.fechaVencimiento);

  const venc30 = await documentos.vencimientosProximos(empresa.id, 30);
  const mios = venc30.filter((v) => v.referencia === unidad.placa || v.referencia === `${chofer.nombres} ${chofer.apellidos}`);
  console.log(`[vencimientos <=30 días] ${mios.length} de los míos:`,
    mios.map((v) => `${v.documento}(${v.diasRestantes}d)`).join(' '));
  if (!mios.some((v) => v.documento === 'SOAT')) console.log('[ERROR] el SOAT debió aparecer');
  if (mios.some((v) => v.documento === 'LICENCIA_CONDUCIR')) console.log('[ERROR] la licencia (40 días) NO debía aparecer en <=30');

  const licVigente = await documentos.licenciaVigenteDeChofer(chofer.id);
  console.log('[licencia vigente del chofer]', licVigente && licVigente.numeroDocumento);

  // La licencia debe llegar al emisor de la GRE.
  let licenciaVista = null;
  const emisorEspia = {
    async emitir(datos) {
      licenciaVista = datos.choferLicencia;
      return { estado: 'ACEPTADO', serieCorrelativo: 'T999-000001', hash: 'x', motivoRechazo: null, proveedor: 'demo' };
    }
  };
  const ticketService = new TicketService({
    emisorGRE: emisorEspia,
    repositorioTickets: ticketsRepo,
    repositorioUnidades: unidadesRepo,
    repositorioChoferes: choferesRepo,
    repositorioDocumentos: documentosRepo,
    proveedorGre: 'demo'
  });
  const ticket = await new Promise((resolve, reject) => {
    ticketService.crearTicket({
      empresaId: empresa.id, unidadId: unidad.id, choferId: chofer.id,
      origen: 'Juscamaita', destino: 'Atocongo', descripcionMercancia: 'Puzolana Terceros', pesoBrutoKg: 3000
    }, resolve).catch(reject);
  });
  console.log('[GRE recibió choferLicencia =]', licenciaVista,
    licenciaVista === ('Q' + chofer.dni) ? '  [OK]' : '  [ERROR]');

  // Limpieza
  await pool.query('delete from emisiones_gre where ticket_id = $1', [ticket.id]);
  await pool.query('delete from historial_estado_ticket where ticket_id = $1', [ticket.id]);
  await pool.query('delete from tickets_traslado where id = $1', [ticket.id]);
  await pool.query('delete from documentos_unidad where unidad_id = $1', [unidad.id]);
  await pool.query('delete from documentos_chofer where chofer_id = $1', [chofer.id]);
  await pool.query('delete from unidades where id = $1', [unidad.id]);
  await pool.query('delete from choferes where id = $1', [chofer.id]);
  console.log('[limpieza] listo');

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
