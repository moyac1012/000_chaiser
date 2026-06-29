(() => {
  const STANDARD_SET_NAMES = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];
  const DELETED_KEY = `${STORAGE}:deletedBlockSets`;
  const DEFAULT_BLOCK_SETS = JSON.parse(JSON.stringify(BLOCK_SET_ALLOWED));
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

  function replaceGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toast(text) {
    if (typeof msg === 'function') msg(text);
  }

  function readDeleted() {
    try {
      const stored = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      return new Set(Array.isArray(stored) ? stored.filter((name) => typeof name === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeDeleted(names) {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...names]));
  }

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, '_');
  }

  function validateName(name, before) {
    if (!name) return 'ブロックセット名は空にできません';
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return 'ブロックセット名は半角英数字・_・- のみ使えます';
    if (name !== before && SETS.includes(name)) return '同じ名前のブロックセットが既にあります';
    return '';
  }

  function normalizeAllowed(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((type) => {
      if (type === 'chaser_on_start' || !ALL_TYPES.includes(type) || seen.has(type)) return false;
      seen.add(type);
      return true;
    });
  }

  function setNamesFrom(source, order, deleted) {
    const names = [];
    const seen = new Set();
    const append = (name) => {
      if (!name || seen.has(name) || deleted.has(name)) return;
      seen.add(name);
      names.push(name);
    };
    const hasSavedDefinition = Object.keys(source || {}).length > 0 || (Array.isArray(order) && order.length > 0);
    if (hasSavedDefinition) {
      (Array.isArray(order) ? order : []).forEach(append);
      Object.keys(source || {}).forEach(append);
    } else {
      STANDARD_SET_NAMES.forEach(append);
      SETS.forEach(append);
    }
    return names;
  }

  function syncBlockSets(source, order, deleted = readDeleted()) {
    const input = source && typeof source === 'object' ? source : {};
    const names = setNamesFrom(input, order, deleted);
    if (!names.length) {
      const fallback = STANDARD_SET_NAMES.find((name) => !deleted.has(name)) || 'BASIC';
      names.push(fallback);
    }
    SETS.splice(0, SETS.length, ...names);
    const result = {};
    names.forEach((name) => {
      const fallback = DEFAULT_BLOCK_SETS[name] || BLOCK_SET_ALLOWED[name] || [];
      result[name] = normalizeAllowed(input[name] == null ? fallback : input[name]);
      BLOCK_SET_ALLOWED[name] = [...result[name]];
    });
    Object.keys(BLOCK_SET_ALLOWED).forEach((name) => {
      if (!names.includes(name)) delete BLOCK_SET_ALLOWED[name];
    });
    st.blockSets = result;
    st.blockSetOrder = [...names];
    return result;
  }

  function currentBlockSets() {
    if (!st.blockSets) {
      let loaded = {};
      try { loaded = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) {}
      syncBlockSets(loaded.blockSets, loaded.blockSetOrder);
    }
    return st.blockSets;
  }

  function replacementFor(name) {
    if (name !== 'BASIC' && SETS.includes('BASIC')) return 'BASIC';
    const index = SETS.indexOf(name);
    return SETS[index + 1] || SETS[index - 1] || null;
  }

  function replaceStageSet(oldName, nextName) {
    (st.phases || []).forEach((phase) => {
      (phase.stages || []).forEach((stage) => {
        if (stage.blockSet === oldName) stage.blockSet = nextName;
      });
    });
  }

  function usageCount(name) {
    return (st.phases || []).reduce((total, phase) => total + (phase.stages || []).filter((stage) => stage.blockSet === name).length, 0);
  }

  function payload() {
    return {
      version: 2,
      blockSets: clone(currentBlockSets()),
      blockSetOrder: [...SETS],
      deletedBlockSets: [...readDeleted()],
      phases: st.phases || [],
    };
  }

  function saveAll() {
    localStorage.setItem(STORAGE, JSON.stringify(payload()));
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

  function refreshCurrentWorkspace() {
    const stage = curStage();
    if (st.ws && stage && typeof toolbox === 'function') st.ws.updateToolbox(toolbox(stage.blockSet));
  }

  function addBlockSet() {
    const sourceName = st.blockSetEdit && SETS.includes(st.blockSetEdit) ? st.blockSetEdit : SETS[0];
    let name = prompt('新しいブロックセット名を入力してください（例: LOOP）', '');
    if (name == null) return;
    name = normalizeName(name);
    const error = validateName(name);
    if (error) return alert(error);
    const copySource = confirm(`現在の ${sourceName} のブロック構成をコピーして作成しますか？\nキャンセルすると空のセットとして作成します。`);

    const deleted = readDeleted();
    deleted.delete(name);
    writeDeleted(deleted);
    const sets = currentBlockSets();
    SETS.push(name);
    sets[name] = copySource ? [...(sets[sourceName] || [])] : [];
    BLOCK_SET_ALLOWED[name] = [...sets[name]];
    st.blockSetEdit = name;
    st.blockSetOrder = [...SETS];
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
    const error = validateName(name, before);
    if (error) return alert(error);
    if (name === before) return;

    const index = SETS.indexOf(before);
    SETS[index] = name;
    const sets = currentBlockSets();
    sets[name] = [...(sets[before] || [])];
    delete sets[before];
    BLOCK_SET_ALLOWED[name] = [...sets[name]];
    delete BLOCK_SET_ALLOWED[before];
    replaceStageSet(before, name);
    const deleted = readDeleted();
    deleted.delete(name);
    writeDeleted(deleted);
    st.blockSetEdit = name;
    st.blockSetOrder = [...SETS];
    saveAll();
    render();
    toast('ブロックセット名を変更しました');
  }

  function deleteBlockSet() {
    const name = st.blockSetEdit;
    if (!name || !SETS.includes(name)) return;
    if (SETS.length <= 1) {
      alert('最後のブロックセットは削除できません');
      return;
    }
    const replacement = replacementFor(name);
    if (!replacement) return alert('代替となるブロックセットがありません');
    const count = usageCount(name);
    const text = count > 0
      ? `ブロックセット「${name}」を削除しますか？\n\n使用中の ${count} ステージは「${replacement}」へ変更されます。`
      : `ブロックセット「${name}」を削除しますか？\n\nステージでは使用されていません。`;
    if (!confirm(text)) return;

    const index = SETS.indexOf(name);
    SETS.splice(index, 1);
    const sets = currentBlockSets();
    delete sets[name];
    delete BLOCK_SET_ALLOWED[name];
    replaceStageSet(name, replacement);
    const deleted = readDeleted();
    deleted.add(name);
    writeDeleted(deleted);
    st.blockSetEdit = replacement;
    st.blockSetOrder = [...SETS];
    saveAll();
    render();
    toast('ブロックセットを削除しました');
  }

  function moveBlockSet(direction) {
    const index = SETS.indexOf(st.blockSetEdit);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= SETS.length) return;
    [SETS[index], SETS[target]] = [SETS[target], SETS[index]];
    st.blockSetOrder = [...SETS];
    saveAll();
    renderMain();
    toast('ブロックセットの順序を変更しました');
  }

  function renderBlockSetTab() {
    const body = document.getElementById('body');
    if (!body) return;
    const stage = curStage();
    const active = SETS.includes(st.blockSetEdit) ? st.blockSetEdit : (stage?.blockSet && SETS.includes(stage.blockSet) ? stage.blockSet : SETS[0]);
    st.blockSetEdit = active;
    const allowed = new Set(currentBlockSets()[active] || []);
    const index = SETS.indexOf(active);

    body.innerHTML = `
      <div class="panel">
        <div class="grid">
          <div class="field">
            <label>編集するブロックセット</label>
            <select id="bs-select">${SETS.map((name) => `<option value="${name}" ${name === active ? 'selected' : ''}>${name}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>ブロックセット操作</label>
            <div class="controls" style="margin:0">
              <button class="btn primary" id="bs-add">＋ 追加</button>
              <button class="btn" id="bs-rename">名前変更</button>
              <button class="btn danger" id="bs-delete" ${SETS.length <= 1 ? 'disabled' : ''}>削除</button>
              <button class="btn" id="bs-up" ${index <= 0 ? 'disabled' : ''}>▲ 上へ</button>
              <button class="btn" id="bs-down" ${index < 0 || index >= SETS.length - 1 ? 'disabled' : ''}>▼ 下へ</button>
            </div>
          </div>
        </div>
        <div class="controls">
          <button class="btn" id="bs-all">すべて選択</button>
          <button class="btn" id="bs-none">すべて外す</button>
          <button class="btn warn" id="bs-apply">現在ステージに適用</button>
        </div>
        <div class="hint">削除したセットを使っているステージは、確認後に代替セットへ変更されます。順序はステージ編集画面の選択肢とJSONの <span class="mono">blockSetOrder</span> に反映されます。</div>
      </div>
      <div class="grid" style="margin-top:12px">
        ${CATALOG.map((group) => `<div class="panel"><div class="section" style="margin-top:0">${group.title}</div>${group.blocks.map(([type, label]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px"><input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}><span><b>${label}</b><br><span class="hint mono">${type}</span></span></label>`).join('')}</div>`).join('')}
      </div>`;

    document.getElementById('bs-select').onchange = (event) => { st.blockSetEdit = event.target.value; renderBlockSetTab(); };
    document.getElementById('bs-add').onclick = addBlockSet;
    document.getElementById('bs-rename').onclick = renameBlockSet;
    document.getElementById('bs-delete').onclick = deleteBlockSet;
    document.getElementById('bs-up').onclick = () => moveBlockSet(-1);
    document.getElementById('bs-down').onclick = () => moveBlockSet(1);
    document.getElementById('bs-all').onclick = () => {
      currentBlockSets()[active] = [...ALL_TYPES];
      BLOCK_SET_ALLOWED[active] = [...ALL_TYPES];
      saveAll();
      refreshCurrentWorkspace();
      renderBlockSetTab();
    };
    document.getElementById('bs-none').onclick = () => {
      currentBlockSets()[active] = [];
      BLOCK_SET_ALLOWED[active] = [];
      saveAll();
      refreshCurrentWorkspace();
      renderBlockSetTab();
    };
    document.getElementById('bs-apply').onclick = () => {
      const current = curStage();
      if (!current) return;
      current.blockSet = active;
      saveAll();
      render();
      toast('現在のステージに適用しました');
    };
    document.querySelectorAll('.bs-block').forEach((check) => {
      check.onchange = () => {
        const list = [...document.querySelectorAll('.bs-block:checked')].map((input) => input.value);
        currentBlockSets()[active] = normalizeAllowed(list);
        BLOCK_SET_ALLOWED[active] = [...currentBlockSets()[active]];
        saveAll();
        refreshCurrentWorkspace();
      };
    });
  }

  function moveGroup(groupId, direction) {
    const index = st.phases.findIndex((phase) => phase.id === groupId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= st.phases.length) return;
    const selectedStage = curStage();
    [st.phases[index], st.phases[target]] = [st.phases[target], st.phases[index]];
    if (selectedStage && typeof selectByStageRef === 'function') selectByStageRef(selectedStage);
    renumberAll();
    saveAll();
    render();
    toast('グループの順序を変更しました');
  }

  function renderSideWithGroupOrder() {
    const side = document.getElementById('side');
    if (!st.phases.length) {
      side.innerHTML = '<div class=empty>JSONを読み込んでください</div>';
      return;
    }
    let html = '<div class=section>グループ／ステージ</div>';
    st.phases.forEach((phase, phaseIndex) => {
      html += `<div class=phase><div class=ph><span class=ph-title>${esc(phase.id)} · ${esc(phase.name)}</span><span class=ph-count>${phase.stages.length}</span><span class=ph-actions><button class=side-mini data-act=move-phase-up data-ph='${esc(phase.id)}' title='グループを上へ移動' ${phaseIndex === 0 ? 'disabled' : ''}>▲</button><button class=side-mini data-act=move-phase-down data-ph='${esc(phase.id)}' title='グループを下へ移動' ${phaseIndex === st.phases.length - 1 ? 'disabled' : ''}>▼</button><button class=side-mini data-act=edit-phase data-ph='${esc(phase.id)}' title='グループ名変更'>名</button><button class=side-mini data-act=rename-phase-id data-ph='${esc(phase.id)}' title='グループID変更'>ID</button><button class=side-mini data-act=delete-phase data-ph='${esc(phase.id)}' title='グループ削除'>×</button></span></div>`;
      phase.stages.forEach((stage, index) => {
        html += `<div class='st ${phase.id === st.phase && index === st.idx ? 'active' : ''}' data-act=sel data-ph='${esc(phase.id)}' data-i='${index}'><span class=st-no>${String(stage.no).padStart(2, '0')}</span><span class=st-title>${esc(stage.title)}</span><span class=st-actions><button class=side-mini data-act=move-up data-ph='${esc(phase.id)}' data-i='${index}' title='上へ'>▲</button><button class=side-mini data-act=move-down data-ph='${esc(phase.id)}' data-i='${index}' title='下へ'>▼</button><button class=side-mini data-act=copy-stage data-ph='${esc(phase.id)}' data-i='${index}' title='複製'>C</button><button class=side-mini data-act=delete-stage data-ph='${esc(phase.id)}' data-i='${index}' title='削除'>×</button></span></div>`;
      });
      html += `<button class=side-add data-act=add-stage data-ph='${esc(phase.id)}'>＋ ステージ追加</button></div>`;
    });
    html += '<button class=side-add data-act=add-phase>＋ グループ追加</button>';
    side.innerHTML = html;
    side.querySelectorAll('[data-act]').forEach((element) => {
      element.onclick = (event) => {
        event.stopPropagation();
        handleSideAction(element.dataset);
      };
    });
  }

  const originalHandleSideAction = window.handleSideAction || handleSideAction;
  replaceGlobal('handleSideAction', function handleSideActionWithGroupOrder(data) {
    if (data.act === 'move-phase-up') return moveGroup(data.ph, -1);
    if (data.act === 'move-phase-down') return moveGroup(data.ph, 1);
    return originalHandleSideAction(data);
  });
  replaceGlobal('renderSide', renderSideWithGroupOrder);

  const originalRenderMain = window.renderMain || renderMain;
  replaceGlobal('renderMain', function renderMainWithBlockSetTools() {
    if (st.tab !== 'blocksets') return originalRenderMain();
    const stage = curStage();
    const main = document.getElementById('main');
    if (!stage) {
      main.innerHTML = '<div class=empty>JSONを読み込んでください</div>';
      return;
    }
    main.innerHTML = `<div class="tabs">${TABS.map(([id, label]) => `<div class="tab ${st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id="body"></div>`;
    main.querySelectorAll('.tab').forEach((tab) => {
      tab.onclick = () => {
        if (st.tab === 'play' && typeof saveXml === 'function') saveXml();
        if (typeof disposeBlockly === 'function') disposeBlockly();
        st.tab = tab.dataset.tab;
        renderMain();
      };
    });
    renderBlockSetTab();
  });

  const originalLoadObj = window.loadObj || loadObj;
  replaceGlobal('loadObj', function loadObjWithBlockSetTools(obj) {
    const importedSets = obj && obj.blockSets ? obj.blockSets : null;
    const importedOrder = obj && obj.blockSetOrder ? obj.blockSetOrder : null;
    const importedDeleted = new Set(Array.isArray(obj?.deletedBlockSets)
      ? obj.deletedBlockSets
      : (importedSets ? STANDARD_SET_NAMES.filter((name) => !Object.prototype.hasOwnProperty.call(importedSets, name)) : []));
    writeDeleted(importedDeleted);
    if (importedSets) syncBlockSets(importedSets, importedOrder, importedDeleted);
    originalLoadObj(obj);
    syncBlockSets(importedSets || st.blockSets, importedOrder || st.blockSetOrder, importedDeleted);
    saveAll();
    render();
  });

  replaceGlobal('saveLocal', saveAll);
  replaceGlobal('saveJson', downloadJson);

  if (!TABS.some(([id]) => id === 'blocksets')) TABS.push(['blocksets', 'ブロックセット']);
  let initial = {};
  try { initial = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) {}
  const deleted = new Set(Array.isArray(initial.deletedBlockSets) ? initial.deletedBlockSets : [...readDeleted()]);
  writeDeleted(deleted);
  syncBlockSets(initial.blockSets, initial.blockSetOrder, deleted);

  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = downloadJson;
  render();
})();
