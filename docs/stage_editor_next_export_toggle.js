(() => {
  const EXPORT_FLAG = 'includeInExport';

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isIncluded(stage) {
    return stage?.[EXPORT_FLAG] !== false;
  }

  function normalizeExportFlag(stage) {
    if (typeof stage?.[EXPORT_FLAG] !== 'boolean') stage[EXPORT_FLAG] = true;
  }

  function stageByRef(phaseId, index) {
    const phase = (st.phases || []).find((item) => item.id === phaseId);
    return phase?.stages?.[Number(index)] || null;
  }

  function toggleStageExport(phaseId, index) {
    const stage = stageByRef(phaseId, index);
    if (!stage) return;
    normalizeExportFlag(stage);
    stage[EXPORT_FLAG] = !stage[EXPORT_FLAG];
    if (typeof saveLocal === 'function') saveLocal();
    renderSide();
    if (typeof msg === 'function') msg(stage[EXPORT_FLAG] ? '出力対象に戻しました' : '出力対象から外しました');
  }

  function installSidebarStyle() {
    if (document.getElementById('export-toggle-style')) return;
    const style = document.createElement('style');
    style.id = 'export-toggle-style';
    style.textContent = `
      .st.export-excluded { opacity: .42; }
      .st.export-excluded:hover { opacity: .78; }
      .export-toggle-on { font-weight: 900; }
      .export-toggle-off { font-weight: 900; text-decoration: line-through; }
    `;
    document.head.appendChild(style);
  }

  const previousRenderSide = window.renderSide || renderSide;
  setGlobal('renderSide', function renderSideWithExportToggle() {
    previousRenderSide();
    const side = document.getElementById('side');
    if (!side) return;

    side.querySelectorAll(".st[data-act='sel']").forEach((row) => {
      const phaseId = row.dataset.ph;
      const index = Number(row.dataset.i);
      const stage = stageByRef(phaseId, index);
      if (!stage) return;
      normalizeExportFlag(stage);
      const included = isIncluded(stage);
      row.classList.toggle('export-excluded', !included);

      const actions = row.querySelector('.st-actions');
      if (!actions || actions.querySelector('.stage-export-toggle')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `side-mini stage-export-toggle ${included ? 'export-toggle-on' : 'export-toggle-off'}`;
      button.textContent = included ? '出' : '除';
      button.title = included ? '出力対象から外す' : '出力対象に戻す';
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleStageExport(phaseId, index);
      };
      actions.insertBefore(button, actions.firstChild);
    });
  });

  function exportedPhases() {
    const phases = clone(st.phases || []);
    const result = phases.map((phase) => ({
      ...phase,
      stages: (phase.stages || []).filter((stage) => isIncluded(stage)),
    })).filter((phase) => phase.stages.length > 0);

    let number = 1;
    result.forEach((phase) => {
      phase.stages.forEach((stage) => {
        stage.no = number;
        const match = String(stage.id || '').match(/^step-\d+-(.+)$/);
        if (match) stage.id = `step-${String(number).padStart(2, '0')}-${match[1]}`;
        number += 1;
      });
    });
    return result;
  }

  function exportPayload() {
    const phases = exportedPhases();
    const names = Array.isArray(SETS) ? [...SETS] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : BLOCK_SET_ALLOWED;
    const blockSets = {};
    names.forEach((name) => { blockSets[name] = Array.isArray(source[name]) ? [...source[name]] : []; });
    return {
      version: 2,
      blockSets,
      blockSetOrder: names,
      deletedBlockSets: Array.isArray(st.deletedBlockSets) ? [...st.deletedBlockSets] : [],
      phases,
    };
  }

  function download(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function saveExportJson() {
    if (typeof saveXml === 'function') saveXml();
    download(
      JSON.stringify(exportPayload(), null, 2),
      `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
  }

  function exportReview() {
    if (typeof saveXml === 'function') saveXml();
    const phases = exportedPhases();
    const html = typeof window.reviewHtml === 'function'
      ? window.reviewHtml(phases)
      : `<!doctype html><html lang="ja"><meta charset="utf-8"><title>CHaser Review</title><body><pre id="out"></pre><script>document.getElementById('out').textContent=JSON.stringify(${JSON.stringify(phases).replace(/<\/script/gi, '<\\/script')},null,2)<\/script></body></html>`;
    download(html, 'stage_review_next.html', 'text/html');
  }

  function bindExportButtons() {
    const jsonButton = document.getElementById('save-json');
    if (jsonButton) jsonButton.onclick = saveExportJson;
    const reviewButton = document.getElementById('export-review');
    if (reviewButton) reviewButton.onclick = exportReview;
  }

  const originalNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithExportFlag(stage, no) {
    originalNormStage(stage, no);
    normalizeExportFlag(stage);
  });

  installSidebarStyle();
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeExportFlag));
  bindExportButtons();
  render();
})();
