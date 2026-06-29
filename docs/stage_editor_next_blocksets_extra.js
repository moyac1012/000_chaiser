(() => {
  const STANDARD_ORDER = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];
  const DEFAULT_BLOCK_SETS = JSON.parse(JSON.stringify(BLOCK_SET_ALLOWED));
  const CATALOG = [
    { title: 'スタート・行動', blocks: [
      ['chaser_on_turn', '毎ターン'],
      ['chaser_action_walk', '歩く'],
      ['chaser_action_put', 'ブロックを置く'],
      ['chaser_action_walk_last', '前に進んだ向きで歩く'],
      ['chaser_action_walk_random', 'どこかに歩く'],
      ['chaser_action_look', '見る'],
      ['chaser_action_search', 'まっすぐ見る'],
      ['chaser_action_look_store', '広く見た結果を変数に入れる'],
      ['chaser_action_search_store', 'まっすぐ見た結果を変数に入れる'],
      ['chaser_turn_end', 'ターンを終える'],
    ] },
    { title: 'まわりを見る', blocks: [
      ['chaser_get_tile', '方向のマス'],
      ['chaser_is_tile', '方向のマス判定'],
      ['chaser_get_around', 'まわりの番号'],
      ['chaser_view_get_around', '見た結果の番号'],
      ['chaser_view_has_tile', '見た結果に指定マスがある'],
      ['chaser_view_count_tile', '見た結果の指定マス数'],
      ['chaser_discard_value', '結果を使わない'],
      ['chaser_tile_value', 'マスの種類'],
    ] },
    { title: '変数・状態', blocks: [
      ['chaser_state_create', '変数を作る'],
      ['chaser_state_set', '変数に値を入れる'],
      ['chaser_state_get', '変数を読む'],
      ['chaser_state_change', '変数を増減'],
      ['chaser_turn_number', '現在のターン数'],
      ['chaser_last_direction', '前に進んだ向き'],
      ['chaser_direction_value', '向き'],
    ] },
    { title: '条件・論理', blocks: [
      ['controls_if', 'もし / そうでなければ'],
      ['logic_compare', '比較'],
      ['logic_operation', 'かつ / または'],
      ['logic_boolean', '真 / 偽'],
      ['logic_negate', 'ではない'],
    ] },
    { title: '数', blocks: [
      ['math_number', '数'],
      ['math_arithmetic', '四則演算'],
      ['math_modulo', '余り'],
      ['math_number_property', '数の性質'],
      ['math_random_int', 'ランダムな整数'],
      ['math_random_float', 'ランダムな小数'],
    ] },
  ];
  const ALL_TYPES = CATALOG.flatMap((group) => group.blocks.map(([type]) => type));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function toast(text) {
    if (typeof msg === 'function') msg(text);
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

  function storedData() {
    try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) { return {}; }
  }

  function normalizeAllowed(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter((type) => {
      if (type === 'chaser_on_start' || !ALL_TYPES.includes(type) || seen.has(type)) return false;
      seen.add(type);
      return true;
    });
  }

  function ensureNames(blockSets, order) {
    const names = [];
    const seen = new Set();
    const add = (name) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    };
    (Array.isArray(order) ? order : []).forEach(add);
    STANDARD_ORDER.forEach(add);
    Object.keys(blockSets || {}).forEach(add);
    SETS.forEach(add);
    SETS.splice(0, SETS.length, ...names);
    return names;
  }

  function syncBlockSets(input, order) {
    const source = input && typeof input === 'object' ? input : {};
    const names = ensureNames(source, order);
    const result = {};
    names.forEach((name) => {
      const fallback = DEFAULT_BLOCK_SETS[name] || BLOCK_SET_ALLOWED[name] || [];
      result[name] = normalizeAllowed(source[name] == null ? fallback : source[name]);
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
      const saved = storedData();
      syncBlockSets(saved.blockSets, saved.blockSetOrder);
    }
    return st.blockSets;
  }

  function payload() {
    const sets = currentBlockSets();
    return {
      version: 2,
      blockSets: clone(sets),
      blockSetOrder: [...SETS],
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
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateCurrentWorkspace() {
    const stage = curStage();
    if (st.ws && stage && typeof toolbox === 'function') {
      st.ws.updateToolbox(toolbox(stage.blockSet));
    }
  }

  function addSet() {
    const source = st.blockSetEdit && SETS.includes(st.blockSetEdit) ? st.blockSetEdit : 'BASIC';
    let name = prompt('新しいブロックセット名を入力してください（例: LOOP）', '');
    if (name == null) return;
    name = normalizeName(name);
    const error = validateName(name);
    if (error) return alert(error);

    const copy = confirm(`現在の ${source} のブロック構成をコピーして作成しますか？\nキャンセルすると空のセットとして作成します。`);
    const sets = currentBlockSets();
    SETS.push(name);
    sets[name] = copy ? [...(sets[source] || [])] : [];
    BLOCK_SET_ALLOWED[name] = [...sets[name]];
    st.blockSetEdit = name;
    st.blockSetOrder = [...SETS];
    saveAll();
    renderMain();
    toast('ブロックセットを追加しました');
  }

  function renameSet() {
    const oldName = st.blockSetEdit;
    if (!oldName || !SETS.includes(oldName)) return;
    let next = prompt('新しいブロックセット名を入力してください', oldName);
    if (next == null) return;
    next = normalizeName(next);
    const error = validateName(next, oldName);
    if (error) return alert(error);
    if (next === oldName) return;

    const index = SETS.indexOf(oldName);
    SETS[index] = next;
    const sets = currentBlockSets();
    sets[next] = [...(sets[oldName] || [])];
    delete sets[oldName];
    BLOCK_SET_ALLOWED[next] = [...sets[next]];
    delete BLOCK_SET_ALLOWED[oldName];

    st.phases.forEach((phase) => phase.stages.forEach((stage) => {
      if (stage.blockSet === oldName) stage.blockSet = next;
    }));
    st.blockSetEdit = next;
    st.blockSetOrder = [...SETS];
    saveAll();
    render();
    toast('ブロックセット名を変更しました');
  }

  function moveSet(delta) {
    const index = SETS.indexOf(st.blockSetEdit);
    const target = index + delta;
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
        <div class="hint">並び順は、ステージ編集画面のブロックセット選択肢とJSONの <span class="mono">blockSetOrder</span> に反映されます。「最初に1回だけやること」は追加対象外です。</div>
      </div>
      <div class="grid" style="margin-top:12px">
        ${CATALOG.map((group) => `<div class="panel"><div class="section" style="margin-top:0">${group.title}</div>${group.blocks.map(([type, label]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px"><input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}><span><b>${label}</b><br><span class="hint mono">${type}</span></span></label>`).join('')}</div>`).join('')}
      </div>`;

    document.getElementById('bs-select').onchange = (event) => {
      st.blockSetEdit = event.target.value;
      renderBlockSetTab();
    };
    document.getElementById('bs-add').onclick = addSet;
    document.getElementById('bs-rename').onclick = renameSet;
    document.getElementById('bs-up').onclick = () => moveSet(-1);
    document.getElementById('bs-down').onclick = () => moveSet(1);
    document.getElementById('bs-all').onclick = () => {
      currentBlockSets()[active] = [...ALL_TYPES];
      BLOCK_SET_ALLOWED[active] = [...ALL_TYPES];
      saveAll();
      renderBlockSetTab();
      updateCurrentWorkspace();
    };
    document.getElementById('bs-none').onclick = () => {
      currentBlockSets()[active] = [];
      BLOCK_SET_ALLOWED[active] = [];
      saveAll();
      renderBlockSetTab();
      updateCurrentWorkspace();
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
        updateCurrentWorkspace();
      };
    });
  }

  const baseRenderMain = window.renderMain || renderMain;
  setGlobal('renderMain', function renderMainWithBlockSetTools() {
    if (st.tab !== 'blocksets') return baseRenderMain();
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

  const baseLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithBlockSetTools(obj) {
    const sets = obj && obj.blockSets ? obj.blockSets : null;
    const order = obj && obj.blockSetOrder ? obj.blockSetOrder : null;
    if (sets) syncBlockSets(sets, order);
    baseLoadObj(obj);
    syncBlockSets(sets || st.blockSets, order || st.blockSetOrder);
    saveAll();
    render();
  });

  setGlobal('saveLocal', saveAll);
  setGlobal('saveJson', downloadJson);

  if (!TABS.some(([id]) => id === 'blocksets')) TABS.push(['blocksets', 'ブロックセット']);
  const saved = storedData();
  syncBlockSets(saved.blockSets, saved.blockSetOrder);

  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = downloadJson;
  render();
})();
