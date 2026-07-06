(() => {
  const HOT_ENABLED = (stage) => Boolean(stage?.hotEnabled || stage?.hotBehavior?.enabled);
  const BLOCK_LABELS = {
    chaser_on_turn: '毎ターン', chaser_turn_end: 'ターンを終える',
    chaser_action_walk: '歩く', chaser_action_put: 'ブロックを置く',
    chaser_action_walk_last: '前に進んだ向きで歩く', chaser_action_walk_random: 'どこかに歩く',
    chaser_action_look: '見る', chaser_action_search: 'まっすぐ見る',
    chaser_action_look_store: '広く見た結果を変数に入れる', chaser_action_search_store: 'まっすぐ見た結果を変数に入れる',
    chaser_get_tile: '方向のマス', chaser_is_tile: '方向のマス判定', chaser_get_around: 'まわりの番号',
    chaser_view_get_around: '見た結果の番号', chaser_view_has_tile: '見た結果に指定マスがある', chaser_view_count_tile: '見た結果の指定マス数',
    chaser_discard_value: '結果を使わない', chaser_tile_value: 'マスの種類',
    chaser_state_create: '変数を作る', chaser_state_set: '変数に値を入れる', chaser_state_get: '変数を読む',
    chaser_state_change: '変数を増減', chaser_turn_number: '現在のターン数', chaser_last_direction: '前に進んだ向き', chaser_direction_value: '向き',
    chaser_hot_on_turn: 'HOTの毎ターン', chaser_hot_turn_end: 'HOTのターンを終える',
    chaser_hot_walk: 'HOTが歩く', chaser_hot_walk_last: 'HOTが前に進んだ向きで歩く', chaser_hot_walk_random: 'HOTがどこかに歩く', chaser_hot_put: 'HOTがブロックを置く',
    chaser_hot_is_tile: 'HOTの方向のマス判定', chaser_hot_get_tile: 'HOTの方向のマス',
    controls_if: 'もし / そうでなければ', logic_compare: '比較', logic_operation: 'かつ / または', logic_boolean: '真 / 偽', logic_negate: 'ではない',
    math_number: '数', math_arithmetic: '四則演算', math_modulo: '余り', math_number_property: '数の性質', math_random_int: 'ランダムな整数', math_random_float: 'ランダムな小数',
  };

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function globalValue(name, fallback) {
    try {
      const value = Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)();
      return value === undefined ? fallback : value;
    } catch (_) { return fallback; }
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
      hotProgramXml: HOT_ENABLED(stage) ? String(stage.hotBehavior?.savedBlocklyXml || '') : '',
    };
  }

  function reviewData() {
    const phases = [];
    let no = 1;
    (st.phases || []).forEach((phase) => {
      const stages = (phase.stages || []).filter((stage) => stage?.includeInExport !== false).map((stage) => compactStage(stage, no++));
      if (stages.length) phases.push({
        id: phase.id || '–', name: phase.name || '無題', range: phase.range || '', color: phase.color || '#64748b', bg: phase.bg || '#f1f5f9', desc: phase.desc || '', stages,
      });
    });

    const names = Array.isArray(globalValue('SETS', [])) ? [...globalValue('SETS', [])] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : globalValue('BLOCK_SET_ALLOWED', {});
    const sets = {};
    [...names, ...Object.keys(source || {}).filter((name) => !names.includes(name))].forEach((name) => {
      sets[name] = Array.isArray(source?.[name]) ? [...source[name]] : [];
    });
    return { phases, blockSets: { order: Object.keys(sets), sets } };
  }

  function safeJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  }

  function clientScript() {
    return String.raw`const REVIEW_DATA = JSON.parse(document.getElementById('review-data').textContent);
const NEWLINE = String.fromCharCode(10);
const LABELS = ${JSON.stringify(BLOCK_LABELS)};
const DIRS = {Up:'↑ 上',Down:'↓ 下',Left:'← 左',Right:'→ 右'};
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const color = value => /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#64748b';
const tileClass = value => ({'#':'wall','.':'floor','I':'item','C':'cool','H':'hot','G':'goal'}[value] || 'floor');
const label = type => LABELS[type] || String(type || '不明なブロック');
function mapHtml(map,index){const rows=Array.isArray(map&&map.rows)?map.rows:[];return '<div class="map-box"><div class="small-label">'+esc((map&&map.label)||('マップ '+String.fromCharCode(65+index)))+'</div><div class="map-grid">'+rows.map(row=>'<div class="map-row">'+Array.from(String(row)).map(cell=>'<span class="cell '+tileClass(cell)+'">'+(cell==='.'||cell==='#'?'':esc(cell))+'</span>').join('')+'</div>').join('')+'</div>'+((map&&map.note)?'<div class="map-note">'+esc(map.note)+'</div>':'')+'</div>')}
function hotText(xml){if(!xml)return 'HOTの行動プログラムは未設定です。';try{const doc=new DOMParser().parseFromString(xml,'text/xml');if(doc.querySelector('parsererror'))throw new Error('XML parse error');const blocks=Array.from(doc.querySelectorAll('block'));if(!blocks.length)return 'HOTの行動プログラムは未設定です。';return blocks.map(block=>{const type=block.getAttribute('type')||'';const fields=Array.from(block.querySelectorAll(':scope > field')).map(field=>field.textContent).filter(Boolean);const dir=fields.find(value=>Object.prototype.hasOwnProperty.call(DIRS,value));let text=label(type);if(dir)text+=' '+DIRS[dir];return text;}).join(NEWLINE)}catch(_){return 'HOTの行動プログラムを読み取れませんでした。'}}
function blockSetHtml(){const data=REVIEW_DATA.blockSets||{};const sets=data.sets||{};const order=data.order||Object.keys(sets);return '<section class="panel intro"><h2>ブロックセット一覧</h2><div class="blockset-grid">'+order.map(name=>{const blocks=Array.isArray(sets[name])?sets[name]:[];return '<div class="blockset"><b>'+esc(name)+'</b><span class="count">'+blocks.length+' blocks</span><div class="chips">'+(blocks.length?blocks.map(type=>'<span title="'+esc(type)+'">'+esc(label(type))+'</span>').join(''):'<span>ブロックなし</span>')+'</div></div>'}).join('')+'</div></section>'}
function stageHtml(stage,phase){const badges=['<span class="badge">'+esc(stage.blockSet)+'</span>','<span class="badge">'+esc(stage.variants)+' maps</span>'];if(stage.cond)badges.push('<span class="badge blue">'+esc(stage.cond)+'</span>');if(stage.difficulty)badges.push('<span class="badge yellow">★'+esc(stage.difficulty)+'/15</span>');if(stage.hotEnabled)badges.push('<span class="badge hot">HOT行動</span>');return '<article class="stage"><div class="stage-head"><div class="number">'+String(stage.no).padStart(2,'0')+'</div><div><div class="title">'+esc(stage.title)+'</div><div class="id">'+esc(stage.id)+'</div></div><i style="background:'+color(phase.color)+'"></i></div><div class="badges">'+badges.join('')+'</div><div class="stage-body">'+(stage.goal?'<section><div class="small-label">学習目標</div><div>'+esc(stage.goal)+'</div></section>':'')+(stage.rule?'<section><div class="small-label">ルール / 想定解法</div><div>'+esc(stage.rule)+'</div></section>':'')+(stage.maps&&stage.maps.length?'<section><div class="small-label">マップ</div><div class="maps">'+stage.maps.map(mapHtml).join('')+'</div></section>':'')+(stage.hotEnabled?'<section class="hot-program"><div class="small-label">HOTの行動プログラム</div><pre>'+esc(hotText(stage.hotProgramXml))+'</pre></section>':'')+'</div></article>'}
function render(){const phases=Array.isArray(REVIEW_DATA.phases)?REVIEW_DATA.phases:[];const nav=document.getElementById('phase-nav');const main=document.getElementById('main');const total=phases.reduce((sum,phase)=>sum+(phase.stages||[]).length,0);document.getElementById('header-count').textContent=total+' Stages · '+phases.length+' Groups';if(!phases.length){main.innerHTML='<div class="empty">出力対象のステージがありません。</div>';return}nav.innerHTML=phases.map(phase=>'<a href="#phase-'+esc(phase.id)+'" style="color:'+color(phase.color)+';background:'+esc(phase.bg||'#f1f5f9')+'">'+esc(phase.id)+' · '+esc(phase.name)+'</a>').join('');main.innerHTML=blockSetHtml()+phases.map(phase=>'<section class="phase" id="phase-'+esc(phase.id)+'"><header><div><b>'+esc(phase.id)+'</b> <span>'+esc(phase.name)+'</span>'+((phase.desc)?'<p>'+esc(phase.desc)+'</p>':'')+'</div><em>'+esc(phase.range||String((phase.stages||[]).length)+' Stages')+'</em></header><div class="stage-grid">'+(phase.stages||[]).map(stage=>stageHtml(stage,phase)).join('')+'</div></section>').join('')}
render();`;
  }

  function reviewHtml(data) {
    const json = safeJson(data);
    const script = clientScript();
    return [
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHaser チュートリアル ステージ一覧</title>',
      '<style>:root{--ink:#0f172a;--line:#dbe3ee;--bg:#f5f7fb}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:radial-gradient(700px 400px at 8% 12%,rgba(56,189,248,.18),transparent 65%),radial-gradient(680px 380px at 95% -4%,rgba(251,146,60,.20),transparent 60%),var(--bg);line-height:1.55}.site-header{position:sticky;top:0;z-index:20;background:linear-gradient(120deg,#0f172a,#1e293b);color:#f8fafc;box-shadow:0 4px 20px rgba(15,23,42,.24)}.header-inner,.main,.phase-nav{max-width:1400px;margin:auto;padding-left:24px;padding-right:24px}.header-inner{padding-top:12px;padding-bottom:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}.logo{font-weight:900;letter-spacing:.1em}.logo span{color:#38bdf8}.sub{font-size:11px;letter-spacing:.15em;color:#94a3b8}.counter{margin-left:auto;font-size:11px;font-weight:800;letter-spacing:.12em}.phase-nav{padding-top:16px;display:flex;gap:8px;flex-wrap:wrap}.phase-nav a{text-decoration:none;border:1px solid #cbd5e1;border-radius:999px;padding:5px 12px;font-size:11px;font-weight:800}.main{padding-top:20px;padding-bottom:48px}.panel,.stage{background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 8px 24px rgba(15,23,42,.06)}.intro{padding:18px;margin-bottom:26px}.intro h2{margin:0 0 12px;font-size:17px}.blockset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}.blockset{border:1px solid #dbe4ef;border-radius:13px;padding:11px;background:#f8fafc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.count{margin-left:7px;color:#64748b;font-size:10px}.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chips span{font-family:system-ui,sans-serif;font-size:10px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px}.phase{margin:0 0 42px;scroll-margin-top:76px}.phase>header{margin-bottom:14px;padding:14px 19px;border-radius:18px;background:linear-gradient(120deg,#0f172a,#1e293b);color:#e2e8f0;display:flex;justify-content:space-between;align-items:start;gap:12px}.phase header b{font-size:23px;letter-spacing:.1em}.phase header span{font-size:15px;font-weight:800}.phase header p{margin:3px 0 0;color:#94a3b8;font-size:12px}.phase header em{font-style:normal;font-size:11px;letter-spacing:.1em;color:#94a3b8}.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:15px}.stage{overflow:hidden}.stage-head{display:flex;align-items:start;gap:10px;padding:14px 17px 10px;border-bottom:1px solid var(--line)}.number{font-size:27px;font-weight:950;line-height:1;min-width:43px}.title{font-size:14px;font-weight:850}.id{font:10px ui-monospace,SFMono-Regular,Menlo,monospace;color:#94a3b8;margin-top:2px;overflow-wrap:anywhere}.stage-head i{display:block;width:10px;height:10px;border-radius:50%;margin-left:auto;margin-top:4px}.badges{padding:8px 17px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:5px}.badge{font-size:10px;font-weight:800;color:#475569;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:999px;padding:2px 8px}.badge.blue{background:#e0f2fe;color:#0369a1;border-color:#7dd3fc}.badge.yellow{background:#fef3c7;color:#92400e;border-color:#fcd34d}.badge.hot{background:#ffe4e6;color:#9f1239;border-color:#fda4af}.stage-body{padding:13px 17px 18px;display:grid;gap:12px;font-size:12px;color:#334155}.small-label{font-size:9px;font-weight:900;letter-spacing:.16em;color:#94a3b8;margin-bottom:4px}.maps{display:flex;flex-wrap:wrap;gap:12px}.map-box{max-width:100%}.map-grid{display:inline-grid;gap:1px;padding:4px;border:1px solid #cbd5e1;border-radius:8px;background:#e2e8f0}.map-row{display:flex}.cell{width:16px;height:16px;border-radius:2px;display:grid;place-items:center;font:800 8px ui-monospace,SFMono-Regular,Menlo,monospace}.wall{background:#1e293b}.floor{background:#f8fafc}.item{background:#fbbf24}.cool{background:#38bdf8}.hot{background:#fb7185}.goal{background:#34d399}.map-note{font-size:10px;color:#64748b;margin-top:4px;max-width:280px}.hot-program{padding:10px;border:1px solid #fecdd3;background:#fff1f2;border-radius:12px}.hot-program pre{margin:0;white-space:pre-wrap;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#4c0519}.empty{margin:70px auto;padding:30px;border:1px dashed #94a3b8;border-radius:16px;background:#fff;text-align:center;color:#64748b}@media(max-width:600px){.header-inner,.main,.phase-nav{padding-left:14px;padding-right:14px}.counter{margin-left:0}.stage-grid{grid-template-columns:1fr}.phase header em{display:none}}</style></head><body>',
      '<header class="site-header"><div class="header-inner"><div class="logo">CH<span>aser</span></div><div class="sub">Tutorial Stage Review</div><div class="counter" id="header-count"></div></div></header><nav class="phase-nav" id="phase-nav"></nav><main class="main" id="main"></main>',
      '<script id="review-data" type="application/json">' + json + '</script>',
      '<script>' + script + '<' + '/script>',
      '</body></html>',
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
