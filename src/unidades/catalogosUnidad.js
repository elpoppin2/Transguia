// Listas para los desplegables del registro de unidad. Son valores
// sugeridos; ajustar a como los maneje el transportista. El backend NO
// obliga a que el valor esté en la lista (los campos son opcionales y de
// texto libre): la lista solo arma el desplegable en el formulario.
//
// Se sirven junto con los catálogos del ticket en GET /api/catalogos.

const TIPOS_VEHICULO = [
  'Tracto',
  'Camión',
  'Semirremolque',
  'Remolque',
  'Volquete',
  'Bañera / tolva',
  'Cama baja',
  'Furgón',
  'Cisterna',
  'Otro'
];

// Rodada = tipo de rueda por eje.
const TIPOS_RODADA = [
  'Simple',
  'Doble',
  'Superancho'
];

// Cómo abre la tolva/carrocería para descargar.
const FORMAS_APERTURA = [
  'Trasera',
  'Lateral',
  'Trasera y lateral',
  'Superior',
  'Volteo',
  'Sin apertura'
];

module.exports = { TIPOS_VEHICULO, TIPOS_RODADA, FORMAS_APERTURA };
