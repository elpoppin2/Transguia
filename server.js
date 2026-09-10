// API mínima para conectar el prototipo web (transguia-prototipo.html) a
// este backend real. Requiere: npm install express dotenv
//
// Ejecutar con:  node server.js

require('dotenv').config();
const express = require('express');
const { crearEmisorGRE } = require('./src/gre/crearEmisorGRE');
const { TicketService } = require('./src/tickets/ticketService');
const { TicketsRepositorioPostgres } = require('./src/tickets/ticketsRepoPostgres');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');
const { UnidadesService } = require('./src/unidades/unidadesService');
const { UnidadesRepositorioPostgres } = require('./src/unidades/unidadesRepoPostgres');
const { ChoferesService } = require('./src/choferes/choferesService');
const { ChoferesRepositorioPostgres } = require('./src/choferes/choferesRepoPostgres');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  next();
});

const usuariosRepo = new UsuariosRepositorioPostgres();
const unidadesRepo = new UnidadesRepositorioPostgres();
const choferesRepo = new ChoferesRepositorioPostgres();
const ticketsRepo = new TicketsRepositorioPostgres();

const authService = new AuthService(usuariosRepo);
const unidadesService = new UnidadesService(unidadesRepo);
const choferesService = new ChoferesService(choferesRepo);
const ticketService = new TicketService({
  emisorGRE: crearEmisorGRE(),
  repositorioTickets: ticketsRepo,
  repositorioUnidades: unidadesRepo,
  repositorioChoferes: choferesRepo
});

app.post('/api/auth/registro', async (req, res) => {
  try {
    const usuario = await authService.registrarUsuario(req.body);
    res.status(201).json(usuario);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const usuario = await authService.validarCredenciales(username, password);
  if (!usuario) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  res.json(usuario);
});

app.get('/api/unidades', async (req, res) => {
  try {
    const unidades = await unidadesService.listarUnidades(req.query.empresaId);
    res.json(unidades);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/unidades', async (req, res) => {
  try {
    const unidad = await unidadesService.registrarUnidad(req.body);
    res.status(201).json(unidad);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/unidades/:id/desactivar', async (req, res) => {
  try {
    const unidad = await unidadesService.desactivarUnidad(req.params.id);
    res.json(unidad);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/choferes', async (req, res) => {
  try {
    const choferes = await choferesService.listarChoferes(req.query.empresaId);
    res.json(choferes);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/choferes', async (req, res) => {
  try {
    const chofer = await choferesService.registrarChofer(req.body);
    res.status(201).json(chofer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/choferes/:id/desactivar', async (req, res) => {
  try {
    const chofer = await choferesService.desactivarChofer(req.params.id);
    res.json(chofer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/tickets', async (req, res) => {
  try {
    const ticket = await ticketService.crearTicket(req.body);
    res.status(201).json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    res.json(await ticketService.listarTickets(req.query.empresaId));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/tickets/:id', async (req, res) => {
  const ticket = await ticketService.obtenerTicket(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  res.json(ticket);
});

app.post('/api/tickets/:id/avanzar', async (req, res) => {
  try {
    const ticket = await ticketService.avanzarEstado(req.params.id, req.body.estadoOperativo);
    res.json(ticket);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const PUERTO = process.env.PORT || 3001;

// Prepara lo que la base necesita (la secuencia del código de ticket) y
// recién ahí levanta el servidor.
ticketsRepo
  .asegurarEsquema()
  .then(() => {
    app.listen(PUERTO, () => {
      console.log(`API de TransGuía escuchando en http://localhost:${PUERTO}`);
      console.log(`Proveedor de GRE activo: ${process.env.GRE_PROVIDER || 'demo'}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo preparar la base de datos al arrancar:', error.message);
    process.exit(1);
  });
