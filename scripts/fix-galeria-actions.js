const fs = require('fs');
const f = 'src/js/dashboard.js';
let s = fs.readFileSync(f, 'utf8');

const old = `      <div class="galeria-actions">
        ${total < 19 ? \`
          <button type="button" class="btn btn-primary btn-sm" onclick="Dashboard._galeriaSubir('${this._esc(animalId)}', 'foto')">+ Foto</button>
          <button type="button" class="btn btn-outline-green btn-sm" onclick="Dashboard._galeriaSubir('${this._esc(animalId)}', 'video')">+ Video</button>
        \` : '<span class="galeria-limite">Limite de 19 archivos alcanzado</span>'}
        ${total > 0 ? \`<button type="button" class="btn btn-danger btn-sm" onclick="Dashboard._galeriaBorrar('${this._esc(animalId)}')">Borrar actual</button>\` : ''}
      </div>`;

const neu = `      <div class="galeria-progress" style="display:none">
        <div class="progress-text">Subiendo 0 de 0...</div>
        <div class="progress-bar-track">
          <div class="progress-bar" style="width:0%"></div>
        </div>
      </div>
      <div class="galeria-actions">
        ${total < 19 ? \`
          <button type="button" class="btn btn-primary btn-sm" onclick="Dashboard._galeriaSubir('${this._esc(animalId)}', 'foto')">+ Foto</button>
          <button type="button" class="btn btn-outline-green btn-sm" onclick="Dashboard._galeriaSubir('${this._esc(animalId)}', 'video')">+ Video</button>
        \` : '<span class="galeria-limite">Limite de 19 archivos alcanzado</span>'}
        ${total > 0 ? \`<button type="button" class="btn btn-outline-green btn-sm" onclick="Dashboard._galeriaUsarComoPrincipal('${this._esc(animalId)}')">Usar como principal</button>\` : ''}
        ${total > 0 ? \`<button type="button" class="btn btn-danger btn-sm" onclick="Dashboard._galeriaBorrar('${this._esc(animalId)}')">Borrar actual</button>\` : ''}
      </div>`;

if (s.indexOf(old) === -1) {
  console.log('Pattern not found, trying alternative...');
  // Try with the actual accented text
  const old2 = s.substring(s.indexOf('      <div class="galeria-actions">'), s.indexOf('      </div>\n    `;', s.indexOf('      <div class="galeria-actions">')) + '      </div>'.length);
  console.log('Found galeria-actions block length: ' + old2.length);
  // Just do a simple replace of the actions div content
  s = s.replace(
    /(<div class="galeria-actions">)\n(.*?)(<\/div>)/s,
    '$1\n        <div class="galeria-progress" style="display:none">\n          <div class="progress-text">Subiendo 0 de 0...</div>\n          <div class="progress-bar-track">\n            <div class="progress-bar" style="width:0%"></div>\n          </div>\n        </div>\n$2\n        ${total > 0 ? `<button type="button" class="btn btn-outline-green btn-sm" onclick="Dashboard._galeriaUsarComoPrincipal(\'${this._esc(animalId)}\')">Usar como principal</button>` : \'\'}\n$3'
  );
  fs.writeFileSync(f, s, 'utf8');
  console.log('Done with regex approach');
} else {
  s = s.replace(old, neu);
  fs.writeFileSync(f, s, 'utf8');
  console.log('Done with exact match');
}
"