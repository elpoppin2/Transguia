// Catálogos FIJOS de los tickets de traslado (reglas de negocio de
// TransGuía, no impuestas por SUNAT). El ticket exige que la mercancía,
// el centro de origen y el destino sean uno de estos valores.
//
// Fuente única de verdad: el front los consume por GET /api/catalogos.
// Para agregar/quitar un valor se edita acá y se vuelve a desplegar.

const MERCANCIAS = [
  'Carbón Trujillo',
  'Caliza Roca Fuerte',
  'Silice de Terceros',
  'Puzolana Terceros',
  'Puzolana Ayacucho'
];

// El "origen" del traslado: el patio/centro desde donde sale la carga.
const CENTROS_ORIGEN = [
  'Quri',
  'Transmilsa',
  'Atipax',
  'Juscamaita'
];

// El "destino" del traslado: la planta o punto de entrega.
const DESTINOS = [
  'Atocongo',
  'Condorcocha',
  'Muelle Conchán'
];

/** Clave de comparación: sin tildes, minúsculas, espacios colapsados. */
function clave(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve el valor canónico de `lista` que coincide con `texto`
 * (ignorando mayúsculas, tildes y espacios de más), o null si ninguno.
 */
function normalizarContra(lista, texto) {
  const k = clave(texto);
  return lista.find((v) => clave(v) === k) || null;
}

module.exports = { MERCANCIAS, CENTROS_ORIGEN, DESTINOS, normalizarContra };
