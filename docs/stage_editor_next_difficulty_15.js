(() => {
  const MAX_DIFFICULTY = 15;

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function parseDifficulty(value) {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n >= 1 && n <= MAX_DIFFICULTY ? n : 0;
  }

  function normalizeDifficulty(stage) {
    if (!stage || typeof stage !== 'object') return 0;
    stage.difficulty = parseDifficulty(stage.difficulty);
    return stage.difficulty;
  }

  function stageByRef(phaseId, index) {
    const phase = (st.phases || []).find((item) => item.id === phaseId);
    return phase?.stages?.[Number(index)] || null;
  }

  function optionsHtml(selected) {
    const options = ['<option value="0">未設定</option>'];
    for (let level = 1; level <= MAX_DIFFICULTY; level++) {
      options.push(`<option value="${level}" ${selected === level ? 'selected' : ''}>★ ${level} / ${MAX_DIFFICULTY}</option>`);
    }
    return options.join('');
  }

  function colorFor(level) {
    if (!level) return '';
    const hue = Math.round(132 - ((level - 1) * 132 / (MAX_DIFFICULTY - 1)));
    return `hsl(${hue} 65% 38%)`;
  }

  function refreshDifficultyEditor(stage) {
    const select = document.getElementById('f-difficulty');
    if (!select) return;
    const difficulty = normalizeDifficulty(stage);
    select.innerHTML = optionsHtml(difficulty);
    select.value = String(difficulty);
    select.onchange = (event) => {
      stage.difficulty = parseDifficulty(event.target.value);
      if (typeof saveLocal === 'function') saveLocal();
      if (typeof renderSide === 'function') renderSide();
      if (typeof msg === 'function') {
        msg(stage.difficulty ? `難易度を★${stage.difficulty}/${MAX_DIFFICULTY}に設定しました` : '難易度を未設定にしました');
      }
    };
    const hint = select.parentElement?.querySelector('.hint');
    if (hint) hint.textContent = `15段階で設定できます。左側バーにも ★1〜★${MAX_DIFFICULTY} で表示されます。`;
  }

  function renderDifficultyBadges() {
    const side = document.getElementById('side');
    if (!side) return;
    side.querySelectorAll('.difficulty-badge').forEach((badge) => badge.remove());
    side.querySelectorAll(".st[data-act='sel']").forEach((row) => {
      const stage = stageByRef(row.dataset.ph, row.dataset.i);
      if (!stage) return;
      const difficulty = normalizeDifficulty(stage);
      const number = row.querySelector('.st-no');
      if (!number) return;
      const badge = document.createElement('span');
      badge.className = `difficulty-badge difficulty-${difficulty}`;
      badge.textContent = difficulty ? `★${difficulty}` : '難?';
      badge.title = difficulty ? `難易度 ★${difficulty} / ${MAX_DIFFICY}` : '難易度 未設定';
      badge.style.color = colorFor(difficulty);
      number.insertAdjacentElement('afterend', badge);
    });
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWith15Difficulty(stage, no) {
    const preserved = parseDifficulty(stage?.difficulty);
    previousNormStage(stage, no);
    stage.difficulty = preserved;
    normalizeDifficulty(stage);
  });

  const previousRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWith15Difficulty(stage) {
    const preserved = parseDifficulty(stage?.difficulty);
    previousRenderEdit(stage);
    stage.difficulty = preserved;
    normalizeDifficulty(stage);
    refreshDifficultyEditor(stage);
  });

  const previousRenderSide = window.renderSide || renderSide;
  setGlobal('renderSide', function renderSideWith15Difficulty() {
    const preserved = new Map();
    (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => {
      preserved.set(stage, parseDifficulty(stage.difficulty));
    }));
    previousRenderSide();
    preserved.forEach((difficulty, stage) => { stage.difficulty = difficulty; });
    renderDifficultyBadges();
  });

  function fixRandomHotWalk() {
    if (!window.Blockly || typeof window.gen !== 'function') return;
    const generator = window.gen();
    generator.forBlock.chaser_hot_walk_random = () => "(()=>{const dirs=['Up','Down','Left','Right'];const indices={Up:1,Down:7,Left:3,Right:5};const available=dirs.filter(d=>api.around[indices[d]]!==2);const pool=available.length?available:dirs;const direction=pool[Math.floor(Math.random()*pool.length)];const walk=api['walk'+direction];if(typeof walk==='function'){walk();}})();";
  }

  fixRandomHotWalk();
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeDifficulty));
  if (typeof render === 'function') render();
})();
