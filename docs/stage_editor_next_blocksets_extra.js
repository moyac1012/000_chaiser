(() => {
  const DEFAULT_SET_NAMES = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function getStoredBlockSets() {
    try {
      const raw = localStorage.getItem(STORAGE);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && obj.blockSets && typeof obj.blockSets === 'object' ? obj.blockSets : null;
    } catch (_) {
      return null;
    }
  }

  function ensureSetName(name) {
    if (!name) return;
    if (!SETS.includes(name)) SETS.push(name);
  }

  function ensureCustomSetNamesFrom(blockSets) {
    if (!blockSets) return;
    Object.keys(blockSets).forEach(ensureSetName);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentBlockSetsObject() {
    if (!st.blockSets) st.blockSets = {};
    const stored = getStoredBlockSets();
    if (stored) {
      Object.keys(stored).forEach((name) => {
        if (!st.blockSets[name]) st.blockSets[name] = Array.isArray(stored[name]) ? [...stored[name]] : [];
      });
    }
    SETS.forEach((name) => {
      if (!Array.isArray(st.blockSets[name])) {
        const fallback = (typeof BLOCK_SET_ALLOWED !== 'undefined' && Array.isArray(BLOCK_SET_ALLOWED[name])) ? BLOCK_SET_ALLOWED[name] : [];
        st.blockSets[name] = [...fallback];
      }
      if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[name] = [...st.blockSets[name]];
    });
    return st.blockSets;
  }

  function saveAll() {
    const payload = {
      version: 2,
      blockSets: clone(currentBlockSetsObject()),
      phases: st.phases || [],
    };
    localStorage.setItem(STORAGE, JSON.stringify(payload));
  }

  function downloadText(text, name, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toast(message) {
    if (typeof msg === 'function') msg(message);
  }

  const prevLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithDynamicBlockSets(obj) {
    ensureCustomSetNamesFrom(obj && obj.blockSets);
    prevLoadObj(obj);
    if (obj && obj.blockSets) {
      ensureCustomSetNamesFrom(obj.blockSets);
      st.blockSets = {};
      Object.keys(obj.blockSets).forEach((name) => {
        st.blockSets[name] = Array.isArray(obj.blockSets[name]) ? [...obj.blockSets[name]] : [];
        if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[name] = [...st.blockSets[name]];
      });
      SETS.forEach((name) => {
        if (!st.blockSets[name]) {
          const fallback = (typeof BLOCK_SET_ALLOWED !== 'undefined' && BLOCK_SET_ALLOWED[name]) ? BLOCK_SET_ALLOWED[name] : [];
          st.blockSets[name] = [...fallback];
        }
      });
      saveAll();
      render();
    }
  });

  setGlobal('saveLocal', saveAll);

  setGlobal('saveJson', function saveJsonWithDynamicBlockSets() {
    if (typeof saveXml === 'function') saveXml();
    downloadText(
      JSON.stringify({ version: 2, blockSets: clone(currentBlockSetsObject()), phases: st.phases || [] }, null, 2),
      `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    );
  });

  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = saveJson;

  function sanitizeSetName(name) {
    return String(name || '').trim().replace(/\s+/g, '_');
  }

  function validateNewSetName(name, oldName = null) {
    if (!name) return 'ブロックセット名は空にできません';
    if (!/^[A-Za-z0-9_\-]+$/.test(name)) return 'ブロックセット名は半角英数字・_・- のみ使えます';
    if (name !== oldName && SETS.includes(name)) return '同じ名前のブロックセットが既にあります';
    return '';
  }

  function addBlockSet() {
    const base = st.blockSetEdit && SETS.includes(st.blockSetEdit) ? st.blockSetEdit : (curStage()?.blockSet || 'BASIC');
    let name = prompt('新しいブロックセット名を入力してください（例: LOOP）', '');
    if (name == null) return;
    name = sanitizeSetName(name);
    const error = validateNewSetName(name);
    if (error) return alert(error);
    const sets = currentBlockSetsObject();
    const inherit = confirm(`現在の ${base} のブロック構成をコピーして作成しますか？\nキャンセルすると空のセットとして作成します。`);
    SETS.push(name);
    sets[name] = inherit ? [...(sets[base] || [])] : [];
    if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[name] = [...sets[name]];
    st.blockSetEdit = name;
    saveAll();
    renderMain();
    toast('ブロックセットを追加しました');
  }

  function renameBlockSet() {
    const oldName = st.blockSetEdit && SETS.includes(st.blockSetEdit) ? st.blockSetEdit : SETS[0];
    if (!oldName) return;
    let next = prompt('新しいブロックセット名を入力してください', oldName);
    if (next == null) return;
    next = sanitizeSetName(next);
    const error = validateNewSetName(next, oldName);
    if (error) return alert(error);
    if (next === oldName) return;

    const idx = SETS.indexOf(oldName);
    if (idx >= 0) SETS[idx] = next;

    const sets = currentBlockSetsObject();
    sets[next] = sets[oldName] ? [...sets[oldName]] : [];
    delete sets[oldName];

    if (typeof BLOCK_SET_ALLOWED !== 'undefined') {
      BLOCK_SET_ALLOWED[next] = [...sets[next]];
      delete BLOCK_SET_ALLOWED[oldName];
    }

    (st.phases || []).forEach((phase) => {
      (phase.stages || []).forEach((stage) => {
        if (stage.blockSet === oldName) stage.blockSet = next;
      });
    });

    if (st.blockSetEdit === oldName) st.blockSetEdit = next;
    if (curStage() && curStage().blockSet === oldName) curStage().blockSet = next;

    saveAll();
    render();
    toast('ブロックセット名を変更しました');
  }

  function renderDynamicBlockSetEditor() {
    const body = document.getElementById('body');
    if (!body) return;
    const setNames = SETS;
    const selected = setNames.includes(st.blockSetEdit) ? st.blockSetEdit : (curStage()?.blockSet || setNames[0]);
    st.blockSetEdit = selected;
    const sets = currentBlockSetsObject();
    const allowed = new Set(sets[selected] || []);
    const catalog = window.__BLOCK_CATALOG || [
      { group: 'スタート・行動', blocks: [
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
      { group: 'まわりを見る', blocks: [
        ['chaser_get_tile', '方向のマス'],
        ['chaser_is_tile', '方向のマス判定'],
        ['chaser_get_around', 'まわりの番号'],
        ['chaser_view_get_around', '見た結果の番号'],
        ['chaser_view_has_tile', '見た結果に指定マスがある'],
        ['chaser_view_count_tile', '見た結果の指定マス数'],
        ['chaser_discard_value', '結果を使わない'],
        ['chaser_tile_value', 'マスの種類'],
      ] },
      { group: '変数・状態', blocks: [
        ['chaser_state_create', '変数を作る'],
        ['chaser_state_set', '変数に値を入れる'],
        ['chaser_state_get', '変数を読む'],
        ['chaser_state_change', '変数を増減'],
        ['chaser_turn_number', '現在のターン数'],
        ['chaser_last_direction', '前に進んだ向き'],
        ['chaser_direction_value', '向き'],
      ] },
      { group: '条件・論理', blocks: [
        ['controls_if', 'もし / そうでなければ'],
        ['logic_compare', '比較'],
        ['logic_operation', 'かつ / または'],
        ['logic_boolean', '真 / 偽'],
        ['logic_negate', 'ではない'],
      ] },
      { group: '数', blocks: [
        ['math_number', '数'],
        ['math_arithmetic', '四則演算'],
        ['math_modulo', '余り'],
        ['math_number_property', '数の性質'],
        ['math_random_int', 'ランダムな整数'],
        ['math_random_float', 'ランダムな小数'],
      ] },
    ];
    const allTypes = catalog.flatMap((cat) => cat.blocks.map(([type]) => type));

    body.innerHTML = `
      <div class="panel">
        <div class="grid">
          <div class="field">
            <label>編集するブロックセット</label>
            <select id="bs-select">${setNames.map((set) => `<option value="${set}" ${set === selected ? 'selected' : ''}>${set}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>ブロックセット操作</label>
            <div class="controls" style="margin:0">
              <button class="btn primary" id="bs-add">＋ 追加</button>
              <button class="btn" id="bs-rename">名前変更</button>
            </div>
          </div>
        </div>
        <div class="controls">
          <button class="btn" id="bs-check-all">すべて選択</button>
          <button class="btn" id="bs-uncheck-all">すべて外す</button>
          <button class="btn warn" id="bs-copy-current">現在ステージに適用</button>
        </div>
        <div class="hint">追加・名前変更したブロックセットはJSON保存時に <span class="mono">blockSets</span> として保存されます。</div>
      </div>
      <div class="grid" style="margin-top:12px">
        ${catalog.map((cat) => `
          <div class="panel">
            <div class="section" style="margin-top:0">${cat.group}</div>
            ${cat.blocks.map(([type, label]) => `
              <label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px">
                <input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}>
                <span><b>${label}</b><br><span class="hint mono">${type}</span></span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('bs-select').onchange = (event) => {
      st.blockSetEdit = event.target.value;
      renderDynamicBlockSetEditor();
    };

    document.getElementById('bs-add').onclick = addBlockSet;
    document.getElementById('bs-rename').onclick = renameBlockSet;

    document.getElementById('bs-check-all').onclick = () => {
      sets[st.blockSetEdit] = [...allTypes];
      if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[st.blockSetEdit] = [...sets[st.blockSetEdit]];
      saveAll();
      renderDynamicBlockSetEditor();
    };

    document.getElementById('bs-uncheck-all').onclick = () => {
      sets[st.blockSetEdit] = [];
      if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[st.blockSetEdit] = [];
      saveAll();
      renderDynamicBlockSetEditor();
    };

    document.getElementById('bs-copy-current').onclick = () => {
      const stage = curStage();
      if (!stage) return;
      stage.blockSet = st.blockSetEdit;
      saveAll();
      render();
      toast('現在のステージに適用しました');
    };

    document.querySelectorAll('.bs-block').forEach((input) => {
      input.onchange = () => {
        sets[st.blockSetEdit] = [...document.querySelectorAll('.bs-block:checked')].map((el) => el.value);
        if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[st.blockSetEdit] = [...sets[st.blockSetEdit]];
        if (st.ws && curStage()?.blockSet === st.blockSetEdit) st.ws.updateToolbox(toolbox(st.blockSetEdit));
        saveAll();
      };
    });
  }

  const previousRenderMain = window.renderMain || renderMain;
  setGlobal('renderMain', function renderMainWithDynamicBlockSets() {
    if (st.tab !== 'blocksets') return previousRenderMain();
    const s = curStage();
    const main = document.getElementById('main');
    if (!s) {
      main.innerHTML = '<div class=empty>JSONを読み込んでください</div>';
      return;
    }
    main.innerHTML = `<div class=tabs>${TABS.map(([id, label]) => `<div class="tab ${st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id=body></div>`;
    main.querySelectorAll('.tab').forEach((tab) => {
      tab.onclick = () => {
        if (st.tab === 'play' && typeof saveXml === 'function') saveXml();
        if (typeof disposeBlockly === 'function') disposeBlockly();
        st.tab = tab.dataset.tab;
        renderMain();
      };
    });
    renderDynamicBlockSetEditor();
  });

  if (!TABS.some(([id]) => id === 'blocksets')) TABS.push(['blocksets', 'ブロックセット']);

  ensureCustomSetNamesFrom(getStoredBlockSets());
  currentBlockSetsObject();
  saveAll();
  if (typeof render === 'function') render();
})();