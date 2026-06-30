(() => {
  const LEVELS = [
    [0, '未設定'],
    [1, '★ 1 入門'],
    [2, '★ 2 初級'],
    [3, '★ 3 中級'],
    [4, '★ 4 上級'],
    [5, '★ 5 最上級'],
  ];

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function normalizeDifficulty(stage) {
    if (!stage || typeof stage !== 'object') return 0;
    const value = Number.parseInt(stage.difficulty, 10);
    stage.difficulty = Number.isInteger(value) && value >= 1 && value <= 5 ? value : 0;
    return stage.difficulty;
  }

  function stageByRef(phaseId, index) {
    const phase = (st.phases || []).find((item) => item.id === phaseId);
    return phase?.stages?.[Number(index)] || null;
  }

  function badgeText(level) {
    return level ? `★${level}` : '難?';
  }

  function installStyle() {
    if (document.getElementById('difficulty-style')) return;
    const style = document.createElement('style');
    style.id = 'difficulty-style';
    style.textContent = `
      .difficulty-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 27px;
        margin-left: 4px;
        padding: 1px 4px;
        border: 1px solid currentColor;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        line-height: 1.3;
        white-space: nowrap;
      }
      .difficulty-0 { opacity: .55; }
      .difficulty-1 { color: #23734b; }
      .difficulty-2 { color: #35738a; }
      .difficulty-3 { color: #9a6814; }
      .difficulty-4 { color: #a34e20; }
      .difficulty-5 { color: #9b3142; }
      #difficulty-editor { min-width: 150px; }
    `;
    document.head.appendChild(style);
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithDifficulty(stage, no) {
    previousNormStage(stage, no);
    normalizeDifficulty(stage);
  });

  const previousRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithDifficulty(stage) {
    normalizeDifficulty(stage);
    previousRenderEdit(stage);

    if (document.getElementById('difficulty-editor')) return;
    const titleField = document.getElementById('f-title')?.closest('.field');
    const blockSetField = document.getElementById('f-blockset')?.closest('.field');
    const anchor = titleField || blockSetField;
    if (!anchor) return;

    const field = document.createElement('div');
    field.id = 'difficulty-editor';
    field.className = 'field';
    field.innerHTML = `<label>難易度</label><select id="f-difficulty">${LEVELS.map(([level, label]) => `<option value="${level}" ${stage.difficulty === level ? 'selected' : ''}>${label}</option>`).join('')}</select><div class="hint">左側バーにも難易度が表示されます。</div>`;
    anchor.insertAdjacentElement('afterend', field);

    document.getElementById('f-difficulty').onchange = (event) => {
      stage.difficulty = Number.parseInt(event.target.value, 10) || 0;
      if (typeof saveLocal === 'function') saveLocal();
      if (typeof renderSide === 'function') renderSide();
      if (typeof msg === 'function') msg(stage.difficulty ? `難易度を★${stage.difficulty}に設定しました` : '難易度を未設定にしました');
    };
  });

  const previousRenderSide = window.renderSide || renderSide;
  setGlobal('renderSide', function renderSideWithDifficulty() {
    previousRenderSide();
    const side = document.getElementById('side');
    if (!side) return;

    side.querySelectorAll(".st[data-act='sel']").forEach((row) => {
      const stage = stageByRef(row.dataset.ph, row.dataset.i);
      if (!stage) return;
      const difficulty = normalizeDifficulty(stage);
      const number = row.querySelector('.st-no');
      if (!number || number.parentElement.querySelector('.difficulty-badge')) return;

      const badge = document.createElement('span');
      badge.className = `difficulty-badge difficulty-${difficulty}`;
      badge.textContent = badgeText(difficulty);
      badge.title = difficulty ? `難易度 ★${difficulty}` : '難易度 未設定';
      number.insertAdjacentElement('afterend', badge);
    });
  });

  installStyle();
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeDifficulty));
  if (typeof render === 'function') render();

  const hotBlockly = document.createElement('script');
  hotBlockly.src = './stage_editor_next_hot_blockly_v2.js';
  hotBlockly.async = false;
  document.body.appendChild(hotBlockly);
})();
