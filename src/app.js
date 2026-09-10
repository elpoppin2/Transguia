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
const { MERCANCIAS } = require('./tickets/mercancias');

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
app.use(express.json());
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
  res.json(await dashboardService.generar({ empresaId, agrupar: req.query.agrupar }));
}));

// ==================== UNIDADES ====================

app.get('/api/unidades', requiereSesion, h(async (req, res) => {
  res.json(await unidadesService.listarUnidades(empresaDeLaPeticion(req)));
}));

app.post('/api/unidades', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const unidad = await unidadesService.registrarUnidad({ ...req.body, empresaId: req.sesion.empresaId });
  res.status(201).json(unidad);
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

app.delete('/api/unidades/:id/documentos/:docId', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  await documentosService.eliminarDeUnidad(req.sesion.empresaId, req.params.id, req.params.docId);
  res.json({ ok: true });
}));

// ==================== CHOFERES ====================

app.get('/api/choferes', requiereSesion, h(async (req, res) => {
  res.json(await choferesService.listarChoferes(empresaDeLaPeticion(req)));
}));

app.post('/api/choferes', requiereSesion, requiereRol('admin_empresa'), h(async (req, res) => {
  const chofer = await choferesService.registrarChofer({ ...req.body, empresaId: req.sesion.empresaId });
  res.status(201).json(chofer);
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
// Listas fijas que el front usa para armar desplegables. Fuente única de
// verdad en el backend (así el front no las duplica).

app.get('/api/catalogos/mercancias', requiereSesion, (req, res) => {
  res.json({ mercancias: MERCANCIAS });
});

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

app.post('/api/tickets/:id/avanzar', requiereSesion, requiereRol('admin_empresa', 'operador'), h(async (req, res) => {
  const actual = await ticketService.obtenerTicket(req.params.id);
  if (!actual || actual.empresaId !== req.sesion.empresaId) {
    return res.status(404).json({ error: 'Ticket no encontrado' });
  }
  const ticket = await ticketService.avanzarEstado(req.params.id, req.body.estadoOperativo, req.sesion.usuarioId);
  res.json(ticket);
}));

module.exports = { app, prepararEsquema, emisionSincrona };
