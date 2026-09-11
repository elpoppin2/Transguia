// Construye la aplicación Express de TransGuía (rutas + servicios) y la
// exporta SIN llamar a listen(). Así sirve tanto para:
//   - un servidor normal (server.js → app.listen), como
//   - una función serverless (api/index.js en Vercel).
//
// Seguridad: /api/health y /api/auth/login son públicos; el resto exige
// "Authorization: Bearer <token>". El empresaId sale del token.

const fs = require('fs');
const path = require('path');
const express = require('express');

const { crearEmisorGRE } = require('./gre/crearEmisorGRE');
const { crearToken, DURACION_MS } = require('./auth/sesion');
const { requiereSesion, requiereRol, empresaDeLaPeticion } = require('./auth/middleware');

const { AuthService } = require('./auth/authService');
const { UsuariosRepositorioPostgres } = require('./auth/usuariosRepoPostgres');
const { EmpresasService } = require('./empresas/empresasService');
const { EmpresasRepositorioPostgres } = require('./empresas/empresasRepoPostgres');
const { DashboardService } = require('./dashboard/dashboardService');
const { DashboardRepositorioPostgres } = require('./dashboard/dashboardRepoPostgres');
const { UnidadesService } = require('./unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./choferes/choferesRepoPostgres');
const { DocumentosService } = require('./documentos/documentosService');
const { DocumentosRepositorioPostgres } = require('./documentos/documentosRepoPostgres');
const { TicketService } = require('./tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./tickets/ticketsRepoPostgres');
const { MERCANCIAS, CENTROS_ORIGEN, DESTINOS } = require('./tickets/catalogos');
const { TIPOS_VEHICULO, TIPOS_RODADA, FORMAS_APERTURA } = require('./unidades/catalogosUnidad');
const { TIPOS_DOC_IDENTIDAD, DEPARTAMENTOS, CATEGORIAS_LICENCIA } = require('./choferes/catalogosChofer');
const { consultarRuc, consultarDni } = require('./consulta/consultaIdentidad');
const { decodificarPdf } = require('./documentos/archivos');

// En serverless (Vercel) la función se apaga apenas responde, así que la
// emisión de la GRE debe terminar ANTES de contestar, no en segundo
// plano. Con el simulador "demo" esto es instantáneo; con un PSE real
// habría que revisarlo (podría tardar). Autodetecta Vercel; se puede
// forzar con EMISION_SINCRONA=1 / =0.
const emisionSincrona = process.env.EMISION_SINCRONA
  ? process.env.EMISION_SINCRONA === '1'
  : !!process.env.VERCEL;

// --- repositorios y servicios ---
const usuariosRepo = new UsuariosRepositorioPostgres();
const unidadesRepo = new UnidadesRepositorioPostgres();
const choferesRepo = new ChoferesRepositorioPostgres();
const documentosRepo = new DocumentosRepositorioPostgres();
const ticketsRepo = new TicketsRepositorioPostgres();

const empresasRepo = new EmpresasRepositorioPostgres();
const authService = new AuthService(usuariosRepo);
const empresasService = new EmpresasService({ repositorioEmpresas: empresasRepo, authService });
const dashboardService = new DashboardService({
  repositorioDashboard: new DashboardRepositorioPostgres(),
  repositorioEmpresas: empresasRepo
});
const unidadesService = new UnidadesService(unidadesRepo);
const choferesService = new ChoferesService(choferesRepo);
const documentosService = new DocumentosService({
  repositorioDocumentos: documentosRepo,
  repositorioUnidades: unidadesRepo,
  repositorioChoferes: choferesRepo
});
const ticketService = new TicketService({
  emisorGRE: crearEmisorGRE(),
  repositorioTickets: ticketsRepo,
  repositorioUnidades: unidadesRepo,
  repositorioChoferes: choferesRepo,
  repositorioDocumentos: documentosRepo,
  emisionSincrona
});

// Prepara el esquema (la secuencia del código de ticket) una sola vez.
// En serverless se llama en la primera petición; en server.js, al arrancar.
let esquemaListo = null;
function prepararEsquema() {
  if (!esquemaListo) esquemaListo = ticketsRepo.asegurarEsquema();
  return esquemaListo;
}

const app = express();
// Los PDF de los documentos de la unidad viajan como base64 en el mismo
// POST (sin multipart ni storage externo), así que el body puede pesar
// varios MB: se sube el límite por defecto de express.json (100kb).
app.use(express.json({ limit: '20mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Envuelve un handler async para no repetir try/catch en cada ruta.
const h = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((error) => {
    if (!res.headersSent) res.status(error.status || 400).json({ error: error.message });
  });
};

// ==================== INTERFAZ WEB ====================
// El backend sirve también el prototipo, así el front y la API viven en
// el mismo origen y las llamadas son relativas (fetch("/api/...")): no
// hay que configurar ninguna URL de API en el navegador.
const HTML_PROTOTIPO = fs.readFileSync(
  path.join(__dirname, '..', 'transguia-prototipo.html'), 'utf8'
);
app.get(['/', '/index.html', '/prototipo'], (req, res) => {
  res.type('html').send(HTML_PROTOTIPO);
});

// ==================== PÚBLICO ====================

app.get('/api/health', (req, res) => {
  res.json({ ok: true, servicio: 'transguia', gre: process.env.GRE_PROVIDER || 'demo' });
});

app.post('/api/auth/login', h(async (req, res) => {
  const { username, password } = req.body || {};
  const usuario = await authService.validarCredenciales(username, password);
  if (!usuario) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = crearToken({ usuarioId: usuario.id, empresaId: usuario.empresaId, rol: usuario.rol });
  res.json({ ...usuario, token, expiraEnMs: DURACION_MS });
}));

// Todo lo de abajo necesita que el esquema esté listo (la secuencia del
// código de ticket). En serverless esto corre en la primera petición.
app.use('/api', (req, res, next) => {
  prepararEsquema().then(() => next()).catch(next);
});

// ==================== USUARIOS (solo admin) ====================

app.post('/api/auth/registro', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const usuario = await authService.registrarUsuario({ ...req.body, empresaId: req.sesion.empresaId });
  res.status(201).json(usuario);
}));

// ==================== PLATAFORMA (solo superadmin) ====================
// El superadmin ve todas las empresas. Para consultar los datos de UNA
// empresa usa las rutas normales con ?empresaId=<uuid>.

app.get('/api/resumen', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await empresasService.resumen());
}));

app.get('/api/empresas', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await empresasService.listar());
}));

app.post('/api/empresas', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  const { ruc, razonSocial, admin } = req.body || {};
  res.status(201).json(await empresasService.crearConAdmin({ ruc, razonSocial, admin }));
}));

// ==================== DASHBOARD ====================
// admin_empresa: su empresa (del token).
// superadmin: ?empresaId=<uuid> para una empresa, o sin él / "todas" para
// la vista acumulada de toda la plataforma.

app.get('/api/dashboard', requiereSesion, requiereRol('admin_empresa', 'superadmin'), h(async (req, res) => {
  let empresaId;
  if (req.sesion.rol === 'superadmin') {
    const q = req.query.empresaId;
    empresaId = (!q || q === 'todas') ? null : String(q);
  } else {
    empresaId = req.sesion.empresaId;
  }
  res.json(await dashboardService.generar({ empresaId, ventana: req.query.ventana }));
}));

// ==================== UNIDADES ====================

app.get('/api/unidades', requiereSesion, h(async (req, res) => {
  res.json(await unidadesService.listarUnidades(empresaDeLaPeticion(req)));
}));

app.post('/api/unidades', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const empresaId = req.sesion.empresaId;
  // El SOAT y el CITV no son columnas de la unidad: se guardan como
  // documentos con vencimiento (así los ve la pestaña "Vencimientos").
  // Para registrar una placa, la plataforma exige el PDF (base64, sin
  // multipart) de estos 5 documentos: SOAT, CITV, brevete y DNI del
  // transportista, y la constancia de categoría MTC.
  const {
    nroSoat, vigenciaSoat, nroCitv, vigenciaCitv,
    archivoSoat, archivoSoatNombre,
    archivoCitv, archivoCitvNombre,
    archivoBrevete, archivoBreveteNombre,
    archivoDni, archivoDniNombre,
    archivoCategoriaMtc, archivoCategoriaMtcNombre,
    ...datosUnidad
  } = req.body || {};

  if (!vigenciaSoat) throw new Error('Falta la fecha de vigencia del SOAT');
  if (!vigenciaCitv) throw new Error('Falta la fecha de vigencia del CITV');
  // Decodifica y valida los 5 PDF ANTES de crear la unidad: si falta uno
  // o no es un PDF válido, no se registra nada.
  const pdfSoat = decodificarPdf(archivoSoat, 'SOAT');
  const pdfCitv = decodificarPdf(archivoCitv, 'CITV');
  const pdfBrevete = decodificarPdf(archivoBrevete, 'brevete del transportista');
  const pdfDni = decodificarPdf(archivoDni, 'DNI del transportista');
  const pdfCategoriaMtc = decodificarPdf(archivoCategoriaMtc, 'categoría MTC');

  const unidad = await unidadesService.registrarUnidad({ ...datosUnidad, empresaId });

  const avisos = [];
  const guardarDoc = async (tipo, numero, vencimiento, archivo, archivoNombre, etiqueta) => {
    try {
      await documentosService.agregarAUnidad(empresaId, unidad.id, {
        tipoDocumento: tipo, numeroDocumento: numero || null, fechaVencimiento: vencimiento || null,
        archivo, archivoNombre: archivoNombre || `${etiqueta}.pdf`, archivoTipo: 'application/pdf'
      });
    } catch (e) {
      avisos.push(`${etiqueta}: ${e.message}`);
    }
  };
  await guardarDoc('SOAT', nroSoat, vigenciaSoat, pdfSoat, archivoSoatNombre, 'SOAT');
  await guardarDoc('REVISION_TECNICA', nroCitv, vigenciaCitv, pdfCitv, archivoCitvNombre, 'CITV');
  await guardarDoc('BREVETE_TRANSPORTISTA', null, null, pdfBrevete, archivoBreveteNombre, 'Brevete del transportista');
  await guardarDoc('DNI_TRANSPORTISTA', null, null, pdfDni, archivoDniNombre, 'DNI del transportista');
  await guardarDoc('CATEGORIA_MTC', null, null, pdfCategoriaMtc, archivoCategoriaMtcNombre, 'Categoría MTC');

  res.status(201).json(avisos.length ? { ...unidad, avisos } : unidad);
}));

// Solicitudes de registro pendientes de todas las empresas (superadmin).
// Va antes de las rutas con :id para que "pendientes" no se tome como id.
app.get('/api/unidades/pendientes', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await unidadesService.listarPendientes());
}));

// Editar la ficha: admin_empresa (su unidad, si está pendiente o
// rechazada) o superadmin (cualquiera, sin cambiar el estado).
app.put('/api/unidades/:id', requiereSesion, requiereRol('admin_empresa', 'superadmin'), h(async (req, res) => {
  res.json(await unidadesService.editarUnidad(req.params.id, req.body || {}, req.sesion));
}));

// El superadmin libera o rechaza (con motivo) una solicitud.
app.post('/api/unidades/:id/aprobar', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await unidadesService.aprobarUnidad(req.params.id, req.sesion));
}));

app.post('/api/unidades/:id/rechazar', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await unidadesService.rechazarUnidad(req.params.id, (req.body || {}).motivo, req.sesion));
}));

app.post('/api/unidades/:id/desactivar', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  res.json(await unidadesService.desactivarUnidad(req.params.id));
}));

app.get('/api/unidades/:id/documentos', requiereSesion, h(async (req, res) => {
  res.json(await documentosService.listarDeUnidad(empresaDeLaPeticion(req), req.params.id));
}));

app.post('/api/unidades/:id/documentos', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const doc = await documentosService.agregarAUnidad(req.sesion.empresaId, req.params.id, req.body);
  res.status(201).json(doc);
}));

// El PDF de un documento de la unidad (lo puede ver cualquiera con
// acceso a la unidad, no solo el admin: el superadmin lo necesita para
// revisar una solicitud antes de liberarla).
app.get('/api/unidades/:id/documentos/:docId/archivo', requiereSesion, h(async (req, res) => {
  const archivo = await documentosService.obtenerArchivoDeUnidad(
    empresaDeLaPeticion(req), req.params.id, req.params.docId
  );
  res.set('Content-Type', archivo.archivoTipo || 'application/pdf');
  res.set('Content-Disposition', `inline; filename="${archivo.archivoNombre || 'documento.pdf'}"`);
  res.send(archivo.archivo);
}));

app.delete('/api/unidades/:id/documentos/:docId', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  await documentosService.eliminarDeUnidad(req.sesion.empresaId, req.params.id, req.params.docId);
  res.json({ ok: true });
}));

// ==================== CHOFERES ====================

app.get('/api/choferes', requiereSesion, h(async (req, res) => {
  res.json(await choferesService.listarChoferes(empresaDeLaPeticion(req)));
}));

app.post('/api/choferes', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const empresaId = req.sesion.empresaId;
  // El brevete no es columna del chofer: va como documento LICENCIA_CONDUCIR.
  const { brevete, claseCategoria, fechaExpedicion, fechaRevalidacion, ...datosChofer } = req.body || {};
  const chofer = await choferesService.registrarChofer({ ...datosChofer, empresaId });

  const avisos = [];
  if (fechaRevalidacion || brevete || claseCategoria) {
    if (!fechaRevalidacion) {
      avisos.push('Brevete: falta la fecha de revalidación, no se guardó');
    } else {
      try {
        await documentosService.agregarAChofer(empresaId, chofer.id, {
          tipoDocumento: 'LICENCIA_CONDUCIR',
          numeroDocumento: brevete || null,
          categoriaLicencia: claseCategoria || undefined,
          fechaEmision: fechaExpedicion || undefined,
          fechaVencimiento: fechaRevalidacion
        });
      } catch (e) {
        avisos.push(`Brevete: ${e.message}`);
      }
    }
  }
  res.status(201).json(avisos.length ? { ...chofer, avisos } : chofer);
}));

// Solicitudes de registro de choferes pendientes (superadmin). Antes de
// las rutas con :id para que "pendientes" no se tome como id.
app.get('/api/choferes/pendientes', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await choferesService.listarPendientes());
}));

app.put('/api/choferes/:id', requiereSesion, requiereRol('admin_empresa', 'superadmin'), h(async (req, res) => {
  res.json(await choferesService.editarChofer(req.params.id, req.body || {}, req.sesion));
}));

app.post('/api/choferes/:id/aprobar', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await choferesService.aprobarChofer(req.params.id, req.sesion));
}));

app.post('/api/choferes/:id/rechazar', requiereSesion, requiereRol('superadmin'), h(async (req, res) => {
  res.json(await choferesService.rechazarChofer(req.params.id, (req.body || {}).motivo, req.sesion));
}));

app.post('/api/choferes/:id/desactivar', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  res.json(await choferesService.desactivarChofer(req.params.id));
}));

app.get('/api/choferes/:id/documentos', requiereSesion, h(async (req, res) => {
  res.json(await documentosService.listarDeChofer(empresaDeLaPeticion(req), req.params.id));
}));

app.post('/api/choferes/:id/documentos', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const doc = await documentosService.agregarAChofer(req.sesion.empresaId, req.params.id, req.body);
  res.status(201).json(doc);
}));

app.delete('/api/choferes/:id/documentos/:docId', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  await documentosService.eliminarDeChofer(req.sesion.empresaId, req.params.id, req.params.docId);
  res.json({ ok: true });
}));

// ==================== VENCIMIENTOS ====================

app.get('/api/vencimientos', requiereSesion, h(async (req, res) => {
  res.json(await documentosService.vencimientosProximos(empresaDeLaPeticion(req), req.query.dias));
}));

// ==================== CATÁLOGOS ====================
// Listas fijas que el front usa para armar los desplegables del ticket.
// Fuente única de verdad en el backend (así el front no las duplica).

app.get('/api/catalogos', requiereSesion, (req, res) => {
  res.json({
    mercancias: MERCANCIAS,
    centrosOrigen: CENTROS_ORIGEN,
    destinos: DESTINOS,
    tiposVehiculo: TIPOS_VEHICULO,
    tiposRodada: TIPOS_RODADA,
    formasApertura: FORMAS_APERTURA,
    tiposDocIdentidad: TIPOS_DOC_IDENTIDAD,
    departamentos: DEPARTAMENTOS,
    categoriasLicencia: CATEGORIAS_LICENCIA
  });
});

// Autocompletar por RUC / DNI. Hoy responde { configurado: false }
// (todavía sin proveedor externo); ver src/consulta/consultaIdentidad.js.
app.get('/api/consulta/ruc/:ruc', requiereSesion, h(async (req, res) => {
  res.json(await consultarRuc(req.params.ruc));
}));
app.get('/api/consulta/dni/:dni', requiereSesion, h(async (req, res) => {
  res.json(await consultarDni(req.params.dni));
}));

// ==================== TICKETS ====================

app.post('/api/tickets', requiereSesion, requiereRol('admin_empresa', 'operador'), h(async (req, res) => {
  const ticket = await ticketService.crearTicket({
    ...req.body,
    empresaId: req.sesion.empresaId,
    creadoPor: req.sesion.usuarioId
  });
  res.status(201).json(ticket);
}));

app.get('/api/tickets', requiereSesion, h(async (req, res) => {
  res.json(await ticketService.listarTickets(empresaDeLaPeticion(req)));
}));

app.get('/api/tickets/:id', requiereSesion, h(async (req, res) => {
  const ticket = await ticketService.obtenerTicket(req.params.id);
  if (!ticket || ticket.empresaId !== empresaDeLaPeticion(req)) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }
  res.json(ticket);
}));

// Línea de tiempo del ticket (cada cambio de estado, con quién lo hizo).
app.get('/api/tickets/:id/historial', requiereSesion, h(async (req, res) => {
  const ticket = await ticketService.obtenerTicket(req.params.id);
  if (!ticket || ticket.empresaId !== empresaDeLaPeticion(req)) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }
  res.json(await ticketService.obtenerHistorial(req.params.id));
}));

app.post('/api/tickets/:id/avanzar', requiereSesion, requiereRol('admin_empresa', 'operador'), h(async (req, res) => {
  const actual = await ticketService.obtenerTicket(req.params.id);
  if (!actual || actual.empresaId !== req.sesion.empresaId) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }
  const ticket = await ticketService.avanzarEstado(req.params.id, req.body.estadoOperativo, req.sesion.usuarioId);
  res.json(ticket);
}));

module.exports = { app, prepararEsquema, emisionSincrona };
