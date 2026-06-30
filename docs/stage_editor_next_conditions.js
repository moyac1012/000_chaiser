(() => {
  const CONDITIONS = [
    ['reachGoal', 'ゴールに到達'],
    ['collectItemsAndGoal', 'アイテムを N 個以上取得してゴール'],
    ['defeatEnemy', '敵を倒したらクリア'],
    ['survive', 'Nターンやられなければクリア'],
  ];
  const DELTA = { Up:{x:0,y:-1}, Down:{x:0,y:1}, Left:{x:-1,y:0}, Right:{x:1,y:0} };
  const BACKUP_KEY = `${STORAGE}:fullBackup`;
  const META_KEY = `${STORAGE}:blockSetMeta`;

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }
  function integer(value, fallback, min) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n >= min ? n : fallback;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function notice(text) { if (typeof msg === 'function') msg(text); }

  function conditionText(v) {
    if (v.kind === 'collectItemsAndGoal') return `items${v.minItems}+goal`;
    if (v.kind === 'defeatEnemy') return 'defeatEnemy';
    if (v.kind === 'survive') return `survive${v.minTurns}`;
    if (v.kind === 'collectItems') return `items${v.minItems}`;
    return v.requireAllItems ? 'goal+items' : 'goal';
  }
  function description(v) {
    const suffix = v.maxActions ? ` / 最大${v.maxActions}手` : '';
    if (v.kind === 'collectItemsAndGoal') return `アイテムを${v.minItems}個以上取得してゴール${suffix}`;
    if (v.kind === 'defeatEnemy') return `敵を倒したらクリア${suffix}`;
    if (v.kind === 'survive') return `${v.minTurns}ターンやられなければクリア${suffix}`;
    return `ゴールに到達${suffix}`;
  }
  function normalizeValidation(stage) {
    stage.play ||= {};
    const previous = stage.play.validation || {};
    const text = String(stage.cond || '').toLowerCase();
    let kind = previous.kind;
    if (!['reachGoal','collectItemsAndGoal','defeatEnemy','survive','collectItems','winByPut'].includes(kind)) {
      if (text.includes('survive')) kind = 'survive';
      else if (text.includes('enemy') || text.includes('defeat') || text.includes('put')) kind = 'defeatEnemy';
      else if (text.includes('items') && text.includes('goal')) kind = 'collectItemsAndGoal';
      else kind = 'reachGoal';
    }
    if (kind === 'winByPut') kind = 'defeatEnemy';
    if (kind === 'collectItems') kind = text.includes('goal') ? 'collectItemsAndGoal' : 'collectItems';
    const result = {
      kind,
      maxActions: integer(previous.maxActions, 0, 0) || null,
      minItems: integer(previous.minItems, 1, 1),
      minTurns: integer(previous.minTurns, 10, 1),
      requireAllItems: Boolean(previous.requireAllItems),
    };
    stage.play.validation = result;
    stage.cond = conditionText(result);
    return result;
  }
  function changeValidation(stage, patch) {
    const next = { ...normalizeValidation(stage), ...patch };
    next.maxActions = integer(next.maxActions, 0, 0) || null;
    next.minItems = integer(next.minItems, 1, 1);
    next.minTurns = integer(next.minTurns, 10, 1);
    stage.play.validation = next;
    stage.cond = conditionText(next);
    st.play = null;
    st.bot = null;
    if (typeof saveLocal === 'function') saveLocal();
  }

  const baseNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithConditions(stage, no) {
    baseNormStage(stage, no);
    normalizeValidation(stage);
  });

  function addConditionControls(stage) {
    const old = document.getElementById('f-cond')?.closest('.field');
    if (!old) return;
    const grid = old.parentElement;
    const validation = normalizeValidation(stage);
    const options = CONDITIONS.map(([value, label]) => `<option value="${value}" ${value === validation.kind ? 'selected' : ''}>${label}</option>`).join('');
    const numberControl = validation.kind === 'collectItemsAndGoal'
      ? `<div class="field"><label>必要アイテム数 N</label><input id="condition-items" type="number" min="1" step="1" value="${validation.minItems}"></div>`
      : validation.kind === 'survive'
        ? `<div class="field"><label>生存ターン数 N</label><input id="condition-turns" type="number" min="1" step="1" value="${validation.minTurns}"></div>`
        : `<div class="field"><label>条件の補足</label><div class="hint">${validation.kind === 'defeatEnemy' ? 'マップ上の敵 H の隣へブロックを置くと倒せます。' : 'ゴール G に到達するとクリアです。'}</div></div>`;
    const replacement = document.createElement('div');
    replacement.className = 'field';
    replacement.innerHTML = `<label>クリア条件</label><select id="condition-kind">${options}</select><div class="hint" id="condition-description" style="margin-top:4px">${description(validation)}</div>`;
    old.replaceWith(replacement);
    grid.insertAdjacentHTML('beforeend', `${numberControl}<div class="field"><label>手数制限（最大手数）</label><input id="condition-max" type="number" min="0" step="1" value="${validation.maxActions || ''}" placeholder="制限なし"><div class="hint">空欄または0なら制限なしです。</div></div>`);
    document.getElementById('condition-kind').onchange = (event) => {
      changeValidation(stage, { kind: event.target.value });
      renderEdit(stage);
    };
    const items = document.getElementById('condition-items');
    if (items) items.oninput = () => { changeValidation(stage, { minItems: integer(items.value, 1, 1) }); document.getElementById('condition-description').textContent = description(stage.play.validation); };
    const turns = document.getElementById('condition-turns');
    if (turns) turns.oninput = () => { changeValidation(stage, { minTurns: integer(turns.value, 10, 1) }); document.getElementById('condition-description').textContent = description(stage.play.validation); };
    const max = document.getElementById('condition-max');
    if (max) max.oninput = () => { changeValidation(stage, { maxActions: integer(max.value, 0, 0) || null }); document.getElementById('condition-description').textContent = description(stage.play.validation); };
  }

  // 保存データのブロックセット復元。通常保存、バックアップ、メタの順に確認する。
  function parse(key) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch (_) { return null; } }
  function extractConfig(data) {
    if (!data || typeof data !== 'object' || !data.blockSets || typeof data.blockSets !== 'object') return null;
    return {
      blockSets: data.blockSets,
      blockSetOrder: Array.isArray(data.blockSetOrder) ? data.blockSetOrder : Object.keys(data.blockSets),
      deletedBlockSets: Array.isArray(data.deletedBlockSets) ? data.deletedBlockSets : [],
    };
  }
  function storedConfig() {
    return extractConfig(parse(STORAGE)) || extractConfig(parse(BACKUP_KEY)) || extractConfig(parse(META_KEY));
  }
  function applyConfig(config) {
    if (!config) return false;
    const removed = new Set(config.deletedBlockSets || []);
    const names = [];
    const used = new Set();
    const add = (name) => {
      if (!name || used.has(name) || removed.has(name) || !Object.prototype.hasOwnProperty.call(config.blockSets, name)) return;
      used.add(name); names.push(name);
    };
    (config.blockSetOrder || []).forEach(add);
    Object.keys(config.blockSets).forEach(add);
    if (!names.length) return false;
    SETS.splice(0, SETS.length, ...names);
    Object.keys(BLOCK_SET_ALLOWED).forEach((name) => delete BLOCK_SET_ALLOWED[name]);
    st.blockSets = {};
    names.forEach((name) => {
      const seen = new Set();
      const blocks = Array.isArray(config.blockSets[name]) ? config.blockSets[name] : [];
      st.blockSets[name] = blocks.filter((block) => block !== 'chaser_on_start' && !seen.has(block) && (seen.add(block) || true));
      BLOCK_SET_ALLOWED[name] = [...st.blockSets[name]];
    });
    st.blockSetOrder = [...names];
    st.deletedBlockSets = [...removed];
    return true;
  }
  function ensureSetReferences() {
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
  function fullData() {
    ensureSetReferences();
    const names = [...SETS];
    const source = st.blockSets || BLOCK_SET_ALLOWED;
    const blockSets = {};
    names.forEach((name) => { blockSets[name] = Array.isArray(source[name]) ? [...source[name]] : []; });
    return { version: 2, blockSets, blockSetOrder: names, deletedBlockSets: [...(st.deletedBlockSets || [])], phases: st.phases || [] };
  }
  function persist() {
    const data = fullData();
    const config = { blockSets:data.blockSets, blockSetOrder:data.blockSetOrder, deletedBlockSets:data.deletedBlockSets };
    localStorage.setItem(STORAGE, JSON.stringify(data));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(config));
    localStorage.setItem(META_KEY, JSON.stringify(config));
  }
  if (!window.__chaserStorageBackupPatch) {
    window.__chaserStorageBackupPatch = true;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (key === STORAGE) {
        try {
          const config = extractConfig(JSON.parse(value));
          if (config) {
            originalSetItem.call(this, BACKUP_KEY, JSON.stringify(config));
            originalSetItem.call(this, META_KEY, JSON.stringify(config));
          }
        } catch (_) {}
      }
      return originalSetItem.call(this, key, value);
    };
  }

  const previousLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithConditions(data) {
    const imported = extractConfig(data);
    previousLoadObj(data);
    applyConfig(imported || storedConfig());
    ensureSetReferences();
    persist();
    render();
  });
  setGlobal('saveLocal', persist);
  setGlobal('saveJson', function saveJsonWithConditions() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([JSON.stringify(fullData(), null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `chaiser-stages-v2-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  });

  const baseRenderEdit = window.renderEdit || renderEdit;
  function mapLabel(index) {
    let n = index + 1, out = '';
    while (n > 0) { n -= 1; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
    return out;
  }
  function addMap(stage) {
    const current = stage.maps?.[st.map] || stage.maps?.[0];
    const rows = Array.isArray(current?.rows) ? current.rows : [];
    const height = Math.max(3, rows.length || 7);
    const width = Math.max(3, ...rows.map((row) => String(row).length), 7);
    const map = typeof makeBlankMap === 'function' ? makeBlankMap(width, height) : { rows:['#####','#G.C#','#####'], note:'' };
    map.label = `マップ ${mapLabel((stage.maps || []).length)}`;
    map.note = '';
    stage.maps ||= [];
    stage.maps.push(map);
    stage.variants = stage.maps.length;
    st.map = stage.maps.length - 1;
    st.play = null;
    st.bot = null;
    persist();
    renderMain();
    notice('マップを追加しました');
  }
  setGlobal('renderEdit', function renderEditWithConditionsAndMaps(stage) {
    normalizeValidation(stage);
    baseRenderEdit(stage);
    addConditionControls(stage);
    const selector = document.getElementById('map-sel');
    if (selector && !document.getElementById('map-add-controls')) {
      const controls = document.createElement('div');
      controls.id = 'map-add-controls';
      controls.className = 'controls';
      controls.innerHTML = '<button class="btn primary" type="button" id="map-add">＋ マップ追加</button><span class="hint">現在のマップと同じ大きさの空マップを追加します。</span>';
      selector.closest('.field')?.insertAdjacentElement('afterend', controls);
      document.getElementById('map-add').onclick = () => addMap(stage);
    }
  });

  const baseInitPlay = window.initPlay || initPlay;
  setGlobal('initPlay', function initPlayWithConditions(stage, index) {
    const play = baseInitPlay(stage, index);
    play.validation = { ...normalizeValidation(stage) };
    play.enemyDefeated = false;
    return play;
  });
  function inside(play, x, y) { return y >= 0 && y < play.tiles.length && x >= 0 && x < play.tiles[y].length; }
  function success(play, text) { play.status='success'; play.msg=text; play.logs.push(`成功: ${text}`); }
  setGlobal('judge', function judgeWithConditions() {
    const play = st.play;
    const v = play.validation || {kind:'reachGoal'};
    const atGoal = Boolean(play.goal && play.cool.x === play.goal.x && play.cool.y === play.goal.y);
    const remaining = play.tiles.reduce((sum,row) => sum + row.filter((cell) => cell === 'I').length, 0);
    if (v.kind === 'reachGoal' && atGoal) {
      if (v.requireAllItems && remaining > 0) play.msg = `アイテム未回収（残り${remaining}個）`;
      else { success(play, 'ゴール到達'); return; }
    }
    if (v.kind === 'collectItemsAndGoal' && atGoal && play.items >= v.minItems) { success(play, `アイテム${v.minItems}個以上取得してゴール`); return; }
    if (v.kind === 'defeatEnemy' && play.enemyDefeated) { success(play, '敵を倒した'); return; }
    if (v.kind === 'survive' && play.turn >= v.minTurns) { success(play, `${v.minTurns}ターン生存`); return; }
    if (v.maxActions && play.turn >= v.maxActions) { fail(`最大${v.maxActions}手を超過`); return; }
    if (v.kind === 'collectItemsAndGoal' && atGoal) play.msg = `アイテム不足（${play.items}/${v.minItems}個）`;
  });
  setGlobal('applyPending', function applyPendingWithConditions() {
    const play = st.play;
    const action = play.pending;
    play.turn++;
    if (!action) { play.logs.push(`${play.turn}: actionなし`); judge(); return; }
    if (action.kind === 'look' || action.kind === 'search') { play.logs.push(`${play.turn}: ${action.kind}${action.dir}`); judge(); return; }
    const d = DELTA[action.dir] || {x:0,y:0};
    const x = play.cool.x + d.x, y = play.cool.y + d.y;
    if (action.kind === 'walk') {
      if (!inside(play,x,y) || play.tiles[y][x] === '#') return fail(`壁: walk${action.dir}`);
      if (play.hot && play.hot.x === x && play.hot.y === y) return fail('敵にやられた');
      play.cool = {x,y};
      if (play.tiles[y][x] === 'I') { play.items++; play.tiles[y][x]='.'; play.logs.push(`${play.turn}: walk${action.dir} / item +1`); }
      else play.logs.push(`${play.turn}: walk${action.dir}`);
      judge(); return;
    }
    if (action.kind === 'put') {
      if (play.hot && play.hot.x === x && play.hot.y === y) {
        play.hot = null; play.enemyDefeated = true; play.logs.push(`${play.turn}: put${action.dir} / enemy defeated`); judge(); return;
      }
      if (inside(play,x,y) && play.tiles[y][x] === '.') play.tiles[y][x] = '#';
      play.logs.push(`${play.turn}: put${action.dir}`);
      judge();
    }
  });

  const initial = storedConfig();
  if (initial) applyConfig(initial);
  ensureSetReferences();
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeValidation));
  persist();
  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = window.saveJson;
  render();

  const exportToggle = document.createElement('script');
  exportToggle.src = './stage_editor_next_export_toggle.js';
  exportToggle.async = false;
  document.body.appendChild(exportToggle);
})();
