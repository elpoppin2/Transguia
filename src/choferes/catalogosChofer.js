// Listas para los desplegables del registro de chofer.
// Se sirven junto con el resto en GET /api/catalogos.
//
// Provincia y Distrito todavía van como texto libre: falta el dataset de
// ubigeo (departamento → provincia → distrito). Cuando esté, se agregan
// acá como listas encadenadas.

const TIPOS_DOC_IDENTIDAD = ['DNI', 'CE', 'PASAPORTE'];

// Los 25 departamentos del Perú (incluye la Provincia Constitucional del
// Callao y Lima como "Lima").
const DEPARTAMENTOS = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca',
  'Callao', 'Cusco', 'Huancavelica', 'Huánuco', 'Ica', 'Junín',
  'La Libertad', 'Lambayeque', 'Lima', 'Loreto', 'Madre de Dios',
  'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna',
  'Tumbes', 'Ucayali'
];

// Clase y categoría del brevete (se guarda en el documento de licencia).
const CATEGORIAS_LICENCIA = ['A-I', 'A-IIa', 'A-IIb', 'A-IIIa', 'A-IIIb', 'A-IIIc'];

module.exports = { TIPOS_DOC_IDENTIDAD, DEPARTAMENTOS, CATEGORIAS_LICENCIA };
