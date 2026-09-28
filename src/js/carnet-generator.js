const CarnetGenerator = {
  generateCarnetId(area) {
    const prefix = (area || 'SOC').toUpperCase().replace(/\s+/g,'').slice(0,10);
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let random = '';
    for (let i = 0; i < 8; i++) random += chars[Math.floor(Math.random() * chars.length)];
    return `GN-${prefix}-${year}-${random}`;
  },

  async generateCarnet(socio, options = {}) {
    const width = options.width || 640;
    const height = options.height || 400;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Fondo blanco con borde redondeado
    ctx.fillStyle = '#ffffff';
    this._roundRect(ctx, 0, 0, width, height, 16);
    ctx.fill();

    // Banda superior segun perfil: Socio (verde), Voluntariado (azul), Ambos (morado)
    const perfil = socio.tipo === 'Ambos' ? 'SOCIO + VOLUNTARIADO' : (socio.tipo === 'Voluntario' ? 'VOLUNTARIADO' : 'SOCIO');
    const perfilColor = socio.tipo === 'Ambos' ? '#7c3aed' : (socio.tipo === 'Voluntario' ? '#2563eb' : '#1FC95B');
    ctx.fillStyle = perfilColor;
    ctx.fillRect(0, 0, width, 70);

    // Logo texto
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('GRUPO NEBAK', 20, 30);
    ctx.font = '12px Inter, Arial, sans-serif';
    ctx.fillText('Protectora de Animales', 20, 50);

    // Badge activo/inactivo
    const badge = socio.activo ? 'ACTIVO' : 'INACTIVO';
    const badgeColor = socio.activo ? '#0A431E' : '#DC2626';
    ctx.fillStyle = badgeColor;
    const badgeW = ctx.measureText(badge).width + 16;
    this._roundRect(ctx, width - badgeW - 16, 20, badgeW, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(badge, width - badgeW/2 - 16, 39);

    // Sello de perfil a la izquierda del de activo
    ctx.font = 'bold 11px Inter, Arial, sans-serif';
    const pw = ctx.measureText(perfil).width + 16;
    const px = width - badgeW - 16 - 8 - pw;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    this._roundRect(ctx, px, 20, pw, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(perfil, px + pw/2, 39);

    // Foto del socio (circular)
    const fotoSize = 100;
    const fotoX = 30;
    const fotoY = 95;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fotoX + fotoSize/2, fotoY + fotoSize/2, fotoSize/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (socio.foto) {
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = socio.foto; });
      ctx.drawImage(img, fotoX, fotoY, fotoSize, fotoSize);
    } else {
      ctx.fillStyle = '#e8faf0';
      ctx.fillRect(fotoX, fotoY, fotoSize, fotoSize);
      ctx.fillStyle = '#1FC95B';
      ctx.font = '36px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(socio.nombre ? socio.nombre.charAt(0) : '?', fotoX + fotoSize/2, fotoY + fotoSize/2 + 13);
    }
    ctx.restore();

    // Borde circular de la foto
    ctx.strokeStyle = '#1FC95B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fotoX + fotoSize/2, fotoY + fotoSize/2, fotoSize/2, 0, Math.PI * 2);
    ctx.stroke();

    // Info del socio
    const infoX = 155;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#191919';
    ctx.font = 'bold 20px Inter, Arial, sans-serif';
    ctx.fillText(socio.nombre || 'Sin nombre', infoX, 115);

    ctx.font = '13px Inter, Arial, sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText('Area: ' + (socio.area || 'Sin asignar'), infoX, 140);
    ctx.fillText('Tipo: ' + (socio.tipo || 'Sin definir'), infoX, 160);
    ctx.fillText('Email: ' + (socio.email || ''), infoX, 180);
    ctx.fillText('Telefono: ' + (socio.telefono || ''), infoX, 200);

    // QR Code
    const qrSize = 120;
    const qrX = width - qrSize - 30;
    const qrY = 100;
    if (typeof QRCode !== 'undefined') {
      const qrDiv = document.createElement('div');
      qrDiv.style.display = 'none';
      document.body.appendChild(qrDiv);
      new QRCode(qrDiv, {
        text: socio.carnet_id || socio.id,
        width: qrSize,
        height: qrSize,
        colorDark: '#191919',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      const qrCanvas = qrDiv.querySelector('canvas');
      if (qrCanvas) {
        ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
      } else {
        const qrImg = qrDiv.querySelector('img');
        if (qrImg) {
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        }
      }
      document.body.removeChild(qrDiv);
    }

    // ID debajo del QR
    ctx.fillStyle = '#191919';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(socio.carnet_id || socio.id, qrX + qrSize/2, qrY + qrSize + 16);

    // Barra inferior
    ctx.fillStyle = '#191919';
    ctx.fillRect(0, height - 45, width, 45);
    ctx.fillStyle = '#aff3c7';
    ctx.font = '11px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ID: ' + (socio.carnet_id || socio.id) + '  |  ' + new Date().toLocaleDateString('es-ES'), width/2, height - 20);

    return canvas;
  },

  async downloadCarnet(socio) {
    const canvas = await this.generateCarnet(socio);
    const link = document.createElement('a');
    link.download = `carnet-${(socio.nombre||'socio').replace(/\s+/g,'-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  },

  async showCarnetModal(socio) {
    const canvas = await this.generateCarnet(socio, { width: 640, height: 400 });
    const dataUrl = canvas.toDataURL('image/png');
    this._sociosCache = this._sociosCache || {};
    this._sociosCache[socio.id] = socio;
    const nombreSeguro = String(socio.nombre || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:700px;width:90%;text-align:center;position:relative">
        <button onclick="this.closest('.modal-overlay').remove()" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:24px;cursor:pointer;color:#666">&times;</button>
        <h3 style="margin:0 0 16px;color:#191919">Carnet de ${nombreSeguro}</h3>
        <img src="${dataUrl}" style="max-width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15)" />
        <div style="margin-top:16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="CarnetGenerator.downloadCarnetById('${String(socio.id || '').replace(/'/g, '').replace(/"/g, '&quot;')}')">${Icons.download} Descargar PNG</button>
          <button class="btn btn-outline-green" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  },

  downloadCarnetById(id) {
    const socio = this._sociosCache && this._sociosCache[id];
    if (!socio) return;
    this.downloadCarnet(socio);
  },

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
};
