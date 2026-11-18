/**
 * Textos del contrato de acogida temporal de Grupo Nebak.
 *
 * Fuente única del documento: sale literalmente de
 * `contratoacogida EN BLANCO.doc` de la asociación (una cara, formulario).
 * Lo usan el PDF (`PdfExport._contratoAcogidaBody`) y el modal de vista previa,
 * que reutiliza ese mismo cuerpo, para que el papel y la pantalla no divergan.
 */
const AcogidaTextos = {
  version: '1.0',
  fecha: '2026/11/18',
  titulo: 'Contrato de acogida temporal de un animal de compañía',

  // Texto de las condiciones, literal del documento (1- a 8-).
  condiciones: [
    'Me comprometo a proporcionar cuidados adecuados durante las horas que pase bajo mi tutela, hasta la finalización de este contrato.',
    'Convengo que, durante las horas que el animal permanezca bajo mi tutela fuera de Asociación Grupo Nebak, yo seré responsable de cualquier accidente en el que el animal se pueda ver involucrado o de cualquier daño que éste pueda causar.',
    'Convengo en que nunca permitiré a este animal vagar libremente en el exterior y tomaré las medidas necesarias para que no cause molestias o daños a otras personas o animales.',
    'Convengo que nunca utilizaré este animal con ánimo de lucro.',
    'Acepto que Asociación Grupo Nebak o alguien en su representación pueda retirar a este animal si no se cumple alguna de las cláusulas de este contrato.',
    'Notificaré a Asociación Grupo Nebak cualquier cambio en mi dirección y número de teléfono.',
    'En el caso de desear finalizar este contrato de acogida, lo notificaré a Asociación Grupo Nebak con dos días de antelación.',
    'Asociación Grupo Nebak podrá cancelar este contrato si existe el compromiso de adopción de este animal, debiendo notificarlo con dos días de antelación.'
  ],

  materialIntro: 'En el momento de la firma de este contrato de acogida temporal recibo el siguiente material, que deberé devolver en buenas condiciones de uso en el momento de finalización del contrato:',
  material: [
    'Jaula varikennel / transportín',
    'Bebedero para jaula',
    'Collar',
    'Correa',
    'Bozal',
    'Abrigo',
    'Comedero / bebedero',
    'Cartilla de identificación y vacunación',
    'Otros'
  ],
  materialOtros: 'Otros (detallar):',

  aceptacion: 'Con mi firma acepto todos los términos y condiciones aquí listados por Asociación Grupo Nebak y renuncio al derecho de denunciar este contrato por mala interpretación o mal entendimiento.',

  firmas: {
    entidad: 'Firma o sello Asociación Grupo Nebak',
    familia: 'Firma Casa de Acogida'
  },

  pie: [
    'Asociación Grupo Nebak · C/ Santiago 27, 1.º izq., 20300 Irún (Guipúzcoa)',
    '625 14 05 88 / 600 04 25 94'
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AcogidaTextos;
}
