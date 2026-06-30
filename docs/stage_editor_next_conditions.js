(() => {
  const CONDITION_OPTIONS = [
    ['reachGoal', 'ゴールに到達'],
    ['collectItemsAndGoal', 'アイテムを N 個以上取得してゴール'],
    ['defeatEnemy', '敵を倒したらクリア'],
    ['survive', 'Nターンやられなければクリア'],
  ];
  const DELTA = {
    Up: { x: 0, y: -1 }, Down: { x: 0, y: 1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 },
  };
  const BLOCK_SET_BACKUP_KEY = `${STORAGE}:fullBackup`;
  const BLOCK_SET_META_KEY = `${STORAGE}:blockSetMeta`;
  const DEFAULT_SET_ORDER = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function integer(value, fallback = 0, min = 0) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  }

  function normalizeValidation(stage) {
    stage.play ||= {};
    const previous = stage.play.validation || {};
    let kind = previous.kind;
    const legacy = String(stage.cond || '').toLowerCase();
    if (!['reachGoal', 'collectItemsAndGoal', 'defeatEnemy', 'survive', 'collectItems', 'winByPut'].includes(kind)) {
      if (legacy.includes('survive')) kind = 'survive';
      else if (legacy.includes('defeat') || legacy.includes('enemy') || legacy.includes('put')) kind = 'defeatEnemy';
      else if (legacy.includes('items') && legacy.includes('goal')) kind = 'collectItemsAndGoal';
      else if (legacy.includes('items')) kind = 'collectItems';
      else kind = 'reachGoal';
    }
    if (kind === 'winByPut') kind = 'defeatEnemy';
    if (kind === 'collectItems') kind = legacy.includes('goal') ? 'collectItemsAndGoal' : 'collectItems';
    const validation = {
      kind,
      maxActions: integer(previous.maxActions, 0, 0) || null,
      minItems: integer(previous.minItems, 1, 1),
      minTurns: integer(previous.minTurns, 10, 1),
      requireAllItems: Boolean(previous.requireAllItems),
    };
    stage.play.validation = validation;
    stage.cond = validationText(validation);
    return validation;
  }

  function validationText(validation) {
    if (validation.kind === 'collectItemsAndGoal') return `items${validation.minItems}+goal`;
    if (validation.kind === 'defeatEnemy') return 'defeatEnemy';
    if (validation.kind === 'survive') return `survive${validation.minTurns}`;
    if (validation.kind === 'collectItems') return `items${validation.minItems}`;
    return validation.requireAllItems ? 'goal+items' : 'goal';
  }

  function conditionDescription(validation) {
    const limit = validation.maxActions ? ` / 最大${validation.maxActions}手` : '';
    if (validation.kind === 'collectItemsAndGoal') return `アイテムを${validation.minItems}個以上取得してゴール${limit}`;
    if (validation.kind === 'defeatEnemy') return `敵を倒したらクリア${limit}`;
    if (validation.kind === 'survive') return `${validation.minTurns}ターンやられなければクリア${limit}`;
    if (validation.kind === 'collectItems') return `アイテムを${validation.minItems}個以上取得${limit}`;
    return `ゴールに到達${limit}`;
  }

  function updateStageValidation(stage, patch) {
    const validation = { ...normalizeValidation(stage), ...patch };
    validation.maxActions = integer(validation.maxActions, 0, 0) || null;
    validation.minItems = integer(validation.minItems, 1, 1);
    validation.minTurns = integer(validation.minTurns, 10, 1);
    stage.play.validation = validation;
    stage.cond = validationText(validation);
    st.play = null;
    st.bot = null;
    if (typeof saveLocal === 'function') saveLocal();
  }

  function appendValidationEditor(stage) {
    const oldField = document.getElementById('f-cond')?.closest('.field');
    if (!oldField) return;
    const grid = oldField.parentElement;
    const validation = normalizeValidation(stage);
    const optionHtml = CONDITION_OPTIONS.map(([value, text]) => `<option value="${value}" ${validation.kind === value ? 'selected' : ''}>${text}</option>`).join('');
    const countField = validation.kind === 'collectItemsAndGoal' || validation.kind === 'collectItems'
      ? `<div class="field" id="validation-count-field"><label>必要アイテム数 N</label><input id="validation-min-items" type="number" min="1" step="1" value="${validation.minItems}"></div>`
      : validation.kind === 'survive'
        ? `<div class="field" id="validation-count-field"><label>生存ターン数 N</label><input id="validation-min-turns" type="number" min="1" step="1" value="${validation.minTurns}"></div>`
        : `<div class="field" id="validation-count-field"><label>条件の補足</label><div class="hint">${validation.kind === 'defeatEnemy' ? 'マップ上に敵 H を配置し、隣へブロックを置くと倒せます。' : 'ゴール G に到達するとクリアです。'}</div></div>`;
    const replacement = document.createElement('div');
    replacement.className = 'field';
    replacement.innerHTML = `<label>クリア条件</label><select id="validation-kind">${optionHtml}</select><div class="hint" id="validation-description" style="margin-top:4px">${conditionDescription(validation)}</div>`;
    oldField.replaceWith(replacement);
    grid.insertAdjacentHTML('beforeend', `${countField}<div class="field"><label>手数制限（最大手数）</label><input id="validation-max-actions" type="number" min="0" step="1" value="${validation.maxActions || ''}" placeholder="制限なし"><div class="hint">空欄または0なら制限なし。N手目で条件を満たせばクリアできます。</div></div>`);

    document.getElementById('validation-kind').onchange = (event) => {
      const patch = { kind: event.target.value };
      if (patch.kind === 'collectItemsAndGoal') patch.minItems = validation.minItems || 1;
      if (patch.kind === 'survive') patch.minTurns = validation.minTurns || 10;
      updateStageValidation(stage, patch);
      renderEdit(stage);
    };
    const item = document.getElementById('validation-min-items');
    if (item) item.oninput = () => {
      updateStageValidation(stage, { minItems: integer(item.value, 1, 1) });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
    const turns = document.getElementById('validation-min-turns');
    if (turns) turns.oninput = () => {
      updateStageValidation(stage, { minTurns: integer(turns.value, 10, 1) });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
    const limit = document.getElementById('validation-max-actions');
    if (limit) limit.oninput = () => {
      updateStageValidation(stage, { maxActions: integer(limit.value, 0, 0) || null });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
  }

  const originalNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithValidation(stage, no) {
    originalNormStage(stage, no);
    normalizeValidation(stage);
  });

  const baseRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithValidation(stage) {
    normalizeValidation(stage);
    baseRenderEdit(stage);
    appendValidationEditor(stage);
  });

  const originalInitPlay = window.initPlay || initPlay;
  setGlobal('initPlay', function initPlayWithValidation(stage, mapIndex) {
    const validation = normalizeValidation(stage);
    const play = originalInitPlay(stage, mapIndex);
    play.validation = { ...validation };
    play.enemyDefeated = false;
    return play;
  });

  function isInside(play, x, y) {
    return y >= 0 && y < play.tiles.length && x >= 0 && x < play.tiles[y].length;
  }
  function clear(play, message) {
    play.status = 'success';
    play.msg = message;
    play.logs.push(`成功: ${message}`);
  }

  setGlobal('judge', function judgeWithValidation() {
    const play = st.play;
    const validation = play.validation || { kind: 'reachGoal' };
    const atGoal = Boolean(play.goal && play.cool.x === play.goal.x && play.cool.y === play.goal.y);
    const remainingItems = play.tiles.reduce((sum, row) => sum + row.filter((cell) => cell === 'I').length, 0);
    if (validation.kind === 'reachGoal' && atGoal) {
      if (validation.requireAllItems && remainingItems > 0) play.msg = `アイテム未回収（残り${remainingItems}個）`;
      else { clear(play, 'ゴール到達'); return; }
    }
    if (validation.kind === 'collectItemsAndGoal' && atGoal && play.items >= validation.minItems) { clear(play, `アイテム${validation.minItems}個以上取得してゴール`); return; }
    if (validation.kind === 'collectItems' && play.items >= validation.minItems) { clear(play, `アイテム${validation.minItems}個以上取得`); return; }
    if (validation.kind === 'defeatEnemy' && play.enemyDefeated) { clear(play, '敵を倒した'); return; }
    if (validation.kind === 'survive' && play.turn >= validation.minTurns) { clear(play, `${validation.minTurns}ターン生存`); return; }
    if (validation.maxActions && play.turn >= validation.maxActions) { fail(`最大${validation.maxActions}手を超過`); return; }
    if (validation.kind === 'collectItemsAndGoal' && atGoal) play.msg = `アイテム不足（${play.items}/${validation.minItems}個）`;
  });

  setGlobal('applyPending', function applyPendingWithValidation() {
    const play = st.play;
    const action = play.pending;
    play.turn++;
    if (!action) { play.logs.push(`${play.turn}: actionなし`); judge(); return; }
    if (action.kind === 'look' || action.kind === 'search') { play.logs.push(`${play.turn}: ${action.kind}${action.dir}`); judge(); return; }
    const delta = DELTA[action.dir] || { x: 0, y: 0 };
    const x = play.cool.x + delta.x;
    const y = play.cool.y + delta.y;
    if (action.kind === 'walk') {
      if (!isInside(play, x, y) || play.tiles[y][x] === '#') { fail(`壁: walk${action.dir}`); return; }
      if (play.hot && play.hot.x === x && play.hot.y === y) { fail('敵にやられた'); return; }
      play.cool = { x, y };
      if (play.tiles[y][x] === 'I') { play.items++; play.tiles[y][x] = '.'; play.logs.push(`${play.turn}: walk${action.dir} / item +1`); }
      else play.logs.push(`${play.turn}: walk${action.dir}`);
      judge();
      return;
    }
    if (action.kind === 'put') {
      if (play.hot && play.hot.x === x && play.hot.y === y) {
        play.hot = null;
        play.enemyDefeated = true;
        play.logs.push(`${play.turn}: put${action.dir} / enemy defeated`);
        judge();
        return;
      }
      if (isInside(play, x, y) && play.tiles[y][x] === '.') play.tiles[y][x] = '#';
      play.logs.push(`${play.turn}: put${action.dir}`);
      judge();
    }
  });

  // ---------------------------------------------------------------------------
  // 保存・再読込の補強
  // ---------------------------------------------------------------------------
  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || ''); } catch (_) { return null; }
  }
  function configFrom(record) {
    if (!record || typeof record !== 'object' || !record.blockSets || typeof record.blockSets !== 'object') return null;
    return {
      blockSets: record.blockSets,
      blockSetOrder: Array.isArray(record.blockSetOrder) ? record.blockSetOrder : Object.keys(record.blockSets),
      deletedBlockSets: Array.isArray(record.deletedBlockSets) ? record.deletedBlockSets : [],
    };
  }
  function currentBlockSetConfig() {
    const names = Array.isArray(SETS) ? [...SETS] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : BLOCK_SET_ALLOWED;
    const blockSets = {};
    names.forEach((name) => { blockSets[name] = Array.isArray(source[name]) ? [...source[name]] : []; });
    return { blockSets, blockSetOrder: names, deletedBlockSets: Array.isArray(st.deletedBlockSets) ? [...st.deletedBlockSets] : [] };
  }
  function applyBlockSetConfig(config) {
    if (!config || !config.blockSets) return false;
    const deleted = new Set(Array.isArray(config.deletedBlockSets) ? config.deletedBlockSets : []);
    const names = [];
    const used = new Set();
    const add = (name) => {
      if (typeof name !== 'string' || !name || deleted.has(name) || used.has(name)) return;
      if (!Object.prototype.hasOwnProperty.call(config.blockSets, name)) return;
      used.add(name);
      names.push(name);
    };
    (Array.isArray(config.blockSetOrder) ? config.blockSetOrder : []).forEach(add);
    Object.keys(config.blockSets).forEach(add);
    if (!names.length) return false;
    SETS.splice(0, SETS.length, ...names);
    Object.keys(BLOCK_SET_ALLOWED).forEach((name) => delete BLOCK_SET_ALLOWED[name]);
    st.blockSets = {};
    names.forEach((name) => {
      const raw = Array.isArray(config.blockSets[name]) ? config.blockSets[name] : [];
      const seen = new Set();
      st.blockSets[name] = raw.filter((type) => type !== 'chaser_on_start' && !seen.has(type) && (seen.add(type) || true));
      BLOCK_SET_ALLOWED[name] = [...st.blockSets[name]];
    });
    st.blockSetOrder = [...names];
    st.deletedBlockSets = [...deleted];
    return true;
  }
  function ensureExistingStageSetNames() {
    const fallback = SETS[0] || 'BASIC';
    if (!SETS.length) {
      SETS.push(fallback);
      st.blockSets ||= {};
      st.blockSets[fallback] ||= [];
      BLOCK_SET_ALLOWED[fallback] = [...st.blockSets[fallback]];
    }
    (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => {
      if (!SETS.includes(stage.blockSet)) stage.blockSet = fallback;
    }));
  }
  function savedConfig() {
    return configFrom(readJson(STORAGE)) || configFrom(readJson(BLOCK_SET_BACKUP_KEY)) || configFrom(readJson(BLOCK_SET_META_KEY));
  }
  function fullPayload() {
    ensureExistingStageSetNames();
    const config = currentBlockSetConfig();
    return { version: 2, ...config, phases: st.phases || [] };
  }
  function persistReliable() {
    const data = fullPayload();
    const config = { blockSets: data.blockSets, blockSetOrder: data.blockSetOrder, deletedBlockSets: data.deletedBlockSets };
    localStorage.setItem(STORAGE, JSON.stringify(data));
    localStorage.setItem(BLOCK_SET_BACKUP_KEY, JSON.stringify(config));
    localStorage.setItem(BLOCK_SET_META_KEY, JSON.stringify(config));
  }

  if (!window.__chaiserBlockSetStoragePatched) {
    window.__chaiserBlockSetStoragePatched = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (key === STORAGE) {
        try {
          const data = JSON.parse(value);
          const config = configFrom(data);
          if (config) {
            originalSetItem.call(this, BLOCK_SET_BACKUP_KEY, JSON.stringify(config));
            originalSetItem.call(this, BLOCK_SET_META_KEY, JSON.stringify(config));
          }
        } catch (_) {}
      }
      return originalSetItem.call(this, key, value);
    };
  }

  const previousLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithReliableBlockSets(obj) {
    const imported = configFrom(obj);
    previousLoadObj(obj);
    const config = imported || savedConfig();
    if (config) applyBlockSetConfig(config);
    ensureExistingStageSetNames();
    persistReliable();
    if (typeof render === 'function') render();
  });
  setGlobal('saveLocal', persistReliable);
  setGlobal('saveJson', function saveJsonWithReliableBlockSets() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([JSON.stringify(fullPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = window.saveJson;

  // ---------------------------------------------------------------------------
  // マップ追加
  // ---------------------------------------------------------------------------
  function alphabetLabel(index) {
    let n = index + 1;
    let label = '';
    while (n > 0) {
      n -= 1;
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    return label;
  }
  function blankMapFor(stage) {
    const current = stage.maps?.[st.map] || stage.maps?.[0];
    const rows = Array.isArray(current?.rows) && current.rows.length ? current.rows : [];
    const height = Math.max(3, rows.length || 7);
    const width = Math.max(3, ...rows.map((row) => String(row).length), 7);
    let map;
    if (typeof makeBlankMap === 'function') map = makeBlankMap(width, height);
    else {
      const grid = Array.from({ length: height }, (_, y) => y === 0 || y === height - 1 ? '#'.repeat(width) : `#${'.'.repeat(width - 2)}#`);
      if (height >= 4 && width >= 4) {
        grid[1] = `${grid[1].slice(0, 1)}G${grid[1].slice(2)}`;
        grid[height - 2] = `${grid[height - 2].slice(0, width - 2)}C#`;
      }
      map = { label: '', rows: grid, note: '' };
    }
    map.label = `マップ ${alphabetLabel(stage.maps.length)}`;
    map.note = '';
    return map;
  }
  function addMap(stage) {
    stage.maps ||= [];
    stage.maps.push(blankMapFor(stage));
    stage.variants = stage.maps.length;
    st.map = stage.maps.length - 1;
    st.play = null;
    st.bot = null;
    persistReliable();
    renderMain();
    toast('マップを追加しました');
  }
  const validationRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithValidationAndMaps(stage) {
    validationRenderEdit(stage);
    const select = document.getElementById('map-sel');
    if (!select || document.getElementById('map-add-controls')) return;
    const controls = document.createElement('div');
    controls.id = 'map-add-controls';
    controls.className = 'controls';
    controls.innerHTML = '<button class="btn primary" type="button" id="map-add">＋ マップ追加</button><span class="hint">現在のマップと同じ大きさの空マップを追加します。</span>';
    const field = select.closest('.field');
    if (field) field.insertAdjacentElement('afterend', controls);
    else select.insertAdjacentElement('afterend', controls);
    document.getElementById('map-add').onclick = () => addMap(stage);
  });

  const existingConfig = savedConfig();
  if (existingConfig) applyBlockSetConfig(existingConfig);
  ensureExistingStageSetNames();
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => normalizeValidation(stage)));
  persistReliable();
  if (typeof render === 'function') render();
})();
