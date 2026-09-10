// Crea una empresa nueva y su primer usuario administrador.
// (El registro de usuarios por la API exige ser admin_empresa; este
// script es la forma de crear el primer admin de una empresa.)
//
// Uso:
//   node crear-empresa.js <RUC> "<Razón social>" <usuarioAdmin> <contraseña> "<Nombre del admin>"
//
// Ejemplo:
//   node crear-empresa.js 20512345678 "Transportes El Sol SAC" elsol Clave2026Segura "Rosa Pérez"

require('dotenv').config();
const { pool } = require('./src/db/pool');
const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioPostgres } = require('./src/auth/usuariosRepoPostgres');

const [ruc, razonSocial, username, password, nombreCompleto] = process.argv.slice(2);

if (!ruc || !razonSocial || !username || !password || !nombreCompleto) {
  console.error('Faltan datos. Uso:\n  node crear-empresa.js <RUC> "<Razón social>" <usuario> <contraseña> "<Nombre del admin>"');
  process.exit(1);
}
if (!/^\d{11}$/.test(ruc)) {
  console.error('El RUC debe tener 11 dígitos.');
  process.exit(1);
}

(async () => {
  const yaExiste = await pool.query('select id from empresas where ruc = $1', [ruc]);
  if (yaExiste.rows.length > 0) {
    console.error(`Ya existe una empresa con RUC ${ruc} (id ${yaExiste.rows[0].id}).`);
    await pool.end();
    process.exit(1);
  }

  const { rows } = await pool.query(
    'insert into empresas (ruc, razon_social) values ($1, $2) returning id',
    [ruc, razonSocial]
  );
  const empresaId = rows[0].id;

  const auth = new AuthService(new UsuariosRepositorioPostgres());
  const admin = await auth.registrarUsuario({
    empresaId, username, password, nombreCompleto, rol: 'admin_empresa'
  });

  console.log('Empresa creada.');
  console.log('  empresaId :', empresaId);
  console.log('  admin     :', admin.username, `(${admin.rol})`);
  console.log('\nYa puede ingresar al prototipo con ese usuario y contraseña.');

  await pool.end();
})().catch((error) => {
  console.error('[error]', error.message);
  process.exit(1);
});
