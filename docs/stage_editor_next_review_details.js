(() => {
  const HOT_ENABLED = (stage) => Boolean(stage?.hotEnabled || stage?.hotBehavior?.enabled);

  const BLOCK_LABELS = {
    chaser_on_turn: '毎ターン',
    chaser_turn_end: 'ターンを終える',
    chaser_action_walk: '歩く',
    chaser_action_put: 'ブロックを置く',
    chaser_action_walk_last: '前に進んだ向きで歩く',
    chaser_action_walk_random: 'どこかに歩く',
    chaser_action_look: '見る',
    chaser_action_search: 'まっすぐ見る',
    chaser_action_look_store: '広く見た結果を変数に入れる',
    chaser_action_search_store: 'まっすぐ見た結果を変数に入れる',
    chaser_get_tile: '方向のマス',
    chaser_is_tile: '方向のマス判定',
    chaser_get_around: 'まわりの番号',
    chaser_view_get_around: '見た結果の番号',
    chaser_view_has_tile: '見た結果に指定マスがある',
    chaser_view_count_tile: '見た結果の指定マス数',
    chaser_discard_value: '結果を使わない',
    chaser_tile_value: 'マスの種類',
    chaser_state_create: '変数を作る',
    chaser_state_set: '変数に値を入れる',
    chaser_state_get: '変数を読む',
    chaser_state_change: '変数を増減',
    chaser_turn_number: '現在のターン数',
    chaser_last_direction: '前に進んだ向き',
    chaser_direction_value: '向き',
    chaser_hot_on_turn: 'HOTの毎ターン',
    chaser_hot_turn_end: 'HOTのターンを終える',
    chaser_hot_walk: 'HOTが歩く',
    chaser_hot_walk_last: 'HOTが前に進んだ向きで歩く',
    chaser_hot_walk_random: 'HOTがどこかに歩く',
    chaser_hot_put: 'HOTがブロックを置く',
    chaser_hot_is_tile: 'HOTの方向のマス判定',
    chaser_hot_get_tile: 'HOTの方向のマス',
    controls_if: 'もし / そうでなければ',
    logic_compare: '比較',
    logic_operation: 'かつ / または',
    logic_boolean: '真 / 偽',
    logic_negate: 'ではない',
    math_number: '数',
    math_arithmetic: '四則演算',
    math_modulo: '余り',
    math_number_property: '数の性質',
    math_random_int: 'ランダムな整数',
    math_random_float: 'ランダムな小数',
  };

  const DIR = { Up: '↑ 上', Down: '↓ 下', Left: '← 左', Right: '→ 右' };
  const TILE = { 0: '床', 1: 'COOL', 2: 'ブロック', 3: 'アイテム' };

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapedJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function exportedPhases() {
    const phases = clone(st.phases || [])
      .map((phase) => ({ ...phase, stages: (phase.stages || []).filter((stage) => stage?.includeInExport !== false) }))
      .filter((phase) => phase.stages.length > 0);

    let number = 1;
    phases.forEach((phase) => {
      phase.stages.forEach((stage) => {
        stage.no = number;
        const match = String(stage.id || '').match(/^step-\d+-(.+)$/);
        if (match) stage.id = `step-${String(number).padStart(2, '0')}-${match[1]}`;
        number += 1;
      });
    });
    return phases;
  }

  function blockSetPayload() {
    const names = Array.isArray(window.SETS) ? [...window.SETS] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : (window.BLOCK_SET_ALLOWED || {});
    const blockSets = {};
    names.forEach((name) => { blockSets[name] = Array.isArray(source[name]) ? [...source[name]] : []; });
    Object.keys(source || {}).forEach((name) => {
      if (!Object.prototype.hasOwnProperty.call(blockSets, name)) blockSets[name] = Array.isArray(source[name]) ? [...source[name]] : [];
    });
    return { order: names, sets: blockSets };
  }

  function reviewPayload() {
    return {
      version: 3,
      phases: exportedPhases(),
      blockSets: blockSetPayload(),
    };
  }

  function reviewHtml(data) {
    const payload = escapedJson(data);
    return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CHaser チュートリアル ステージ一覧</title>
<style>
:root{--cool:#38bdf8;--hot:#fb7185;--ink:#0f172a;--ink-soft:#334155;--panel:#fff;--border:rgba(15,23,42,.12);--ui:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--display:"Arial Black",var(--ui)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--ui);color:var(--ink);background-color:#f8fafc;background-image:radial-gradient(700px 400px at 8% 12%,rgba(56,189,248,.18),transparent 65%),radial-gradient(680px 380px at 95% -4%,rgba(251,146,60,.20),transparent 60%),linear-gradient(rgba(15,23,42,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.04) 1px,transparent 1px),linear-gradient(180deg,#f8fafc 0%,#f1f5f9 55%,#eef2ff 100%);background-size:auto,auto,26px 26px,26px 26px,auto;min-height:100vh}.site-header{position:sticky;top:0;z-index:20;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border-bottom:1px solid rgba(148,163,184,.2);box-shadow:0 4px 24px rgba(15,23,42,.25)}.header-inner{max-width:1400px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}.header-logo{font-family:var(--display);font-size:20px;font-weight:800;letter-spacing:.1em;color:#f8fafc}.header-logo span{color:var(--cool)}.header-sub{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(148,163,184,.8);margin-left:8px}.header-count{margin-left:auto;background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.3);border-radius:999px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#e2e8f0}.phase-nav{max-width:1400px;margin:0 auto;padding:16px 24px 0;display:flex;gap:8px;flex-wrap:wrap}.phase-tab{padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;border:1px solid transparent;transition:transform .15s,opacity .15s}.phase-tab:hover{transform:translateY(-1px);opacity:.85}.main{max-width:1400px;margin:0 auto;padding:24px}.panel{background:rgba(255,255,255,.97);border:1px solid var(--border);border-radius:22px;box-shadow:0 8px 24px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.7);padding:18px}.summary-panel{margin-bottom:24px}.section-title{margin:0 0 11px;font-family:var(--display);font-size:15px;letter-spacing:.04em}.blockset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.blockset-card{border:1px solid #dbe4ef;border-radius:14px;padding:11px;background:#f8fafc}.blockset-name{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:900;color:#0f172a}.blockset-count{margin-left:7px;font-size:10px;color:#64748b}.block-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.block-chip{font-size:10px;color:#334155;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px}.phase-section{margin-bottom:48px;scroll-margin-top:86px}.phase-header{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px 20px;border-radius:20px;color:#e2e8f0;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border:1px solid rgba(148,163,184,.22)}.phase-label{font-family:var(--display);font-size:24px;font-weight:800;letter-spacing:.12em}.phase-name{font-size:15px;font-weight:600;color:#cbd5e1}.phase-desc{font-size:12px;color:#94a3b8;margin-top:2px}.phase-range{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:.14em;color:rgba(226,232,240,.6);text-transform:uppercase;white-space:nowrap}.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:16px}.stage-card{background:var(--panel);border:1px solid var(--border);border-radius:24px;box-shadow:0 8px 24px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.7);display:flex;flex-direction:column;overflow:hidden}.card-header{padding:14px 18px 10px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--border)}.step-num{font-family:var(--display);font-size:28px;font-weight:800;line-height:1;min-width:42px;color:var(--ink)}.card-title-area{flex:1;min-width:0}.card-title{font-size:14px;font-weight:700;color:var(--ink);line-height:1.35}.card-id{font-size:10px;color:#94a3b8;margin-top:2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.phase-pip{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0}.card-badges{padding:8px 18px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--border)}.badge{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid transparent}.badge--block{background:#f1f5f9;color:#475569;border-color:#cbd5e1}.badge--var{background:#ede9fe;color:#7c3aed;border-color:#c4b5fd}.badge--cond{background:#e0f2fe;color:#0369a1;border-color:#7dd3fc}.badge--difficulty{background:#fef3c7;color:#92400e;border-color:#fcd34d}.badge--hot{background:#ffe4e6;color:#be123c;border-color:#fda4af}.card-body{padding:12px 18px 18px;flex:1;display:flex;flex-direction:column;gap:12px}.field-label{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}.field-value{font-size:12px;color:var(--ink-soft);line-height:1.55;white-space:pre-wrap}.maps-wrap{display:flex;flex-wrap:wrap;gap:12px}.map-label{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}.map-grid{display:inline-grid;gap:1px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;padding:4px}.map-row{display:flex}.cell{width:16px;height:16px;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.c-wall{background:#1e293b}.c-floor{background:#f8fafc}.c-item{background:#fbbf24}.c-cool{background:#38bdf8}.c-hot{background:#fb7185}.c-goal{background:#34d399}.variant-note{font-size:10px;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;padding:6px 10px;margin-top:6px}.hot-program{background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:10px}.hot-program-title{font-size:10px;font-weight:900;letter-spacing:.12em;color:#9f1239;text-transform:uppercase;margin-bottom:6px}.hot-code{margin:0;white-space:pre-wrap;font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#4c0519}.empty{max-width:700px;margin:80px auto;padding:28px;border:1px dashed #94a3b8;border-radius:16px;background:#fff;text-align:center;color:#64748b}.footer{max-width:1400px;margin:0 auto;padding:0 24px 28px;text-align:center;font-size:11px;color:#94a3b8}@media(max-width:600px){.header-inner,.phase-nav,.main{padding-left:16px;padding-right:16px}.header-count{margin-left:0}.stage-grid{grid-template-columns:1fr}.main{padding-top:16px}.phase-range{display:none}}
</style>
</head>
<body>
<header class="site-header"><div class="header-inner"><div><span class="header-logo">CH<span>aser</span></span><span class="header-sub">Tutorial Stage Review</span></div><div class="header-count" id="header-count"></div></div></header>
<nav class="phase-nav" id="phase-nav" aria-label="フェーズ"></nav>
<main class="main" id="main"></main>
<footer class="footer">CHaser Tutorial Stage Review</footer>
<script>
const REVIEW_DATA=${payload};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeColor=value=>/^#[0-9a-f]{3,8}$/i.test(String(value||''))?value:'#64748b';
const tileClass=cell=>({ '#':'c-wall','.':'c-floor','I':'c-item','C':'c-cool','H':'c-hot','G':'c-goal' }[cell]||'c-floor');
const LABELS=${escapedJson(BLOCK_LABELS)};
const DIRS=${escapedJson(DIR)};
const TILES=${escapedJson(TILE)};
function label(type){return LABELS[type]||String(type||'不明なブロック')}
function field(block,name){const node=[...block.children].find(child=>child.tagName==='field'&&child.getAttribute('name')===name);return node?node.textContent:''}
function childBlock(node,name){const input=[...node.children].find(child=>(child.tagName==='value'||child.tagName==='statement')&&child.getAttribute('name')===name);return input?.querySelector(':scope > block')||null}
function describeValue(block){if(!block)return '';const type=block.getAttribute('type');if(type==='chaser_hot_is_tile')return 'HOTの '+(DIRS[field(block,'DIR')]||field(block,'DIR'))+' のマスは '+(TILES[field(block,'TILE')]||field(block,'TILE'))+' ?';if(type==='chaser_hot_get_tile')return 'HOTの '+(DIRS[field(block,'DIR')]||field(block,'DIR'))+' のマス';if(type==='logic_boolean')return field(block,'BOOL')==='TRUE'?'真':'偽';if(type==='math_number')return field(block,'NUM')||'0';if(type==='logic_compare'){const op={EQ:'=',NEQ:'≠',LT:'＜',LTE:'≦',GT:'＞',GTE:'≧'}[field(block,'OP')]||field(block,'OP');return (describeValue(childBlock(block,'A'))||'?')+' '+op+' '+(describeValue(childBlock(block,'B'))||'?')}if(type==='logic_operation'){const op=field(block,'OP')==='AND'?'かつ':'または';return (describeValue(childBlock(block,'A'))||'?')+' '+op+' '+(describeValue(childBlock(block,'B'))||'?')}if(type==='logic_negate')return 'ではない '+(describeValue(childBlock(block,'BOOL'))||'?');return label(type)}
function describeBlock(block,depth=0){if(!block)return [];const type=block.getAttribute('type');const indent='  '.repeat(depth);let line=label(type);if(type==='chaser_hot_walk'||type==='chaser_hot_put')line+=' '+(DIRS[field(block,'DIR')]||field(block,'DIR'));if(type==='chaser_hot_walk_last')line+='（最初は '+(DIRS[field(block,'DIR')]||field(block,'DIR'))+'）';if(type==='controls_if'){line+=' '+(describeValue(childBlock(block,'IF0'))||'?');const body=childBlock(block,'DO0');const elseBody=childBlock(block,'ELSE');const lines=[indent+line];if(body)lines.push(...describeBlock(body,depth+1));if(elseBody){lines.push(indent+'そうでなければ');lines.push(...describeBlock(elseBody,depth+1));}const next=[...block.children].find(child=>child.tagName==='next')?.querySelector(':scope > block');return next?[...lines,...describeBlock(next,depth)]:lines}const lines=[indent+line];const statement=[...block.children].find(child=>child.tagName==='statement'&&child.getAttribute('name')==='DO');if(statement?.querySelector(':scope > block'))lines.push(...describeBlock(statement.querySelector(':scope > block'),depth+1));const next=[...block.children].find(child=>child.tagName==='next')?.querySelector(':scope > block');return next?[...lines,...describeBlock(next,depth)]:lines}
function hotSummary(stage){const xml=stage?.hotBehavior?.savedBlocklyXml;if(!xml)return 'HOTの行動プログラムは未設定です。';try{const doc=new DOMParser().parseFromString(xml,'text/xml');const root=[...doc.querySelectorAll('xml > block')].find(block=>block.getAttribute('type')==='chaser_hot_on_turn')||doc.querySelector('xml > block');if(!root)return 'HOTの行動プログラムは未設定です。';return describeBlock(root).join('\n')}catch(_){return 'HOTの行動プログラムを読み取れませんでした。'}}
function renderMap(map,index){const rows=Array.isArray(map?.rows)?map.rows:[];return '<div><div class="map-label">'+esc(map?.label||'マップ '+String.fromCharCode(65+index))+'</div><div class="map-grid">'+rows.map(row=>'<div class="map-row">'+Array.from(String(row)).map(cell=>'<span class="cell '+tileClass(cell)+'">'+(cell==='.'?'':esc(cell))+'</span>').join('')+'</div>').join('')+'</div>'+(map?.note?'<div class="variant-note">'+esc(map.note)+'</div>':'')+'</div>'}
function badge(text,cls){return '<span class="badge '+cls+'">'+esc(text)+'</span>'}
function renderHot(stage){if(!(stage.hotEnabled||stage.hotBehavior?.enabled))return '';return '<div class="hot-program"><div class="hot-program-title">HOTの行動プログラム</div><pre class="hot-code">'+esc(hotSummary(stage))+'</pre></div>'}
function renderStage(stage,phase){const maps=Array.isArray(stage.maps)?stage.maps:[];const badges=[badge(stage.blockSet||'BLOCK','badge--block')];if(maps.length>1||Number(stage.variants)>1)badges.push(badge(String(stage.variants||maps.length)+' maps','badge--var'));if(stage.cond)badges.push(badge(stage.cond,'badge--cond'));if(Number(stage.difficulty)>0)badges.push(badge('★'+String(stage.difficulty)+'/15','badge--difficulty'));if(stage.hotEnabled||stage.hotBehavior?.enabled)badges.push(badge('HOT行動','badge--hot'));return '<article class="stage-card"><div class="card-header"><div class="step-num">'+String(stage.no??'–').padStart(2,'0')+'</div><div class="card-title-area"><div class="card-title">'+esc(stage.title||'無題のステージ')+'</div><div class="card-id">'+esc(stage.id||'')+'</div></div><span class="phase-pip" style="background:'+safeColor(phase.color)+'"></span></div><div class="card-badges">'+badges.join('')+'</div><div class="card-body">'+(stage.goal?'<div><div class="field-label">学習目標</div><div class="field-value">'+esc(stage.goal)+'</div></div>':'')+(stage.rule?'<div><div class="field-label">ルール / 想定解法</div><div class="field-value">'+esc(stage.rule)+'</div></div>':'')+(maps.length?'<div><div class="field-label">マップ</div><div class="maps-wrap">'+maps.map(renderMap).join('')+'</div></div>':'')+renderHot(stage)+'</div></article>'}
function renderBlockSets(){const data=REVIEW_DATA.blockSets||{};const sets=data.sets||{};const order=[...(data.order||[]),...Object.keys(sets).filter(name=>!(data.order||[]).includes(name))];if(!order.length)return '';return '<section class="panel summary-panel"><h2 class="section-title">ブロックセット一覧</h2><div class="blockset-grid">'+order.map(name=>{const blocks=Array.isArray(sets[name])?sets[name]:[];return '<div class="blockset-card"><div><span class="blockset-name">'+esc(name)+'</span><span class="blockset-count">'+blocks.length+' blocks</span></div><div class="block-chips">'+(blocks.length?blocks.map(type=>'<span class="block-chip" title="'+esc(type)+'">'+esc(label(type))+'</span>').join(''):'<span class="block-chip">ブロックなし</span>')+'</div></div>'}).join('')+'</div></section>'}
function render(){const phases=Array.isArray(REVIEW_DATA.phases)?REVIEW_DATA.phases:[];const phaseNav=document.getElementById('phase-nav'),main=document.getElementById('main');const count=phases.reduce((sum,phase)=>sum+(Array.isArray(phase.stages)?phase.stages.length:0),0);document.getElementById('header-count').textContent=count+' Stages · '+phases.length+' Groups';if(!phases.length){main.innerHTML='<div class="empty">出力対象のステージがありません。</div>';return}phaseNav.innerHTML=phases.map(phase=>'<a class="phase-tab" href="#phase-'+esc(phase.id)+'" style="color:'+safeColor(phase.color)+';background:'+String(phase.bg||'#f1f5f9')+';border-color:'+safeColor(phase.color)+'33">'+esc(phase.id)+' · '+esc(phase.name||'無題')+'</a>').join('');main.innerHTML=renderBlockSets()+phases.map(phase=>'<section class="phase-section" id="phase-'+esc(phase.id)+'"><div class="phase-header"><div><div><span class="phase-label">'+esc(phase.id||'–')+'</span> <span class="phase-name">'+esc(phase.name||'無題')+'</span></div>'+(phase.desc?'<div class="phase-desc">'+esc(phase.desc)+'</div>':'')+'</div><div class="phase-range">'+esc(phase.range||String((phase.stages||[]).length)+' Stages')+'</div></div><div class="stage-grid">'+(phase.stages||[]).map(stage=>renderStage(stage,phase)).join('')+'</div></section>').join('')}
render();
<\/script>
</body>
</html>`;
  }

  function exportReviewWithDetails() {
    if (typeof saveXml === 'function') saveXml();
    const text = reviewHtml(reviewPayload());
    const blob = new Blob([text], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stage_review.html';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  setGlobal('reviewHtml', reviewHtml);
  setGlobal('exportReview', exportReviewWithDetails);
  const button = document.getElementById('export-review');
  if (button) button.onclick = exportReviewWithDetails;
})();
