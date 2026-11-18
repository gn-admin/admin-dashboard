/**
 * Textos del contrato de adopción de Grupo Nebak.
 *
 * Fuente única de las 20 estipulaciones: las usan la vista del modal
 * (`Dashboard._contratoTerminosHtml`) y el PDF (`PdfExport._buildContracto`),
 * para que el documento que se revisa y el que se firma no puedan divergir.
 * El texto sale del documento de la asociación (versión 2.0) con las erratas
 * corregidas; los importes son marcadores que cada renderizador rellena con
 * los datos del contrato.
 */
const ContratoTextos = {
  // 2.1: añade el anexo de condiciones complementarias (D-C5). El 2.0 era el
  // documento de la asociación tal cual; las estipulaciones 1-20 no cambian.
  version: '2.1',
  fecha: '2026/11/18',
  titulo: 'Contrato de adopción',
  notaEstipulaciones: 'Se adjunta hoja de estipulaciones revisada y firmada por el adoptante.',

  estipulaciones: [
    {
      n: 1,
      parrafos: ['El Adoptante se compromete a adoptar al animal de la Asociación con los datos que se reseñan a continuación, hasta que dicho animal muera.']
    },
    {
      n: 2,
      parrafos: ['El Adoptante declara adoptar al animal única y exclusivamente como animal de compañía.']
    },
    {
      n: 3,
      parrafos: ['El animal entregado en adopción no podrá ser utilizado para:'],
      lista: [
        'Caza de cualquier tipo y circunstancia.',
        'Experimentación de cualquier tipo.',
        'La participación en peleas o enfrentamientos con otros animales.',
        'La cría.',
        'Guarda de propiedades.',
        'Estancia en fincas o chalets de fin de semana.',
        'Circos u otro tipo de espectáculos.',
        'Participación en películas o series de televisión.',
        'Perro policía o fines militares.'
      ]
    },
    {
      n: 4,
      parrafos: ['En ningún caso podrá el animal permanecer atado ni encerrado en jaulas, habitaciones, terrazas, patios o garajes.']
    },
    {
      n: 5,
      parrafos: ['En caso de que el animal tenga la consideración de Perro Potencialmente Peligroso, el Adoptante, que acredita hallarse en posesión de la licencia correspondiente mediante exhibición de la misma, incorporando a este contrato fotocopia de dicha licencia, póliza del contrato de seguro de responsabilidad civil exigido por la normativa vigente, y el justificante de su inscripción en el Registro Municipal competente, se compromete a cumplir todas las medidas de seguridad exigidas por dicha normativa, tales como pasear al animal con bozal y correa no extensible en los sitios públicos.']
    },
    {
      n: 6,
      parrafos: ['En ningún caso podrá permanecer en lugar donde no pueda resguardarse de la lluvia, del frío o del sol, o sin espacio suficiente para el normal desarrollo de su especie.']
    },
    {
      n: 7,
      parrafos: ['En ningún caso se podrá someter al animal a cualquier tratamiento indebido y contrario a las disposiciones de la Ley de Protección Animal, su normativa de desarrollo y Código Penal.']
    },
    {
      n: 8,
      parrafos: ['El Adoptante se compromete por el presente contrato a proporcionar al animal alimentación y bebida suficiente y adecuada, los cuidados de higiene necesarios, la debida asistencia veterinaria, cuidarlo y respetarlo.']
    },
    {
      n: 9,
      parrafos: ['(Solamente en el caso de que el animal adoptado sea un gato). El Adoptante se compromete por el presente contrato a esterilizarlo en la fecha adecuada. El Adoptante deberá aportar a la Asociación un informe veterinario que acredite haberse realizado dicha esterilización, informe que ha de estar debidamente sellado, firmado, con n.º de colegiado y con identificación del animal.']
    },
    {
      n: 10,
      parrafos: ['El Adoptante se compromete por el presente contrato a proporcionar al animal compañía, a tenerle consigo, proporcionarle afecto y atenciones, y permitirle hacer el ejercicio necesario (en su caso sacándolo a pasear a la calle todos los días).']
    },
    {
      n: 11,
      parrafos: [
        'Asimismo se compromete a no regalar, vender o ceder por cualquier título, inter vivos o mortis causa, al animal; igualmente se compromete a no abandonar al animal.',
        'En caso de fallecimiento del Adoptante, se deberá notificar a la Asociación. Si un familiar o pareja quisiera quedarse con el animal, deberá notificarlo a la Asociación y así asumiría de nuevo la adopción del animal con un nuevo contrato de adopción.',
        'Si las personas señaladas en el párrafo anterior no desean quedarse con el animal, se notificará a la Asociación para que esta le encuentre un nuevo hogar.'
      ]
    },
    {
      n: 12,
      parrafos: ['La desaparición del animal, por robo, pérdida, extravío o por cualquier otra causa, debe ser notificada a la Asociación lo antes posible.']
    },
    {
      n: 13,
      parrafos: ['El Adoptante se compromete a informar de inmediato a la Asociación si se produjese un cambio de teléfono, domicilio o cualquier otra circunstancia que impidiese o dificultase su localización y posterior seguimiento.']
    },
    {
      n: 14,
      parrafos: ['Ante cualquier circunstancia que produjese imposibilidad de mantener o tener consigo al animal, imposibilidad de cumplir los términos del presente contrato, o deseo de rescindir el mismo, el Adoptante debe devolver el animal adoptado a la Asociación sin posibilidad de reclamar los gastos que este le haya ocasionado.']
    },
    {
      n: 15,
      parrafos: ['El Adoptante declara en este acto que asume la obligación de permitir en cualquier momento a la persona designada por la Asociación que revise el estado físico y psíquico del animal, así como el cumplimiento de las condiciones del presente contrato y de la adopción en general. Dicho representante llamará por teléfono o se personará en el domicilio sin previo aviso.']
    },
    {
      n: 16,
      parrafos: [
        'El incumplimiento notorio y fehaciente de cualquiera de las obligaciones anteriormente descritas y asumidas por el Adoptante en virtud del presente contrato supondrá la resolución de pleno derecho del mismo. Al darse a dicho incumplimiento el carácter de condición resolutoria expresamente aceptada por las partes, la Asociación queda legitimada para decidir unilateralmente retirar al Adoptante, de inmediato, la custodia del animal, recobrando automáticamente la Asociación la posesión del mismo. Asimismo, la Asociación se reserva el ejercicio de las acciones legales que le asistan en cada caso.',
        'Cualquier sospecha que tenga la Asociación de incumplimiento por el Adoptante de cualquiera de las obligaciones dimanantes del presente contrato facultará a la primera para decidir unilateralmente requisarlo de modo temporal mientras se comprueba, por el procedimiento previsto para cada caso, el cumplimiento o incumplimiento de las obligaciones asumidas, todo ello sin más trámite que la previa inspección ocular y personación en el domicilio del Adoptante para la retirada inmediata de la posesión del animal.',
        'Si existiesen indicios de que el animal ha sido víctima de malos tratos o tortura, se procederá a la inmediata interposición de la correspondiente denuncia por parte de la Asociación.',
        'Si se produjese la defunción del animal, esta debe ser notificada inmediatamente por burofax o cualquier otro medio que garantice fehacientemente la recepción de dicha comunicación a la Asociación en el plazo máximo de 12 horas desde el fallecimiento, decidiendo, en todo caso, la Asociación el destino del cuerpo del animal, así como la eventualidad de practicar autopsia para esclarecer las causas de la muerte. Si existiesen indicios de que ha existido dolo o negligencia por parte del Adoptante en relación con dicha desaparición, se procederá a la inmediata interposición de la correspondiente denuncia por parte de la Asociación, organización que dispone de asesoramiento jurídico por parte de abogados especializados en legislación animal.'
      ]
    },
    {
      n: 17,
      parrafos: [
        'El Adoptante abona voluntariamente, en concepto de donación, la cantidad de {donacion} €. Esta cantidad va destinada a costear parte de los gastos veterinarios de los animales que recogemos.',
        'El importe de la cuota de adopción será destinado íntegramente a costear actividades dirigidas a la consecución del objeto social y finalidad de la Asociación.'
      ]
    },
    {
      n: 18,
      parrafos: ['La cantidad que deberá abonar el Adoptante cuando el animal desaparezca o muera mediante dolo o negligencia por parte de dicho Adoptante asciende a {indemnizacion} €. Dicha cantidad será exigible judicialmente en los citados casos. Todo ello sin perjuicio del resto de acciones administrativas, civiles y/o penales que pudieren ser ejercidas por parte de la Asociación en relación con la desaparición o muerte del animal.']
    },
    {
      n: 19,
      parrafos: ['Esterilización de perros, excepciones:'],
      lista: [
        'Justificación veterinaria: cuando la esterilización suponga un riesgo para la salud del animal (por ejemplo, patologías graves o contraindicación quirúrgica).',
        'Edad insuficiente: si el cachorro no ha alcanzado la edad mínima para la intervención.'
      ]
    },
    {
      n: 20,
      parrafos: ['Ambas partes, tras manifestar su plena capacidad de obrar, prestan libre y voluntariamente su consentimiento al presente contrato, formado por tres folios a doble cara, aceptando expresamente todas y cada una de las condiciones y obligaciones dimanantes del mismo.']
    }
  ],

  // Condiciones que la asociación aplicaba de palabra y que el documento 2.0
  // no recogía (D-C5). Se imprimen al final del anexo, después de las 20
  // estipulaciones, para que el adoptante las firme con el resto.
  anexo: {
    titulo: 'Anexo. Condiciones complementarias',
    intro: 'Estas condiciones completan las estipulaciones anteriores y forman parte del contrato que el Adoptante firma junto a la hoja de estipulaciones.',
    clausulas: [
      {
        titulo: 'Periodo de prueba y devolución',
        parrafos: [
          'Durante los quince días siguientes a la entrega, y como máximo hasta los treinta días, el Adoptante y la Asociación podrán resolver este contrato si la convivencia no resulta adecuada para el animal o para la familia.',
          'La devolución se comunicará a la Asociación con al menos 48 horas de antelación y el animal se entregará en las condiciones sanitarias en que se recibió. La donación no se devuelve: no es el precio del animal.'
        ]
      },
      {
        titulo: 'Seguimiento de la adopción',
        parrafos: [
          'La Asociación realizará un seguimiento al mes, a los tres, a los seis y a los doce meses de la entrega, por teléfono, mensajería o visita acordada. El Adoptante se compromete a responder y a facilitar una fotografía actual del animal.'
        ]
      },
      {
        titulo: 'Microchip y registro',
        parrafos: [
          'Mientras dure el periodo de prueba, el microchip del animal permanecerá a nombre de la Asociación. Confirmada la adopción, el Adoptante tramitará el cambio de titularidad en el registro autonómico y remitirá a la Asociación el justificante en el plazo de un mes.'
        ]
      },
      {
        titulo: 'Protección de datos personales',
        parrafos: [
          'Los datos personales del Adoptante y, en su caso, del tutor o de la persona responsable se tratan para formalizar y ejecutar este contrato, cumplir las obligaciones legales de la Asociación y realizar el seguimiento de la adopción. Se conservan mientras dure la relación y durante los plazos legales de conservación.',
          'El Adoptante puede ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a la dirección de contacto de la Asociación, y reclamar ante la Agencia Española de Protección de Datos. Los datos no se ceden a terceros salvo obligación legal.'
        ]
      }
    ]
  },

  /**
   * Párrafos y lista de una estipulación con los importes del contrato ya
   * sustituidos. `datos` acepta `donacion` e `indemnizacion`.
   */
  // Cláusula especial del documento de adopción: solo se imprime cuando el
  // adoptante es mayor de 65 años y designa a una persona responsable.
  clausula65: {
    titulo: 'Cláusula especial · adoptantes mayores de 65 años',
    parrafos: [
      'En caso de fallecimiento del titular de la adopción, la persona designada como responsable en el presente contrato se compromete a asumir la custodia, cuidado y bienestar del animal adoptado, garantizando que se mantengan las condiciones adecuadas de alimentación, salud y alojamiento.',
      'El adoptante deberá indicar previamente, por escrito, el nombre completo, documento de identidad y datos de contacto de la persona que asumirá dicha responsabilidad. Asimismo, dicha persona estará obligada a informar a la entidad protectora en un plazo máximo de 48 horas desde el fallecimiento del adoptante y la asunción de la custodia, para coordinar cualquier seguimiento o apoyo necesario.',
      'En ausencia de designación expresa, la entidad protectora se reserva el derecho de recuperar al animal para asegurar su protección y reubicación.'
    ],
    campos: ['Nombre completo', 'DNI/NIE', 'Teléfono de contacto', 'Correo electrónico', 'Dirección'],
    nota: 'Cláusula aplicable solo si el adoptante es mayor de 65 años. La firma de la persona responsable se recoge en el contrato.'
  },

  texto(estipulacion, datos) {
    const d = datos || {};
    const rep = (t) => String(t)
      .replace(/\{donacion\}/g, d.donacion != null ? d.donacion : '')
      .replace(/\{indemnizacion\}/g, d.indemnizacion != null ? d.indemnizacion : '');
    const e = estipulacion || {};
    return {
      parrafos: (e.parrafos || []).map(rep),
      lista: (e.lista || []).map(rep)
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ContratoTextos;
