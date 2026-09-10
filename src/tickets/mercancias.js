// Catálogo FIJO de mercancías para los tickets de traslado.
//
// SUNAT no exige una lista cerrada (en la GRE la descripción del bien es
// texto libre). Esta lista es una regla de negocio de TransGuía para
// estandarizar: así el dashboard agrupa "toneladas por material" sin
// duplicados por diferencias de tipeo ("cemento" vs "Cemento en bolsas").
//
// El ticket exige que `descripcionMercancia` sea una de estas opciones.
// Es fuente única de verdad: el front la consume por GET /api/catalogos/mercancias.
//
// Para agregar o quitar una categoría se edita esta lista y se vuelve a
// desplegar. Mantener "Otros bienes" al final como salida para lo que no
// encaje en el resto.

const MERCANCIAS = [
  'Abarrotes y consumo masivo',
  'Bebidas',
  'Alimentos perecibles refrigerados',
  'Frutas y verduras',
  'Materiales de construcción',
  'Cemento y agregados',
  'Fierro, acero y metales',
  'Maquinaria y equipos',
  'Repuestos y autopartes',
  'Electrodomésticos y línea blanca',
  'Textiles y confecciones',
  'Productos plásticos y envases',
  'Papel, cartón y editorial',
  'Insumos y productos químicos',
  'Concentrado de minerales',
  'Combustibles y lubricantes',
  'Productos agrícolas a granel',
  'Madera y derivados',
  'Mudanza y menaje doméstico',
  'Otros bienes'
];

// Índice para validar sin importar mayúsculas ni espacios de más.
const _PORCLAVE = new Map(MERCANCIAS.map((m) => [clave(m), m]));

function clave(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Devuelve la mercancía canónica (tal cual figura en MERCANCIAS) si el
 * texto recibido coincide con alguna; si no, devuelve null.
 */
function normalizarMercancia(texto) {
  return _PORCLAVE.get(clave(texto)) || null;
}

module.exports = { MERCANCIAS, normalizarMercancia };
