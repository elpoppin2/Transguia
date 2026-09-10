// Crea un usuario superadmin: ve todas las empresas desde el dashboard.
// No pertenece a ninguna empresa.
//
// Uso:
//   node crear-superadmin.js <usuario> <contraseña> "<Nombre completo>"

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { prepararEsquema } = require('./src/db/migraciones');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');

const [username, password, nombreCompleto] = process.argv.slice(2);

if (!username || !password || !nombreCompleto) {
  console.error('Uso:\n  node crear-superadmin.js <usuario> <contraseña> "<Nombre completo>"');
  process.exit(1);
}

(async () => {
  await prepararEsquema(); // asegura que exista el rol 'superadmin'

  const repo = new UsuariosRepositorioPostgres();
  if (await repo.buscarPorUsername(username)) {
    console.error(`Ya existe un usuario "${username}".`);
    await pool.end();
    process.exit(1);
  }

  const admin = await new AuthService(repo).registrarUsuario({
    username, password, nombreCompleto, rol: 'superadmin'
  });

  console.log('Superadmin creado:', admin.username, `(${admin.rol})`);
  console.log('Puede ingresar al prototipo y elegir cualquier empresa.');

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
