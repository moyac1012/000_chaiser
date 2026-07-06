(() => {
  const HOT_ENABLED = (stage) => Boolean(stage?.hotEnabled || stage?.hotBehavior?.enabled);
  const BLOCK_LABELS = {
    chaser_on_turn: '毎ターン', chaser_turn_end: 'ターンを終える',
    chaser_action_walk: '歩く', chaser_action_put: 'ブロックを置く',
    chaser_action_walk_last: '前に進んだ向きで歩く', chaser_action_walk_random: 'どこかに歩く',
    chaser_action_look: '見る', chaser_action_search: 'まっすぐ見る',
    chaser_get_tile: '方向のマス', chaser_is_tile: '方向のマス判定',
    chaser_state_create: '変数を作る', chaser_state_set: '変数に値を入れる', chaser_state_get: '変数を読む',
    chaser_state_change: '変数を増減', chaser_turn_number: '現在のターン数',
    chaser_hot_on_turn: 'HOTの毎ターン', chaser_hot_turn_end: 'HOTのターンを終える',
    chaser_hot_walk: 'HOTが歩く', chaser_hot_walk_last: 'HOTが前に進んだ向きで歩く',
    chaser_hot_walk_random: 'HOTがどこかに歩く', chaser_hot_put: 'HOTがブロックを置く',
    chaser_hot_is_tile: 'HOTの方向のマス判定', chaser_hot_get_tile: 'HOTの方向のマス',
    controls_if: 'もし', logic_compare: '比較', logic_operation: 'かつ / または',
    logic_boolean: '真 / 偽', logic_negate: 'ではない',
    math_number: '数', math_arithmetic: '四則演算', math_modulo: '余り',
  };
  const DIRS = { Up:'↑ 上', Down:'↓ 下', Left:'← 左', Right:'→ 右' };

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function getGlobal(name, fallback) {
    try {
      const value = Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)();
      return value === undefined ? fallback : value;
    } catch (_) { return fallback; }
  }
  function label(type) { return BLOCK_LABELS[type] || String(type || '不明なブロック'); }
  function field(block, name) {
    return Array.from(block.children).find((node) => node.tagName === 'field' && node.getAttribute('name') === name)?.textContent || '';
  }
  function hotProgram(xml) {
    if (!xml) return 'HOTの行動プログラムは未設定です。';
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('parse');
      const blocks = Array.from(doc.querySelectorAll('block'));
      if (!blocks.length) return 'HOTの行動プログラムは未設定です。';
      return blocks.map((block) => {
        const type = block.getAttribute('type') || '';
        const direction = field(block, 'DIR');
        return `${label(type)}${DIRS[direction] ? ` ${DIRS[direction]}` : ''}`;
      }).join('\n');
    } catch (_) {
      return 'HOTの行動プログラムを読み取れませんでした。';
    }
  }
  function compactStage(stage, no) {
    return {
      no,
      id: stage.id || `step-${String(no).padStart(2, '0')}`,
      title: stage.title || '無題ステージ',
      blockSet: stage.blockSet || 'BASIC',
      variants: Number(stage.variants) || (stage.maps || []).length || 1,
      cond: stage.cond || '',
      difficulty: Number(stage.difficulty) || 0,
      goal: stage.goal || '',
      rule: stage.rule || '',
      maps: copy(stage.maps || []),
      hotEnabled: HOT_ENABLED(stage),
      hotProgram: HOT_ENABLED(stage) ? hotProgram(stage.hotBehavior?.savedBlocklyXml || '') : '',
    };
  }
  function reviewData() {
    const phases = [];
    let no = 1;
    (st.phases || []).forEach((phase) => {
      const stages = (phase.stages || [])
        .filter((stage) => stage?.includeInExport !== false)
        .map((stage) => compactStage(stage, no++));
      if (stages.length) phases.push({
        id: phase.id || '–', name: phase.name || '無題', range: phase.range || '', color: phase.color || '#64748b', bg: phase.bg || '#f1f5f9', desc: phase.desc || '', stages,
      });
    });
    const order = Array.isArray(getGlobal('SETS', [])) ? [...getGlobal('SETS', [])] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : getGlobal('BLOCK_SET_ALLOWED', {});
    const blockSets = {};
    [...order, ...Object.keys(source || {}).filter((name) => !order.includes(name))].forEach((name) => {
      blockSets[name] = Array.isArray(source?.[name]) ? [...source[name]] : [];
    });
    return { phases, blockSetOrder: Object.keys(blockSets), blockSets };
  }
  function safeJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }
  function clientScript() {
    return String.raw`(() => {
const data = JSON.parse(document.getElementById('review-data').textContent);
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const color = (value) => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#64748b';
const tileClass = (value) => ({'#':'wall','.':'floor','I':'item','C':'cool','H':'hot','G':'goal'}[value] || 'floor');
const labels = ${JSON.stringify(BLOCK_LABELS)};
const label = (type) => labels[type] || String(type || '不明なブロック');
function mapHtml(map, index) {
  const rows = Array.isArray(map && map.rows) ? map.rows : [];
  const cells = rows.map((row) => '<div class="map-row">' + Array.from(String(row)).map((cell) => '<span class="cell ' + tileClass(cell) + '">' + ((cell === '.' || cell === '#') ? '' : esc(cell)) + '</span>').join('') + '</div>').join('');
  return '<div class="map-box"><div class="small-label">' + esc((map && map.label) || ('マップ ' + String.fromCharCode(65 + index))) + '</div><div class="map-grid">' + cells + '</div>' + ((map && map.note) ? '<div class="map-note">' + esc(map.note) + '</div>' : '') + '</div>';
}
function blockSetsHtml() {
  const names = Array.isArray(data.blockSetOrder) ? data.blockSetOrder : [];
  return '<section class="panel intro"><h2>ブロックセット一覧</h2><div class="blockset-grid">' + names.map((name) => {
    const blocks = Array.isArray(data.blockSets && data.blockSets[name]) ? data.blockSets[name] : [];
    const chips = blocks.length ? blocks.map((type) => '<span title="' + esc(type) + '">' + esc(label(type)) + '</span>').join('') : '<span>ブロックなし</span>';
    return '<div class="blockset"><b>' + esc(name) + '</b><span class="count">' + blocks.length + ' blocks</span><div class="chips">' + chips + '</div></div>';
  }).join('') + '</div></section>';
}
function stageHtml(stage, phase) {
  const badges = ['<span class="badge">' + esc(stage.blockSet) + '</span>', '<span class="badge">' + esc(stage.variants) + ' maps</span>'];
  if (stage.cond) badges.push('<span class="badge blue">' + esc(stage.cond) + '</span>');
  if (stage.difficulty) badges.push('<span class="badge yellow">★' + esc(stage.difficulty) + '/15</span>');
  if (stage.hotEnabled) badges.push('<span class="badge hot">HOT行動</span>');
  const details = (stage.goal ? '<section><div class="small-label">学習目標</div><div>' + esc(stage.goal) + '</div></section>' : '') + (stage.rule ? '<section><div class="small-label">ルール / 想定解法</div><div>' + esc(stage.rule) + '</div></section>' : '') + (Array.isArray(stage.maps) && stage.maps.length ? '<section><div class="small-label">マップ</div><div class="maps">' + stage.maps.map(mapHtml).join('') + '</div></section>' : '') + (stage.hotEnabled ? '<section class="hot-program"><div class="small-label">HOTの行動プログラム</div><pre>' + esc(stage.hotProgram) + '</pre></section>' : '');
  return '<article class="stage"><div class="stage-head"><div class="number">' + String(stage.no).padStart(2, '0') + '</div><div><div class="title">' + esc(stage.title) + '</div><div class="id">' + esc(stage.id) + '</div></div><i style="background:' + color(phase.color) + '"></i></div><div class="badges">' + badges.join('') + '</div><div class="stage-body">' + details + '</div></article>';
}
function render() {
  const phases = Array.isArray(data.phases) ? data.phases : [];
  const nav = document.getElementById('phase-nav');
  const main = document.getElementById('main');
  const total = phases.reduce((sum, phase) => sum + ((phase.stages || []).length), 0);
  document.getElementById('header-count').textContent = total + ' Stages · ' + phases.length + ' Groups';
  if (!phases.length) { main.innerHTML = '<div class="empty">出力対象のステージがありません。</div>'; return; }
  nav.innerHTML = phases.map((phase) => '<a href="#phase-' + esc(phase.id) + '" style="color:' + color(phase.color) + ';background:' + esc(phase.bg || '#f1f5f9') + '">' + esc(phase.id) + ' · ' + esc(phase.name) + '</a>').join('');
  main.innerHTML = blockSetsHtml() + phases.map((phase) => '<section class="phase" id="phase-' + esc(phase.id) + '"><header><div><b>' + esc(phase.id) + '</b> <span>' + esc(phase.name) + '</span>' + (phase.desc ? '<p>' + esc(phase.desc) + '</p>' : '') + '</div><em>' + esc(phase.range || ((phase.stages || []).length + ' Stages')) + '</em></header><div class="stage-grid">' + (phase.stages || []).map((stage) => stageHtml(stage, phase)).join('') + '</div></section>').join('');
}
render();
})();`;
  }
  function reviewHtml(data) {
    const json = safeJson(data);
    const script = clientScript();
    return [
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHaser チュートリアル ステージ一覧</title>',
      '<style>body{margin:0;font-family:system-ui,sans-serif;background:#f5f7fb;color:#0f172a;line-height:1.55}.site-header{position:sticky;top:0;background:#0f172a;color:#fff;z-index:10}.header-inner,.phase-nav,.main{max-width:1400px;margin:auto;padding-left:24px;padding-right:24px}.header-inner{padding-top:12px;padding-bottom:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.logo{font-weight:900;letter-spacing:.1em}.logo span{color:#38bdf8}.sub{font-size:11px;color:#94a3b8}.counter{margin-left:auto;font-size:11px;font-weight:800}.phase-nav{padding-top:16px;display:flex;gap:8px;flex-wrap:wrap}.phase-nav a{text-decoration:none;border:1px solid #cbd5e1;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800}.main{padding-top:20px;padding-bottom:48px}.panel,.stage{background:#fff;border:1px solid #dbe3ee;border-radius:18px;box-shadow:0 8px 22px rgba(15,23,42,.06)}.intro{padding:18px;margin-bottom:24px}.intro h2{margin:0 0 12px;font-size:17px}.blockset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}.blockset{border:1px solid #dbe4ef;border-radius:12px;padding:10px;background:#f8fafc;font:12px ui-monospace,monospace}.count{margin-left:7px;color:#64748b;font-size:10px}.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chips span{font:10px system-ui,sans-serif;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px}.phase{margin-bottom:42px}.phase>header{margin-bottom:14px;padding:14px 18px;border-radius:18px;background:#1e293b;color:#e2e8f0;display:flex;justify-content:space-between;gap:12px}.phase header b{font-size:23px}.phase header span{font-weight:800}.phase header p{margin:3px 0 0;font-size:12px;color:#94a3b8}.phase header em{font-size:11px;color:#94a3b8;font-style:normal}.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:14px}.stage{overflow:hidden}.stage-head{display:flex;gap:10px;padding:14px 17px 10px;border-bottom:1px solid #dbe3ee}.number{font-size:27px;font-weight:900;min-width:43px}.title{font-weight:850;font-size:14px}.id{font:10px ui-monospace,monospace;color:#94a3b8}.stage-head i{width:10px;height:10px;border-radius:50%;margin-left:auto}.badges{padding:8px 17px;border-bottom:1px solid #dbe3ee;display:flex;flex-wrap:wrap;gap:5px}.badge{font-size:10px;font-weight:800;color:#475569;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:999px;padding:2px 8px}.blue{background:#e0f2fe;color:#0369a1}.yellow{background:#fef3c7;color:#92400e}.hot{background:#ffe4e6;color:#9f1239}.stage-body{padding:13px 17px 18px;display:grid;gap:12px;font-size:12px;color:#334155}.small-label{font-size:9px;font-weight:900;letter-spacing:.16em;color:#94a3b8;margin-bottom:4px}.maps{display:flex;flex-wrap:wrap;gap:12px}.map-grid{display:inline-grid;gap:1px;padding:4px;border:1px solid #cbd5e1;border-radius:8px;background:#e2e8f0}.map-row{display:flex}.cell{width:16px;height:16px;border-radius:2px;display:grid;place-items:center;font:800 8px ui-monospace,monospace}.wall{background:#1e293b}.floor{background:#f8fafc}.item{background:#fbbf24}.cool{background:#38bdf8}.hot{background:#fb7185}.goal{background:#34d399}.map-note{font-size:10px;color:#64748b;margin-top:4px}.hot-program{padding:10px;border:1px solid #fecdd3;background:#fff1f2;border-radius:12px}.hot-program pre{margin:0;white-space:pre-wrap;font:11px/1.55 ui-monospace,monospace;color:#4c0519}.empty{margin:70px auto;padding:30px;border:1px dashed #94a3b8;border-radius:16px;background:#fff;text-align:center;color:#64748b}</style></head><body>',
      '<header class="site-header"><div class="header-inner"><div class="logo">CH<span>aser</span></div><div class="sub">Tutorial Stage Review</div><div class="counter" id="header-count"></div></div></header><nav class="phase-nav" id="phase-nav"></nav><main class="main" id="main"></main>',
      '<script id="review-data" type="application/json">' + json + '</script>',
      '<script>' + script + '<' + '/script>',
      '</body></html>'
    ].join('');
  }
  function exportReview() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([reviewHtml(reviewData())], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stage_review.html';
    anchor.click();
    URL.revokeObjectURL(url);
  }
  setGlobal('reviewHtml', reviewHtml);
  setGlobal('exportReview', exportReview);
  const button = document.getElementById('export-review');
  if (button) button.onclick = exportReview;
})();