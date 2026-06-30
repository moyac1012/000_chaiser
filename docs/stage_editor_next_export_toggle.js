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

  function buildPayload(phases) {
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

  function exportPayload() {
    return buildPayload(exportedPhases());
  }

  function jsonPayload() {
    return buildPayload(clone(st.phases || []));
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
      JSON.stringify(jsonPayload(), null, 2),
      `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
  }

  function reviewHtml(phases) {
    const payload = JSON.stringify(phases).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CHaser チュートリアル ステージ一覧</title>
<style>
:root{--cool:#38bdf8;--hot:#fb7185;--ink:#0f172a;--ink-soft:#334155;--panel-strong:rgba(255,255,255,.97);--border:rgba(15,23,42,.12);--font-ui:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--font-display:"Arial Black",var(--font-ui)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-ui);color:var(--ink);background-color:#f8fafc;background-image:radial-gradient(700px 400px at 8% 12%,rgba(56,189,248,.18),transparent 65%),radial-gradient(680px 380px at 95% -4%,rgba(251,146,60,.20),transparent 60%),linear-gradient(rgba(15,23,42,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.04) 1px,transparent 1px),linear-gradient(180deg,#f8fafc 0%,#f1f5f9 55%,#eef2ff 100%);background-size:auto,auto,26px 26px,26px 26px,auto;min-height:100vh}
.site-header{position:sticky;top:0;z-index:20;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border-bottom:1px solid rgba(148,163,184,.2);box-shadow:0 4px 24px rgba(15,23,42,.25)}.header-inner{max-width:1400px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}.header-logo{font-family:var(--font-display);font-size:20px;font-weight:800;letter-spacing:.1em;color:#f8fafc}.header-logo span{color:var(--cool)}.header-sub{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(148,163,184,.8);margin-left:8px}.header-count{margin-left:auto;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.3);border-radius:999px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#e2e8f0}
.phase-nav{max-width:1400px;margin:0 auto;padding:16px 24px 0;display:flex;gap:8px;flex-wrap:wrap}.phase-tab{padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border:1px solid transparent;transition:transform .15s,opacity .15s}.phase-tab:hover{transform:translateY(-1px);opacity:.85}.main{max-width:1400px;margin:0 auto;padding:24px}.phase-section{margin-bottom:48px;scroll-margin-top:86px}.phase-header{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px 20px;border-radius:20px;color:#e2e8f0;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border:1px solid rgba(148,163,184,.22)}.phase-label{font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:.12em}.phase-name{font-size:15px;font-weight:600;color:#cbd5e1}.phase-desc{font-size:12px;color:#94a3b8;margin-top:2px}.phase-range{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:.14em;color:rgba(226,232,240,.6);text-transform:uppercase;white-space:nowrap}.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:16px}.stage-card{background:var(--panel-strong);border:1px solid var(--border);border-radius:24px;box-shadow:0 8px 24px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.7);display:flex;flex-direction:column;overflow:hidden}.card-header{padding:14px 18px 10px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--border)}.step-num{font-family:var(--font-display);font-size:28px;font-weight:800;line-height:1;min-width:42px;color:var(--ink)}.card-title-area{flex:1;min-width:0}.card-title{font-size:14px;font-weight:700;color:var(--ink);line-height:1.35}.card-id{font-size:10px;color:#94a3b8;margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.phase-pip{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}.card-badges{padding:8px 18px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--border)}.badge{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid transparent}.badge--block{background:#f1f5f9;color:#475569;border-color:#cbd5e1}.badge--var{background:#ede9fe;color:#7c3aed;border-color:#c4b5fd}.badge--cond{background:#e0f2fe;color:#0369a1;border-color:#7dd3fc}.badge--difficulty{background:#fef3c7;color:#92400e;border-color:#fcd34d}.badge--hot{background:#ffe4e6;color:#be123c;border-color:#fda4af}.badge--goal{background:#f0fdf4;color:#166534;border-color:#86efac}.card-body{padding:12px 18px 18px;flex:1;display:flex;flex-direction:column;gap:12px}.field-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}.field-value{font-size:12px;color:var(--ink-soft);line-height:1.55;white-space:pre-wrap}.maps-wrap{display:flex;flex-wrap:wrap;gap:12px}.map-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}.map-grid{display:inline-grid;gap:1px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;padding:4px}.map-row{display:flex}.cell{width:16px;height:16px;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.c-wall{background:#1e293b}.c-floor{background:#f8fafc}.c-item{background:#fbbf24}.c-cool{background:#38bdf8}.c-hot{background:#fb7185}.c-goal{background:#34d399}.variant-note{font-size:10px;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:6px 10px;margin-top:6px}.empty{max-width:700px;margin:80px auto;padding:28px;border:1px dashed #94a3b8;border-radius:16px;background:#fff;text-align:center;color:#64748b}.footer{max-width:1400px;margin:0 auto;padding:0 24px 28px;text-align:center;font-size:11px;color:#94a3b8}
@media(max-width:600px){.header-inner,.phase-nav,.main{padding-left:16px;padding-right:16px}.header-count{margin-left:0}.stage-grid{grid-template-columns:1fr}.main{padding-top:16px}.phase-range{display:none}}
</style>
</head>
<body>
<header class="site-header"><div class="header-inner"><div><span class="header-logo">CH<span>aser</span></span><span class="header-sub">Tutorial Stage Review</span></div><div class="header-count" id="header-count"></div></div></header>
<nav class="phase-nav" id="phase-nav" aria-label="フェーズ"></nav>
<main class="main" id="main"></main>
<footer class="footer">CHaser Tutorial Stage Review</footer>
<script>
const PHASES=${payload};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeColor=value=>/^#[0-9a-f]{3,8}$/i.test(String(value||''))?value:'#64748b';
const tileClass=cell=>({ '#':'c-wall','.':'c-floor','I':'c-item','C':'c-cool','H':'c-hot','G':'c-goal' }[cell]||'c-floor');
function renderMap(map,index){const rows=Array.isArray(map?.rows)?map.rows:[];return '<div><div class="map-label">'+esc(map?.label||'マップ '+String.fromCharCode(65+index))+'</div><div class="map-grid">'+rows.map(row=>'<div class="map-row">'+Array.from(String(row)).map(cell=>'<span class="cell '+tileClass(cell)+'">'+(cell==='.'?'':esc(cell))+'</span>').join('')+'</div>').join('')+'</div>'+(map?.note?'<div class="variant-note">'+esc(map.note)+'</div>':'')+'</div>'}
function badge(text,cls){return '<span class="badge '+cls+'">'+esc(text)+'</span>'}
function renderStage(stage,phase){const maps=Array.isArray(stage.maps)?stage.maps:[];const badges=[badge(stage.blockSet||'BLOCK','badge--block')];if(maps.length>1||Number(stage.variants)>1)badges.push(badge(String(stage.variants||maps.length)+' maps','badge--var'));if(stage.cond)badges.push(badge(stage.cond,'badge--cond'));if(Number(stage.difficulty)>0)badges.push(badge('★'+String(stage.difficulty)+'/15','badge--difficulty'));if(stage.hotEnabled||stage.hotBehavior?.enabled)badges.push(badge('HOT行動','badge--hot'));return '<article class="stage-card"><div class="card-header"><div class="step-num">'+String(stage.no??'–').padStart(2,'0')+'</div><div class="card-title-area"><div class="card-title">'+esc(stage.title||'無題のステージ')+'</div><div class="card-id">'+esc(stage.id||'')+'</div></div><span class="phase-pip" style="background:'+safeColor(phase.color)+'"></span></div><div class="card-badges">'+badges.join('')+'</div><div class="card-body">'+(stage.goal?'<div><div class="field-label">学習目標</div><div class="field-value">'+esc(stage.goal)+'</div></div>':'')+(stage.rule?'<div><div class="field-label">ルール / 想定解法</div><div class="field-value">'+esc(stage.rule)+'</div></div>':'')+(maps.length?'<div><div class="field-label">マップ</div><div class="maps-wrap">'+maps.map(renderMap).join('')+'</div></div>':'')+'</div></article>'}
function render(){const phaseNav=document.getElementById('phase-nav'),main=document.getElementById('main');const count=PHASES.reduce((sum,phase)=>sum+(Array.isArray(phase.stages)?phase.stages.length:0),0);document.getElementById('header-count').textContent=count+' Stages · '+PHASES.length+' Groups';if(!PHASES.length){main.innerHTML='<div class="empty">出力対象のステージがありません。</div>';return}phaseNav.innerHTML=PHASES.map(phase=>'<a class="phase-tab" href="#phase-'+esc(phase.id)+'" style="color:'+safeColor(phase.color)+';background:'+String(phase.bg||'#f1f5f9')+';border-color:'+safeColor(phase.color)+'33">'+esc(phase.id)+' · '+esc(phase.name||'無題')+'</a>').join('');main.innerHTML=PHASES.map(phase=>'<section class="phase-section" id="phase-'+esc(phase.id)+'"><div class="phase-header"><div><div><span class="phase-label">'+esc(phase.id||'–')+'</span> <span class="phase-name">'+esc(phase.name||'無題')+'</span></div>'+(phase.desc?'<div class="phase-desc">'+esc(phase.desc)+'</div>':'')+'</div><div class="phase-range">'+esc(phase.range||String((phase.stages||[]).length)+' Stages')+'</div></div><div class="stage-grid">'+(phase.stages||[]).map(stage=>renderStage(stage,phase)).join('')+'</div></section>').join('')}
render();
<\/script>
</body>
</html>`;
  }

  setGlobal('reviewHtml', reviewHtml);

  function exportReview() {
    if (typeof saveXml === 'function') saveXml();
    const html = reviewHtml(exportedPhases());
    download(html, 'stage_review.html', 'text/html');
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

  const gameRules = document.createElement('script');
  gameRules.src = './stage_editor_next_game_rules.js';
  gameRules.async = false;
  document.body.appendChild(gameRules);

  const difficulty = document.createElement('script');
  difficulty.src = './stage_editor_next_difficulty.js';
  difficulty.async = false;
  document.body.appendChild(difficulty);
})();
