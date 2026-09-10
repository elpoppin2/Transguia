// Ejecutar con:  node demo-auth.js

const { AuthService } = require('./src/auth/authService');
const { UsuariosRepositorioMemoria } = require('./src/auth/usuariosRepoMemoria');

const auth = new AuthService(new UsuariosRepositorioMemoria());

(async () => {
  const nuevo = await auth.registrarUsuario({
    empresaId: 'empresa-demo-1',
    username: 'andina01',
    password: 'demo2026seguro',
    nombreCompleto: 'María Andina',
    rol: 'admin_empresa'
  });
  console.log('[registrado]     ', nuevo);

  const loginOk = await auth.validarCredenciales('andina01', 'demo2026seguro');
  console.log('[login correcto] ', loginOk);

  const loginMal = await auth.validarCredenciales('andina01', 'contraseña-incorrecta');
  console.log('[login incorrecto]', loginMal);

  try {
    await auth.registrarUsuario({
      empresaId: 'empresa-demo-1',
      username: 'andina01',
      password: 'otra12345',
      nombreCompleto: 'Otro Usuario'
    });
  } catch (error) {
    console.log('[usuario duplicado, rechazado como se espera]', error.message);
  }
})();
