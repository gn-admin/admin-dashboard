/**
 * Servicio de generación de PDF.
 *
 * Genera un PDF a partir de los datos de encuesta usando
 * Google Docs como template y Drive para almacenamiento temporal.
 */

// Configuración del PDF
var PDF_CONFIG = {
  TEMPLATE_ID: '', // ID de un Google Doc template (opcional)
  TEMP_FOLDER_NAME: 'gn-encuestas-temp',
  APP_NAME: 'GN-Encuestas'
};

/**
 * Genera un PDF con los datos proporcionados.
 *
 * @param {Object} data - Datos para el PDF { title, rows, stats, user }
 * @param {Object} user - Usuario autenticado
 * @returns {string} - PDF en base64
 */
function generatePdf(data, user) {
  try {
    // Crear un documento temporal con el contenido
    var doc = DocumentApp.create('GN-Encuestas-' + Date.now());
    var body = doc.getBody();

    // Estilo del documento
    var style = {};
    style[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
    style[DocumentApp.Attribute.FONT_SIZE] = 10;
    body.setAttributes(style);

    // Título
    var title = body.appendParagraph(data.title || 'Reporte de Encuestas');
    title.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    // Info del reporte
    body.appendParagraph('Fecha: ' + new Date().toLocaleDateString('es-ES'));
    body.appendParagraph('Generado por: ' + (user.email || user.name));
    body.appendParagraph('');

    // Estadísticas (si existen)
    if (data.stats) {
      var statsTitle = body.appendParagraph('Resumen');
      statsTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);

      body.appendParagraph('Total de respuestas: ' + (data.stats.total || 0));
      if (data.stats.average) {
        body.appendParagraph('Satisfacción promedio: ' + data.stats.average + '/10');
      }
      body.appendParagraph('');
    }

    // Tabla de datos
    if (data.rows && data.rows.length > 0) {
      var tableTitle = body.appendParagraph('Detalle de respuestas');
      tableTitle.setHeading(DocumentApp.ParagraphHeading.HEADING2);

      var headers = Object.keys(data.rows[0]).filter(function(h) {
        return h.charAt(0) !== '_'; // Excluir campos internos
      });

      var table = body.appendTable();
      table.setBorderWidth(1);

      // Header de la tabla
      var headerRow = table.appendTableRow();
      headers.forEach(function(h) {
        var cell = headerRow.appendTableCell(h);
        cell.setAttributes({
          [DocumentApp.Attribute.BOLD]: true,
          [DocumentApp.Attribute.BACKGROUND_COLOR]: '#4A90D9',
          [DocumentApp.Attribute.FOREGROUND_COLOR]: '#FFFFFF'
        });
      });

      // Filas de datos
      data.rows.forEach(function(row) {
        var tableRow = table.appendTableRow();
        headers.forEach(function(h) {
          tableRow.appendTableCell(String(row[h] || ''));
        });
      });
    } else {
      body.appendParagraph('No hay datos para mostrar.');
    }

    // Pie de página
    body.appendParagraph('');
    var footer = body.appendParagraph('Generado por ' + PDF_CONFIG.APP_NAME);
    footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    footer.setFontSize(8);
    footer.setFontColor('#999999');

    // Guardar y convertir a PDF
    doc.saveAndClose();

    var file = DriveApp.getFileById(doc.getId());
    var pdfBlob = file.getAs('application/pdf');
    var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

    // Eliminar el documento temporal
    DriveApp.removeFile(file);

    return pdfBase64;

  } catch (err) {
    Logger.log('Error generando PDF: ' + err.message);
    throw new Error('Error al generar el PDF');
  }
}

/**
 * Genera un PDF usando un template predefinido (si se configura).
 *
 * @param {Object} data - Datos para el template
 * @returns {string} - PDF en base64
 */
function generatePdfFromTemplate(data) {
  if (!PDF_CONFIG.TEMPLATE_ID) {
    return generatePdf(data);
  }

  try {
    // Copiar el template
    var templateFile = DriveApp.getFileById(PDF_CONFIG.TEMPLATE_ID);
    var copy = templateFile.makeCopy('temp-' + Date.now());
    var doc = DocumentApp.openById(copy.getId());
    var body = doc.getBody();

    // Reemplazar placeholders
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        body.replaceText('{{' + key + '}}', String(data[key]));
      }
    }

    doc.saveAndClose();

    // Convertir a PDF
    var pdfBlob = copy.getAs('application/pdf');
    var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

    // Limpiar
    DriveApp.removeFile(copy);

    return pdfBase64;

  } catch (err) {
    Logger.log('Error con template: ' + err.message);
    // Fallback al método normal
    return generatePdf(data);
  }
}
