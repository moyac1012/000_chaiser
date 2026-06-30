(() => {
  const STANDARD_SETS = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];
  const META_KEY = `${STORAGE}:blockSetMeta`;
  const DEFAULT_SETS = JSON.parse(JSON.stringify(BLOCK_SET_ALLOWED));
  const CATALOG = [
    { title: 'スタート・行動', blocks: [
      ['chaser_on_turn', '毎ターン'], ['chaser_action_walk', '歩く'], ['chaser_action_put', 'ブロックを置く'],
      ['chaser_action_walk_last', '前に進んだ向きで歩く'], ['chaser_action_walk_random', 'どこかに歩く'],
      ['chaser_action_look', '見る'], ['chaser_action_search', 'まっすぐ見る'],
      ['chaser_action_look_store', '広く見た結果を変数に入れる'], ['chaser_action_search_store', 'まっすぐ見た結果を変数に入れる'],
      ['chaser_turn_end', 'ターンを終える'],
    ] },
    { title: 'まわりを見る', blocks: [
      ['chaser_get_tile', '方向のマス'], ['chaser_is_tile', '方向のマス判定'], ['chaser_get_around', 'まわりの番号'],
      ['chaser_view_get_around', '見た結果の番号'], ['chaser_view_has_tile', '見た結果に指定マスがある'],
      ['chaser_view_count_tile', '見た結果の指定マス数'], ['chaser_discard_value', '結果を使わない'], ['chaser_tile_value', 'マスの種類'],
    ] },
    { title: '変数・状態', blocks: [
      ['chaser_state_create', '変数を作る'], ['chaser_state_set', '変数に値を入れる'], ['chaser_state_get', '変数を読む'],
      ['chaser_state_change', '変数を増減'], ['chaser_turn_number', '現在のターン数'], ['chaser_last_direction', '前に進んだ向き'], ['chaser_direction_value', '向き'],
    ] },
    { title: '条件・論理', blocks: [
      ['controls_if', 'もし / そうでなければ'], ['logic_compare', '比較'], ['logic_operation', 'かつ / または'], ['logic_boolean', '真 / 偽'], ['logic_negate', 'ではない'],
    ] },
    { title: '数', blocks: [
      ['math_number', '数'], ['math_arithmetic', '四則演算'], ['math_modulo', '余り'], ['math_number_property', '数の性質'], ['math_random_int', 'ランダムな整数'], ['math_random_float', 'ランダムな小数'],
    ] },
  ];
  const ALL_TYPES = CATALOG.flatMap((group) => group.blocks.map(([type]) => type));

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }
  function replaceGlobal(name, value) {
    setGlobal(name, value);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function toast(text) { if (typeof msg === 'function') msg(text); }
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeMeta(meta) { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
  function normalizeName(value) { return String(value || '').trim().replace(/\s+/g, '_'); }
  function validName(name, before) {
    if (!name) return 'ブロックセット名は空にできません';
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'ブロックセット名は半角英数字・_・- のみ使えます';
    if (name !== before && SETS.includes(name)) return '同じ名前のブロックセットが既にあります';
    return '';
  }
  function normalizeAllowed(list) {
    const used = new Set();
    return (Array.isArray(list) ? list : []).filter((type) => {
      if (type === 'chaser_on_start' || !ALL_TYPES.includes(type) || used.has(type)) return false;
      used.add(type);
      return true;
    });
  }

  function setState(source, order, deleted) {
    const input = source && typeof source === 'object' ? source : {};
    const removed = new Set(Array.isArray(deleted) ? deleted : []);
    const hasDefinition = Object.keys(input).length > 0 || (Array.isArray(order) && order.length > 0);
    const names = [], used = new Set();
    const add = (name) => {
      if (!name || used.has(name) || removed.has(name)) return;
      used.add(name); names.push(name);
    };
    if (hasDefinition) {
      (Array.isArray(order) ? order : []).forEach(add);
      Object.keys(input).forEach(add);
    } else {
      STANDARD_SETS.forEach(add);
      SETS.forEach(add);
    }
    if (!names.length) names.push(STANDARD_SETS.find((name) => !removed.has(name)) || 'BASIC');

    const sets = {};
    names.forEach((name) => {
      const fallback = DEFAULT_SETS[name] || BLOCK_SET_ALLOWED[name] || [];
      sets[name] = normalizeAllowed(input[name] == null ? fallback : input[name]);
    });
    SETS.splice(0, SETS.length, ...names);
    Object.keys(BLOCK_SET_ALLOWED).forEach((name) => delete BLOCK_SET_ALLOWED[name]);
    names.forEach((name) => { BLOCK_SET_ALLOWED[name] = [...sets[name]]; });
    st.blockSets = sets;
    st.blockSetOrder = [...names];
    st.deletedBlockSets = [...removed];
    return sets;
  }

  function currentSets() {
    if (!st.blockSets) {
      const meta = readMeta();
      setState(meta.blockSets, meta.blockSetOrder, meta.deletedBlockSets);
    }
    return st.blockSets;
  }

  function ensureStageSets() {
    const sets = currentSets();
    const fallback = SETS[0] || 'BASIC';
    if (!SETS.length) {
      SETS.push(fallback);
      sets[fallback] = [];
      BLOCK_SET_ALLOWED[fallback] = [];
    }
    (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => {
      if (!SETS.includes(stage.blockSet)) {
        stage.blockSet = fallback;
      }
    }));
  }

  function payload() {
    ensureStageSets();
    return {
      version: 2,
      blockSets: clone(currentSets()),
      blockSetOrder: [...SETS],
      deletedBlockSets: [...(st.deletedBlockSets || [])],
      phases: st.phases || [],
    };
  }

  function saveAll() {
    const data = payload();
    writeMeta({ blockSets: data.blockSets, blockSetOrder: data.blockSetOrder, deletedBlockSets: data.deletedBlockSets });
    localStorage.setItem(STORAGE, JSON.stringify(data));
  }

  function downloadJson() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function refreshWorkspace() {
    const stage = curStage();
    if (st.ws && stage && typeof toolbox === 'function') st.ws.updateToolbox(toolbox(stage.blockSet));
  }

  function replacementFor(name) {
    if (name !== 'BASIC' && SETS.includes('BASIC')) return 'BASIC';
    const i = SETS.indexOf(name);
    return SETS[i + 1] || SETS[i - 1] || null;
  }
  function replaceSetOnStages(before, after) {
    (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => {
      if (stage.blockSet === before) stage.blockSet = after;
    }));
  }
  function countSetUsage(name) {
    return (st.phases || []).reduce((sum, phase) => sum + (phase.stages || []).filter((stage) => stage.blockSet === name).length, 0);
  }

  function addBlockSet() {
    const source = st.blockSetEdit && SETS.includes(st.blockSetEdit) ? st.blockSetEdit : SETS[0];
    let name = prompt('新しいブロックセット名を入力してください（例: LOOP）', '');
    if (name == null) return;
    name = normalizeName(name);
    const error = validName(name);
    if (error) return alert(error);
    const copy = confirm(`現在の ${source} のブロック構成をコピーして作成しますか？\nキャンセルすると空のセットとして作成します。`);
    const sets = currentSets();
    SETS.push(name);
    sets[name] = copy ? [...(sets[source] || [])] : [];
    BLOCK_SET_ALLOWED[name] = [...sets[name]];
    st.deletedBlockSets = (st.deletedBlockSets || []).filter((item) => item !== name);
    st.blockSetEdit = name;
    saveAll();
    renderMain();
    toast('ブロックセットを追加しました');
  }

  function renameBlockSet() {
    const before = st.blockSetEdit;
    if (!before || !SETS.includes(before)) return;
    let name = prompt('新しいブロックセット名を入力してください', before);
    if (name == null) return;
    name = normalizeName(name);
    const error = validName(name, before);
    if (error) return alert(error);
    if (name === before) return;
    const i = SETS.indexOf(before);
    SETS[i] = name;
    const sets = currentSets();
    sets[name] = [...(sets[before] || [])];
    delete sets[before];
    BLOCK_SET_ALLOWED[name] = [...sets[name]];
    delete BLOCK_SET_ALLOWED[before];
    replaceSetOnStages(before, name);
    st.deletedBlockSets = (st.deletedBlockSets || []).filter((item) => item !== name);
    st.blockSetEdit = name;
    saveAll();
    render();
    toast('ブロックセット名を変更しました');
  }

  function deleteBlockSet() {
    const name = st.blockSetEdit;
    if (!name || !SETS.includes(name)) return;
    if (SETS.length <= 1) return alert('最後のブロックセットは削除できません');
    const replacement = replacementFor(name);
    const count = countSetUsage(name);
    const message = count
      ? `ブロックセット「${name}」を削除しますか？\n\n使用中の ${count} ステージは「${replacement}」へ変更されます。`
      : `ブロックセット「${name}」を削除しますか？\n\nステージでは使用されていません。`;
    if (!confirm(message)) return;
    SETS.splice(SETS.indexOf(name), 1);
    delete currentSets()[name];
    delete BLOCK_SET_ALLOWED[name];
    replaceSetOnStages(name, replacement);
    st.deletedBlockSets = [...new Set([...(st.deletedBlockSets || []), name])];
    st.blockSetEdit = replacement;
    saveAll();
    render();
    toast('ブロックセットを削除しました');
  }

  function moveBlockSet(direction) {
    const i = SETS.indexOf(st.blockSetEdit);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= SETS.length) return;
    [SETS[i], SETS[target]] = [SETS[target], SETS[i]];
    st.blockSetOrder = [...SETS];
    saveAll();
    renderMain();
    toast('ブロックセットの順序を変更しました');
  }

  function renderBlockSetTab() {
    const body = document.getElementById('body');
    if (!body) return;
    const current = curStage();
    const active = SETS.includes(st.blockSetEdit) ? st.blockSetEdit : (SETS.includes(current?.blockSet) ? current.blockSet : SETS[0]);
    st.blockSetEdit = active;
    const allowed = new Set(currentSets()[active] || []);
    const i = SETS.indexOf(active);
    body.innerHTML = `<div class="panel"><div class="grid"><div class="field"><label>編集するブロックセット</label><select id="bs-select">${SETS.map((name) => `<option value="${name}" ${name === active ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div class="field"><label>ブロックセット操作</label><div class="controls" style="margin:0"><button class="btn primary" id="bs-add">＋ 追加</button><button class="btn" id="bs-rename">名前変更</button><button class="btn danger" id="bs-delete" ${SETS.length <= 1 ? 'disabled' : ''}>削除</button><button class="btn" id="bs-up" ${i <= 0 ? 'disabled' : ''}>▲ 上へ</button><button class="btn" id="bs-down" ${i >= SETS.length - 1 ? 'disabled' : ''}>▼ 下へ</button></div></div></div><div class="controls"><button class="btn" id="bs-all">すべて選択</button><button class="btn" id="bs-none">すべて外す</button><button class="btn warn" id="bs-apply">現在ステージに適用</button></div><div class="hint">削除時は使用中ステージを代替セットへ変更します。並び順はステージ編集の選択肢とJSONの <span class="mono">blockSetOrder</span> に保存されます。</div></div><div class="grid" style="margin-top:12px">${CATALOG.map((group) => `<div class="panel"><div class="section" style="margin-top:0">${group.title}</div>${group.blocks.map(([type, label]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px"><input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}><span><b>${label}</b><br><span class="hint mono">${type}</span></span></label>`).join('')}</div>`).join('')}</div>`;
    document.getElementById('bs-select').onchange = (event) => { st.blockSetEdit = event.target.value; renderBlockSetTab(); };
    document.getElementById('bs-add').onclick = addBlockSet;
    document.getElementById('bs-rename').onclick = renameBlockSet;
    document.getElementById('bs-delete').onclick = deleteBlockSet;
    document.getElementById('bs-up').onclick = () => moveBlockSet(-1);
    document.getElementById('bs-down').onclick = () => moveBlockSet(1);
    document.getElementById('bs-all').onclick = () => { currentSets()[active] = [...ALL_TYPES]; BLOCK_SET_ALLOWED[active] = [...ALL_TYPES]; saveAll(); refreshWorkspace(); renderBlockSetTab(); };
    document.getElementById('bs-none').onclick = () => { currentSets()[active] = []; BLOCK_SET_ALLOWED[active] = []; saveAll(); refreshWorkspace(); renderBlockSetTab(); };
    document.getElementById('bs-apply').onclick = () => { const stage = curStage(); if (!stage) return; stage.blockSet = active; saveAll(); render(); toast('現在のステージに適用しました'); };
    document.querySelectorAll('.bs-block').forEach((checkbox) => { checkbox.onchange = () => { currentSets()[active] = normalizeAllowed([...document.querySelectorAll('.bs-block:checked')].map((input) => input.value)); BLOCK_SET_ALLOWED[active] = [...currentSets()[active]]; saveAll(); refreshWorkspace(); }; });
  }

  function moveGroup(groupId, direction) {
    const i = st.phases.findIndex((phase) => phase.id === groupId);
    const target = i + direction;
    if (i < 0 || target < 0 || target >= st.phases.length) return;
    const selected = curStage();
    [st.phases[i], st.phases[target]] = [st.phases[target], st.phases[i]];
    if (selected && typeof selectByStageRef === 'function') selectByStageRef(selected);
    renumberAll(); saveAll(); render(); toast('グループの順序を変更しました');
  }

  function moveStageToGroup(targetId) {
    const source = curPhase(), stage = curStage();
    const target = (st.phases || []).find((phase) => phase.id === targetId);
    if (!source || !stage || !target) return;
    if (source.id === target.id) return toast('現在と同じグループです');
    if (typeof disposeBlockly === 'function') disposeBlockly();
    const sourceIndex = source.stages.indexOf(stage);
    if (sourceIndex < 0) return;
    source.stages.splice(sourceIndex, 1);
    target.stages.push(stage);
    st.phase = target.id;
    st.idx = target.stages.length - 1;
    st.map = 0; st.play = null; st.bot = null; st.stageMoveTarget = target.id;
    renumberAll(); saveAll(); render();
    toast(`ステージを「${target.id} · ${target.name}」の末尾へ移動しました`);
  }

  function renderSideWithControls() {
    const side = document.getElementById('side');
    if (!st.phases.length) { side.innerHTML = '<div class=empty>JSONを読み込んでください</div>'; return; }
    const source = curPhase(), stage = curStage();
    const destinations = st.phases.filter((phase) => phase.id !== source?.id);
    if (!destinations.some((phase) => phase.id === st.stageMoveTarget)) st.stageMoveTarget = destinations[0]?.id || '';
    let html = '<div class=section>グループ／ステージ</div>';
    html += `<div class="panel" style="padding:10px;margin:0 0 12px"><div class="field" style="margin:0 0 7px"><label>選択中のステージをグループへ移動</label><div class="hint" style="margin-bottom:5px">${stage ? `${String(stage.no).padStart(2, '0')} ${esc(stage.title)}` : 'ステージ未選択'}</div><select id="move-stage-target" ${destinations.length ? '' : 'disabled'}>${destinations.map((phase) => `<option value="${esc(phase.id)}" ${phase.id === st.stageMoveTarget ? 'selected' : ''}>${esc(phase.id)} · ${esc(phase.name)}</option>`).join('')}</select></div><button class="side-add" id="move-stage-button" ${stage && destinations.length ? '' : 'disabled'}>→ 選択したグループへ移動</button><div class="hint">移動先グループの末尾に追加します。</div></div>`;
    st.phases.forEach((phase, phaseIndex) => {
      html += `<div class=phase><div class=ph><span class=ph-title>${esc(phase.id)} · ${esc(phase.name)}</span><span class=ph-count>${phase.stages.length}</span><span class=ph-actions><button class=side-mini data-act=move-phase-up data-ph='${esc(phase.id)}' title='グループを上へ移動' ${phaseIndex === 0 ? 'disabled' : ''}>▲</button><button class=side-mini data-act=move-phase-down data-ph='${esc(phase.id)}' title='グループを下へ移動' ${phaseIndex === st.phases.length - 1 ? 'disabled' : ''}>▼</button><button class=side-mini data-act=edit-phase data-ph='${esc(phase.id)}' title='グループ名変更'>名</button><button class=side-mini data-act=rename-phase-id data-ph='${esc(phase.id)}' title='グループID変更'>ID</button><button class=side-mini data-act=delete-phase data-ph='${esc(phase.id)}' title='グループ削除'>×</button></span></div>`;
      phase.stages.forEach((item, index) => { html += `<div class='st ${phase.id === st.phase && index === st.idx ? 'active' : ''}' data-act=sel data-ph='${esc(phase.id)}' data-i='${index}'><span class=st-no>${String(item.no).padStart(2, '0')}</span><span class=st-title>${esc(item.title)}</span><span class=st-actions><button class=side-mini data-act=move-up data-ph='${esc(phase.id)}' data-i='${index}' title='上へ'>▲</button><button class=side-mini data-act=move-down data-ph='${esc(phase.id)}' data-i='${index}' title='下へ'>▼</button><button class=side-mini data-act=copy-stage data-ph='${esc(phase.id)}' data-i='${index}' title='複製'>C</button><button class=side-mini data-act=delete-stage data-ph='${esc(phase.id)}' data-i='${index}' title='削除'>×</button></span></div>`; });
      html += `<button class=side-add data-act=add-stage data-ph='${esc(phase.id)}'>＋ ステージ追加</button></div>`;
    });
    html += '<button class=side-add data-act=add-phase>＋ グループ追加</button>';
    side.innerHTML = html;
    side.querySelectorAll('[data-act]').forEach((element) => { element.onclick = (event) => { event.stopPropagation(); handleSideAction(element.dataset); }; });
    const select = document.getElementById('move-stage-target');
    if (select) select.onchange = () => { st.stageMoveTarget = select.value; };
    const moveButton = document.getElementById('move-stage-button');
    if (moveButton) moveButton.onclick = () => moveStageToGroup(select?.value || st.stageMoveTarget);
  }

  const baseAction = window.handleSideAction || handleSideAction;
  replaceGlobal('handleSideAction', function handleSideActionWithExtras(data) {
    if (data.act === 'move-phase-up') return moveGroup(data.ph, -1);
    if (data.act === 'move-phase-down') return moveGroup(data.ph, 1);
    return baseAction(data);
  });
  replaceGlobal('renderSide', renderSideWithControls);

  const baseRenderMain = window.renderMain || renderMain;
  replaceGlobal('renderMain', function renderMainWithExtras() {
    if (st.tab !== 'blocksets') return baseRenderMain();
    const stage = curStage(), main = document.getElementById('main');
    if (!stage) { main.innerHTML = '<div class=empty>JSONを読み込んでください</div>'; return; }
    main.innerHTML = `<div class="tabs">${TABS.map(([id, label]) => `<div class="tab ${st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id="body"></div>`;
    main.querySelectorAll('.tab').forEach((tab) => { tab.onclick = () => { if (st.tab === 'play' && typeof saveXml === 'function') saveXml(); if (typeof disposeBlockly === 'function') disposeBlockly(); st.tab = tab.dataset.tab; renderMain(); }; });
    renderBlockSetTab();
  });

  const baseLoadObj = window.loadObj || loadObj;
  replaceGlobal('loadObj', function loadObjWithExtras(obj) {
    const importedSets = obj && obj.blockSets && typeof obj.blockSets === 'object' ? obj.blockSets : null;
    const meta = readMeta();
    const deleted = Array.isArray(obj?.deletedBlockSets) ? obj.deletedBlockSets : (importedSets ? STANDARD_SETS.filter((name) => !Object.prototype.hasOwnProperty.call(importedSets, name)) : meta.deletedBlockSets);
    if (importedSets) setState(importedSets, obj.blockSetOrder, deleted);
    baseLoadObj(obj);
    if (importedSets) setState(importedSets, obj.blockSetOrder, deleted); else setState(meta.blockSets, meta.blockSetOrder, meta.deletedBlockSets);
    ensureStageSets(); saveAll(); render();
  });

  replaceGlobal('saveLocal', saveAll);
  replaceGlobal('saveJson', downloadJson);
  if (!TABS.some(([id]) => id === 'blocksets')) TABS.push(['blocksets', 'ブロックセット']);

  const meta = readMeta();
  setState(meta.blockSets, meta.blockSetOrder, meta.deletedBlockSets);
  ensureStageSets();
  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = downloadJson;
  render();

  const conditionScript = document.createElement('script');
  conditionScript.src = './stage_editor_next_conditions.js';
  conditionScript.async = false;
  document.body.appendChild(conditionScript);
})();
