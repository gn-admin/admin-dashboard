/**
 * Modelo compartido del contrato de adopción.
 *
 * Reproduce el documento de la asociación (`CONTRATO DE ADOPCION ACTUALIZADO`):
 * partes intervinientes, tabla de datos de adopción con la fotografía dentro,
 * hoja de estipulaciones, firma de la adoptante tras los datos, cierre con
 * asociación y adoptante, y cláusula de mayores de 65 en página propia.
 *
 * Es la única descripción del contenido y del orden del documento: la usan el
 * renderizador HTML de impresión (`PdfExport._htmlContrato`) y el renderizador
 * PDF del servidor (`generarPdfModelo`). Los textos legales salen siempre de
 * ContratoTextos; aquí no se copia ninguna estipulación.
 */
const TextosContrato = (typeof module !== 'undefined' && module.exports)
  ? require('./contrato-textos.js')
  : (typeof ContratoTextos !== 'undefined' ? ContratoTextos : null);

const ContratoModelo = {
  construir(datos) {
    const d = datos || {};
    const c = d.c || {};
    const T = d.textos || TextosContrato;
    if (!T) throw new Error('Falta ContratoTextos');
    const animal = d.animal || {};
    const ent = d.entidad || {};
    const tutor = d.tutor || null;
    const r65 = d.responsable65 || null;
    const importes = d.importes || { donacion: 100, indemnizacion: 900 };
    const fecha = d.fecha || '';
    const ciudad = d.ciudad || 'Irún';
    const adoptante = c.f1_nombre || c.adoptante || '';
    const dni = c.f1_dni || '';
    // Trozos que los dos renderizadores destacan igual (nombres y datos de
    // identificación de las partes intervinientes).
    const fuertes = (...vals) => vals
      .filter(v => v !== undefined && v !== null && String(v) !== '')
      .map(v => String(v));
    const bloques = [];
    const firmaAdoptante = {
      etiqueta: 'Firma adoptante:',
      firma: c.f1_firma || ''
    };
    // El DOCX deja los huecos como puntos; no los convierte en frases que
    // desaparecen cuando falta un dato. Así el documento impreso conserva su
    // maqueta y los datos del formulario simplemente los sustituyen.
    const puntos = '…………………………………..';
    const dato = (v) => String(v == null ? '' : v).trim() || puntos;

    bloques.push({ tipo: 'titulo', texto: T.titulo || 'Contrato de adopción' });

    // 1. Partes intervinientes: primero la adoptante, después la asociación.
    bloques.push({ tipo: 'seccion', texto: 'Partes intervinientes:' });
    bloques.push({
      tipo: 'parrafo',
      texto: 'Comparecen en este acto, de una parte, D./Dña. ' + adoptante +
        ', mayor de edad, que actúa en su propio nombre y derecho, con DNI ' + dato(dni) +
        ', con domicilio en ' + dato(c.f1_direccion) + ', teléfono ' + dato(c.f1_telefono) +
        ', y correo electrónico ' + dato(c.f1_email) +
        '. Actual propietario y responsable del animal, quien en adelante será denominado como el Adoptante.',
      negrita: fuertes(adoptante, dni, c.f1_direccion, c.f1_telefono, c.f1_email)
    });
    // Sin nombre configurado el párrafo tiene que seguir leyéndose: nunca
    // «de la otra parte, , que…» ni una línea en blanco en el contrato.
    const nombreEntidad = String(ent.nombre || '').trim();
    bloques.push({
      tipo: 'parrafo',
      texto: nombreEntidad
        ? 'Y, de la otra parte, la ' + nombreEntidad +
          ', con CIF ' + dato(ent.cif) +
          ', con domicilio en ' + dato(ent.domicilio) +
          ', y con teléfonos de contacto ' + dato(ent.telefono) +
          ', que en adelante será denominada como la Asociación.'
        : 'Y, de la otra parte, la Asociación.',
      negrita: nombreEntidad ? fuertes(nombreEntidad, ent.cif, ent.domicilio, ent.telefono) : []
    });
    bloques.push({ tipo: 'parrafo', texto: 'Ambas partes acuerdan celebrar el presente CONTRATO, de acuerdo con los siguientes DATOS DE ADOPCIÓN:', negrita: ['DATOS DE ADOPCIÓN:'] });

    // 2. Datos de adopción: tabla etiqueta/valor con la fotografía como última fila.
    bloques.push({
      tipo: 'tabla',
      filas: [
        ['NOMBRE DEL ANIMAL:', animal.nombre],
        ['NOMBRE DEFINITIVO:', animal.nombre_definitivo],
        ['ESPECIE:', animal.especie],
        ['N.º MICROCHIP:', animal.microchip],
        ['RAZA:', animal.raza],
        ['SEXO:', animal.sexo],
        ['FECHA DE NACIMIENTO:', d.fechaNacimiento || animal.fecha_nacimiento],
        ['CAPA:', animal.capa],
        ['COLOR:', animal.color],
        ['TAMAÑO:', animal.tamano],
        ['ESTERILIZACION:', animal.esterilizada],
        ['OTRAS RESEÑAS:', animal.descripcion]
      ],
      foto: {
        etiqueta: 'FOTOGRAFÍA:',
        src: animal.foto || '',
        ancho: 100,
        alto: 100,
        alt: animal.nombre || 'Animal',
        vacio: 'Sin foto'
      }
    });
    if (T.notaEstipulaciones) bloques.push({ tipo: 'nota', texto: '*** ' + T.notaEstipulaciones });

    // 3. La adoptante firma la hoja de datos, antes de las estipulaciones.
    // La fecha y la firma van juntas, como la tabla del DOCX.
    bloques.push({ tipo: 'firmas', fecha: 'En ' + ciudad + ': ' + fecha, items: [firmaAdoptante] });

    // 4. Estipulaciones (texto y orden, de ContratoTextos). La hoja de
    // estipulaciones empieza en página propia, como en el documento.
    bloques.push({ tipo: 'salto' });
    bloques.push({ tipo: 'seccion', texto: 'ESTIPULACIONES:' });
    (T.estipulaciones || []).forEach(est => {
      const x = T.texto(est, importes);
      bloques.push({ tipo: 'estipulacion', n: est.n, parrafos: x.parrafos, lista: x.lista });
    });

    // 5. Cierre: asociación con su firma y adoptante, como en el documento.
    bloques.push({ tipo: 'firmas', fecha: 'En ' + ciudad + ': ' + fecha, items: [
      { etiqueta: 'Firma Asociación:', firma: d.entidadFirma || '', logo: d.entidadLogo || '' },
      { etiqueta: 'Firma Adoptante:', firma: c.f1_firma || '' }
    ] });

    // 6. Anexo del tutor, en página propia y con su firma. Es un añadido del
    // gestor (el DOCX original no lo trae) y solo aparece si se activa.
    if (tutor) {
      bloques.push({ tipo: 'salto' });
      bloques.push({ tipo: 'seccion', texto: 'Anexo I. Datos del tutor o persona de apoyo' });
      bloques.push({ tipo: 'tabla', filas: [
        ['Nombre', tutor.nombre],
        ['DNI', tutor.dni],
        ['Relación con el adoptante', tutor.relacion],
        ['Domicilio', tutor.direccion],
        ['Email', tutor.email],
        ['Teléfono', tutor.telefono]
      ] });
      bloques.push({ tipo: 'nota', texto: 'La persona tutora se compromete a asumir el cuidado del animal si el adoptante no pudiera hacerlo. Su firma es obligatoria y firma este contrato junto al adoptante.' });
      bloques.push({ tipo: 'firmas', fecha: 'En ' + ciudad + ': ' + fecha, items: [{
        etiqueta: 'Tutor / persona de apoyo:',
        nombre: tutor.nombre,
        dni: tutor.dni || '',
        dniEtiqueta: 'DNI',
        firma: tutor.firma || ''
      }] });
    }

    // 7. Cláusula especial de mayores de 65, en página propia.
    if (r65) {
      const k65 = T.clausula65 || {};
      bloques.push({ tipo: 'salto' });
      bloques.push({ tipo: 'seccion', texto: k65.titulo || 'Cláusula especial · adoptantes mayores de 65 años' });
      (k65.parrafos || []).forEach(texto => bloques.push({ tipo: 'parrafo', texto }));
      bloques.push({ tipo: 'seccion', texto: 'Datos de la persona responsable designada' });
      bloques.push({ tipo: 'tabla', filas: [
        ['Nombre completo', r65.nombre],
        ['DNI/NIE', r65.dni],
        ['Teléfono de contacto', r65.telefono],
        ['Correo electrónico', r65.email],
        ['Dirección', r65.direccion]
      ] });
      bloques.push({ tipo: 'firmas', fecha: 'En ' + ciudad + ': ' + fecha, items: [
        { etiqueta: 'Firma Adoptante:', firma: c.f1_firma || '' },
        { etiqueta: 'Firma de la persona responsable:', firma: '' }
      ] });
    }

    // Compatibilidad mientras el .gs desplegado no conozca los grupos: ese
    // renderizador solo pinta `firma` y `firmaEntidad`, así que cada grupo deja
    // detrás su copia en esa forma, marcada `legado`. Los renderizadores
    // nuevos la ignoran (no se duplica) y el antiguo la imprime, de modo que el
    // PDF nunca se queda sin firmas por enviar antes de subir `Code.gs`.
    const conLegado = [];
    bloques.forEach((b) => {
      conLegado.push(b);
      if (!b) return;
      // La foto iba antes como imagen suelta: el servidor antiguo ignora
      // `tabla.foto`, así que recibe también su copia legada (sin marco
      // cuadrado, y así consta: se degrada, no desaparece).
      if (b.tipo === 'tabla' && b.foto && b.foto.src) {
        conLegado.push({ tipo: 'imagen', src: b.foto.src, ancho: b.foto.ancho, alt: b.foto.alt, vacio: b.foto.vacio, legado: true });
      }
      if (b.tipo !== 'firmas') return;
      (b.items || []).forEach((it) => {
        conLegado.push(Object.assign({}, it, {
          tipo: it.sello ? 'firmaEntidad' : 'firma',
          legado: true
        }));
      });
    });

    return {
      version: 1,
      nombre: d.nombreArchivo || ('Contrato-Adopcion-' + (animal.nombre || 'Grupo-Nebak') + '.pdf'),
      bloques: conLegado
    };
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ContratoModelo;
