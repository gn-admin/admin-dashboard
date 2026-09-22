/**
 * Filtrado de datos por rol de usuario.
 *
 * Admin: ve todos los datos
 * Usuario normal: solo ve sus propios datos (columna userId)
 */

/**
 * Filtra los datos según el rol del usuario.
 *
 * @param {Object[]} data - Todos los datos del Sheet
 * @param {Object} user - Usuario autenticado { uid, email, role }
 * @returns {Object[]} - Datos filtrados
 */
function filterDataByRole(data, user) {
  if (!data || data.length === 0) {
    return [];
  }

  // Admin ve todo
  if (user.role === CONFIG.ROLES.ADMIN) {
    return data;
  }

  // Usuario normal: solo sus datos
  // Busca la columna "userId" en los datos
  return data.filter(function(row) {
    return row.userId === user.uid;
  });
}

/**
 * Filtra un solo registro por ID de usuario.
 *
 * @param {Object} row - Fila del Sheet como objeto
 * @param {Object} user - Usuario autenticado
 * @returns {boolean} - true si el usuario puede ver esta fila
 */
function canUserSeeRow(row, user) {
  if (user.role === CONFIG.ROLES.ADMIN) {
    return true;
  }
  return row.userId === user.uid;
}

/**
 * Obtiene estadísticas de los datos filtrados.
 *
 * @param {Object[]} filteredData - Datos ya filtrados por rol
 * @returns {Object} - Estadísticas calculadas
 */
function calculateStats(filteredData) {
  if (!filteredData || filteredData.length === 0) {
    return {
      total: 0,
      average: 0,
      byZone: {},
      byDate: {}
    };
  }

  var stats = {
    total: filteredData.length,
    average: 0,
    byZone: {},
    byDate: {}
  };

  var sum = 0;
  var countWithScore = 0;

  filteredData.forEach(function(row) {
    // Estadísticas por zona
    var zona = row.zona || 'Sin zona';
    stats.byZone[zona] = (stats.byZone[zona] || 0) + 1;

    // Estadísticas por fecha
    var fecha = row.timestamp ? new Date(row.timestamp).toLocaleDateString() : 'Sin fecha';
    stats.byDate[fecha] = (stats.byDate[fecha] || 0) + 1;

    // Promedio de satisfacción (si existe la columna)
    if (row.satisfaccion !== undefined && row.satisfaccion !== '') {
      var score = parseFloat(row.satisfaccion);
      if (!isNaN(score)) {
        sum += score;
        countWithScore++;
      }
    }
  });

  if (countWithScore > 0) {
    stats.average = Math.round((sum / countWithScore) * 10) / 10;
  }

  return stats;
}
