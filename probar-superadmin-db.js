// Ejecutar con:  node probar-superadmin-db.js
//
// Comprueba contra la base real:
//  - crear un superadmin (rol de plataforma, sin empresa)
//  - listar todas las empresas con su resumen
//  - crear una empresa nueva junto con su primer admin
//  - el resumen global
// Al final borra lo que creó.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { prepararEsquema } = require('./src/db/migraciones');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');
const { EmpresasService } = require('./src/empresas/empresasService');
const { EmpresasRepositorioPostgres } = require('./src/empresas/empresasRepoPostgres');

(async () => {
  await prepararEsquema();

  const usuariosRepo = new UsuariosRepositorioPostgres();
  const auth = new AuthService(usuariosRepo);
  const empresas = new EmpresasService({
    repositorioEmpresas: new EmpresasRepositorioPostgres(),
    authService: auth
  });

  const suf = String(Date.now()).slice(-6);
  const saUser = 'sa_test_' + suf;

  // 1. superadmin sin empresa
  const sa = await auth.registrarUsuario({
    username: saUser, password: 'superclave2026', nombreCompleto: 'SA Test', rol: 'superadmin'
  });
  const saFila = await usuariosRepo.buscarPorUsername(saUser);
  console.log('[superadmin creado]', sa.username, '| rol:', sa.rol, '| empresaId:', saFila.empresaId,
    saFila.empresaId === null ? '  [OK: sin empresa]' : '  [ERROR: debería ser null]');
  const login = await auth.validarCredenciales(saUser, 'superclave2026');
  console.log('[login superadmin]', login.rol, 'empresaId=', login.empresaId);

  // 2. listar empresas con resumen
  const lista = await empresas.listar();
  console.log(`[empresas: ${lista.length}]`, lista.slice(0, 3).map((e) =>
    `${e.razonSocial} (u:${e.unidadesActivas} c:${e.choferesActivos} t:${e.tickets})`).join(' | '));

  // 3. crear empresa + admin en un paso
  const rucNuevo = '20' + suf.padStart(9, '9');
  const creada = await empresas.crearConAdmin({
    ruc: rucNuevo,
    razonSocial: 'Empresa Prueba ' + suf,
    admin: { username: 'admin_' + suf, password: 'adminclave2026', nombreCompleto: 'Admin Prueba' }
  });
  console.log('[empresa creada con admin]', creada.empresa.razonSocial, '/', creada.admin.username, `(${creada.admin.rol})`);

  // el admin puede loguear y su token apunta a esa empresa
  const adminLogin = await auth.validarCredenciales('admin_' + suf, 'adminclave2026');
  console.log('[admin de la empresa nueva]', adminLogin.empresaId === creada.empresa.id ? '[OK]' : '[ERROR]');

  // rechaza RUC duplicado
  try {
    await empresas.crearConAdmin({ ruc: rucNuevo, razonSocial: 'x', admin: { username: 'y', password: 'zzzzzzzz', nombreCompleto: 'z' } });
    console.log('[ERROR] debió rechazar el RUC duplicado');
  } catch (e) { console.log('[OK] rechazó RUC duplicado:', e.message); }

  // 4. resumen global
  const resumen = await empresas.resumen();
  console.log('[resumen global]', JSON.stringify(resumen));

  // limpieza
  await pool.query('delete from usuarios where username in ($1, $2)', [saUser, 'admin_' + suf]);
  await pool.query('delete from empresas where id = $1', [creada.empresa.id]);
  console.log('[limpieza] listo');

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
