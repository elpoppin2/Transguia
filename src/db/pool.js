const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Falta DATABASE_URL en tu archivo .env. Copia .env.example a .env ' +
    'y complétalo con tu cadena de conexión real de Supabase.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // necesario para conectarse a Supabase
});

/**
 * Ejecuta varias consultas dentro de una sola transacción: si cualquiera
 * falla, se deshacen todas (rollback). Se usa cuando un ticket toca
 * varias tablas a la vez (tickets_traslado + historial + emisiones_gre)
 * y no queremos que quede a medias.
 *
 * @param {(cliente: import('pg').PoolClient) => Promise<any>} trabajo
 */
async function enTransaccion(trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const resultado = await trabajo(cliente);
    await cliente.query('commit');
    return resultado;
  } catch (error) {
    await cliente.query('rollback');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { pool, enTransaccion };
