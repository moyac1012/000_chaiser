(() => {
  const DEFAULT_COLOR = '#64748b';

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
  }

  function hexToRgb(hex) {
    const value = String(hex).replace('#', '');
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  function toHex(value) {
    return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  }

  function lightBackground(color) {
    const { r, g, b } = hexToRgb(color);
    const mix = (channel) => channel * 0.12 + 255 * 0.88;
    return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
  }

  function normalizePhaseMeta(phase) {
    if (!phase || typeof phase !== 'object') return;
    phase.name = String(phase.name || '無題グループ');
    phase.desc = typeof phase.desc === 'string' ? phase.desc : '';
    phase.color = isHexColor(phase.color) ? phase.color.toLowerCase() : DEFAULT_COLOR;
    phase.bg = isHexColor(phase.bg) ? phase.bg.toLowerCase() : lightBackground(phase.color);
  }

  function phaseById(id) {
    return (st.phases || []).find((phase) => phase.id === id) || null;
  }

  function installStyle() {
    if (document.getElementById('phase-meta-style')) return;
    const style = document.createElement('style');
    style.id = 'phase-meta-style';
    style.textContent = `
      .ph.phase-meta { border-left: 4px solid var(--phase-color, #64748b); }
      .ph.phase-meta .ph-title { color: #0f172a; }
      .phase-meta-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 9px; background: var(--phase-color, #64748b); }
      .phase-meta-overlay { position: fixed; inset: 0; z-index: 999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(15, 23, 42, .56); }
      .phase-meta-dialog { width: min(560px, 100%); max-height: calc(100vh - 36px); overflow: auto; background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(15, 23, 42, .34); padding: 20px; }
      .phase-meta-dialog h2 { margin: 0 0 4px; font-size: 18px; }
      .phase-meta-dialog .sub { margin: 0 0 18px; color: #64748b; font-size: 12px; }
      .phase-meta-dialog label { display: block; margin: 12px 0 5px; font-size: 11px; font-weight: 800; color: #475569; }
      .phase-meta-dialog input[type=text], .phase-meta-dialog textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px; font: inherit; }
      .phase-meta-dialog textarea { min-height: 94px; resize: vertical; }
      .phase-meta-color-row { display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: center; }
      .phase-meta-color-row input[type=color] { width: 52px; height: 38px; padding: 3px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; cursor: pointer; }
      .phase-meta-preview { margin-top: 15px; padding: 13px; border-radius: 12px; border-left: 5px solid #64748b; }
      .phase-meta-preview-title { font-weight: 900; font-size: 13px; }
      .phase-meta-preview-desc { margin-top: 3px; color: #475569; font-size: 12px; white-space: pre-wrap; }
      .phase-meta-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
      .phase-meta-actions button { border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 999px; padding: 8px 14px; font-weight: 800; cursor: pointer; }
      .phase-meta-actions .save { background: #38bdf8; border-color: #38bdf8; color: #082f49; }
      .phase-meta-actions button:hover { filter: brightness(.97); }
    `;
    document.head.appendChild(style);
  }

  function applyPhaseStyles() {
    const side = document.getElementById('side');
    if (!side) return;
    side.querySelectorAll('.ph').forEach((row) => {
      const trigger = row.querySelector("[data-act='edit-phase']");
      const phase = phaseById(trigger?.dataset.ph);
      if (!phase) return;
      normalizePhaseMeta(phase);
      row.classList.add('phase-meta');
      row.style.setProperty('--phase-color', phase.color);
      row.style.background = phase.bg;
      row.title = phase.desc || `${phase.id} · ${phase.name}`;
      if (!row.querySelector('.phase-meta-dot')) {
        const dot = document.createElement('span');
        dot.className = 'phase-meta-dot';
        row.insertBefore(dot, row.firstChild);
      }
    });
  }

  function openPhaseEditor(phaseId) {
    const phase = phaseById(phaseId);
    if (!phase) return;
    normalizePhaseMeta(phase);

    document.querySelector('.phase-meta-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'phase-meta-overlay';
    overlay.innerHTML = `
      <div class="phase-meta-dialog" role="dialog" aria-modal="true" aria-label="フェーズ設定">
        <h2>フェーズ設定</h2>
        <p class="sub">説明と色は、左側のフェーズ一覧およびレビューHTML出力に反映されます。</p>
        <label for="phase-meta-name">フェーズ名</label>
        <input id="phase-meta-name" type="text">
        <label for="phase-meta-desc">フェーズの説明</label>
        <textarea id="phase-meta-desc" placeholder="このフェーズで学ぶこと、構成の意図などを入力"></textarea>
        <label>フェーズの色</label>
        <div class="phase-meta-color-row"><input id="phase-meta-color" type="color"><input id="phase-meta-color-text" type="text" inputmode="text" spellcheck="false" maxlength="7" aria-label="色コード"></div>
        <div class="phase-meta-preview" id="phase-meta-preview"><div class="phase-meta-preview-title" id="phase-meta-preview-title"></div><div class="phase-meta-preview-desc" id="phase-meta-preview-desc"></div></div>
        <div class="phase-meta-actions"><button type="button" id="phase-meta-cancel">キャンセル</button><button type="button" class="save" id="phase-meta-save">保存</button></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const name = overlay.querySelector('#phase-meta-name');
    const desc = overlay.querySelector('#phase-meta-desc');
    const color = overlay.querySelector('#phase-meta-color');
    const colorText = overlay.querySelector('#phase-meta-color-text');
    const preview = overlay.querySelector('#phase-meta-preview');
    const previewTitle = overlay.querySelector('#phase-meta-preview-title');
    const previewDesc = overlay.querySelector('#phase-meta-preview-desc');

    name.value = phase.name;
    desc.value = phase.desc;
    color.value = phase.color;
    colorText.value = phase.color;

    const previewUpdate = () => {
      const selected = isHexColor(colorText.value) ? colorText.value.toLowerCase() : color.value;
      preview.style.borderLeftColor = selected;
      preview.style.background = lightBackground(selected);
      previewTitle.textContent = `${phase.id} · ${name.value.trim() || '無題グループ'}`;
      previewDesc.textContent = desc.value.trim() || 'フェーズの説明は未入力です。';
    };

    color.oninput = () => { colorText.value = color.value; previewUpdate(); };
    colorText.oninput = () => {
      if (isHexColor(colorText.value)) color.value = colorText.value;
      previewUpdate();
    };
    name.oninput = previewUpdate;
    desc.oninput = previewUpdate;
    previewUpdate();
    name.focus();

    const close = () => overlay.remove();
    overlay.querySelector('#phase-meta-cancel').onclick = close;
    overlay.onclick = (event) => { if (event.target === overlay) close(); };
    overlay.querySelector('#phase-meta-save').onclick = () => {
      const nextColor = isHexColor(colorText.value) ? colorText.value.toLowerCase() : color.value;
      phase.name = name.value.trim() || phase.name || '無題グループ';
      phase.desc = desc.value.trim();
      phase.color = nextColor;
      phase.bg = lightBackground(nextColor);
      if (typeof saveLocal === 'function') saveLocal();
      if (typeof render === 'function') render();
      if (typeof msg === 'function') msg('フェーズ設定を更新しました');
      close();
    };
    document.addEventListener('keydown', function escape(event) {
      if (event.key !== 'Escape') return;
      close();
      document.removeEventListener('keydown', escape);
    });
  }

  const previousRenderSide = window.renderSide || renderSide;
  setGlobal('renderSide', function renderSideWithPhaseMeta(...args) {
    const result = previousRenderSide(...args);
    (st.phases || []).forEach(normalizePhaseMeta);
    applyPhaseStyles();
    return result;
  });

  const previousEditPhase = window.editPhase || editPhase;
  setGlobal('editPhase', function editPhaseWithMeta(phaseId) {
    if (!phaseById(phaseId)) return previousEditPhase(phaseId);
    openPhaseEditor(phaseId);
  });

  installStyle();
  (st.phases || []).forEach(normalizePhaseMeta);
  if (typeof render === 'function') render();
})();
