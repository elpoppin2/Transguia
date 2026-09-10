// Ejecutar con:  node probar-todo.js   (o  npm run probar)
//
// Corre en fila todos los scripts de prueba contra la base real y
// resume el resultado. Necesita el .env con DATABASE_URL.

const { spawnSync } = require('child_process');

const PRUEBAS = [
  'probar-conexion-db.js',
  'probar-unidades-db.js',
  'probar-choferes-db.js',
  'probar-tickets-db.js',
  'probar-documentos-db.js'
];

let fallos = 0;
for (const archivo of PRUEBAS) {
  console.log(`\n${'='.repeat(60)}\n  ${archivo}\n${'='.repeat(60)}`);
  const r = spawnSync(process.execPath, [archivo], { stdio: 'inherit' });
  if (r.status !== 0) {
    fallos += 1;
    console.log(`  --> ${archivo} FALLÓ (código ${r.status})`);
  }
}

console.log(`\n${'='.repeat(60)}`);
if (fallos === 0) {
  console.log('  TODAS LAS PRUEBAS PASARON');
} else {
  console.log(`  ${fallos} de ${PRUEBAS.length} pruebas fallaron`);
  process.exit(1);
}
