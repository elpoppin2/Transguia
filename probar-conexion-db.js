// Ejecutar con:  node probar-conexion-db.js
// Requiere: haber creado tu archivo .env con DATABASE_URL, y haber
// corrido "npm install" después de agregar "pg" a package.json.

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');

(async () => {
  try {
    const { rows } = await pool.query('select now()');
    console.log('[conexión OK] hora del servidor de la base de datos:', rows[0].now);
  } catch (error) {
    console.error('[error de conexión] revisa tu DATABASE_URL en .env:', error.message);
    process.exit(1);
  }

  const { rows: empresas } = await pool.query('select id, razon_social from empresas limit 1');

  if (empresas.length === 0) {
    console.log(`
No hay ninguna empresa registrada todavía. Ve al SQL Editor de Supabase y corre:

  insert into empresas (ruc, razon_social) values ('20548712369', 'Transportes Andina S.A.C.');

y vuelve a correr:  node probar-conexion-db.js
`);
    await pool.end();
    return;
  }

  const empresa = empresas[0];
  console.log('[empresa encontrada]', empresa);

  const auth = new AuthService(new UsuariosRepositorioPostgres());
  const username = 'prueba_' + Date.now();

  const usuario = await auth.registrarUsuario({
    empresaId: empresa.id,
    username,
    password: 'contraseñaSegura123',
    nombreCompleto: 'Usuario de prueba',
    rol: 'admin_empresa'
  });
  console.log('[usuario creado en Supabase, de verdad]', usuario);

  const login = await auth.validarCredenciales(username, 'contraseñaSegura123');
  console.log('[login verificado contra la base real]', login);

  await pool.end();
})().catch((error) => {
  console.error('[error inesperado]', error.message);
  process.exit(1);
});
