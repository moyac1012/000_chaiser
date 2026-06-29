(() => {
  const DEFAULT_SET_ORDER = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function blockSetsFromState() {
    const result = {};
    const source = st.blockSets || {};
    const names = [...SETS];
    names.forEach((name) => {
      if (Array.isArray(source[name])) result[name] = [...source[name]];
      else if (typeof BLOCK_SET_ALLOWED !== 'undefined' && Array.isArray(BLOCK_SET_ALLOWED[name])) result[name] = [...BLOCK_SET_ALLOWED[name]];
      else result[name] = [];
    });
    return result;
  }

  function normalizeOrder(order, blockSets) {
    const candidates = [];
    if (Array.isArray(order)) candidates.push(...order);
    candidates.push(...SETS, ...DEFAULT_SET_ORDER, ...Object.keys(blockSets || {}));
    const known = new Set(Object.keys(blockSets || {}).concat(SETS));
    const used = new Set();
    return candidates.filter((name) => {
      if (typeof name !== 'string' || !name || used.has(name) || !known.has(name)) return false;
      used.add(name);
      return true;
    });
  }

  function applyOrder(order, blockSets) {
    const normalized = normalizeOrder(order, blockSets || blockSetsFromState());
    SETS.splice(0, SETS.length, ...normalized);
    st.blockSetOrder = [...normalized];
    return normalized;
  }

  function payloadWithOrder() {
    const blockSets = blockSetsFromState();
    const order = applyOrder(st.blockSetOrder || SETS, blockSets);
    return { version: 2, blockSets, blockSetOrder: [...order], phases: st.phases || [] };
  }

  const originalStorageSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (key === STORAGE) {
      try {
        const data = JSON.parse(value);
        if (data && typeof data === 'object') {
          const sets = data.blockSets || blockSetsFromState();
          data.blockSets = sets;
          data.blockSetOrder = applyOrder(st.blockSetOrder || SETS, sets);
          value = JSON.stringify(data);
        }
      } catch (_) {}
    }
    return originalStorageSetItem.call(this, key, value);
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    if (saved.blockSets && typeof saved.blockSets === 'object') {
      Object.keys(saved.blockSets).forEach((name) => {
        if (!SETS.includes(name)) SETS.push(name);
      });
    }
    applyOrder(saved.blockSetOrder, saved.blockSets);
  } catch (_) {
    applyOrder(SETS, {});
  }

  function moveSelectedBlockSet(direction) {
    const selected = st.blockSetEdit;
    const index = SETS.indexOf(selected);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= SETS.length) return;
    [SETS[index], SETS[target]] = [SETS[target], SETS[index]];
    st.blockSetOrder = [...SETS];
    localStorage.setItem(STORAGE, JSON.stringify(payloadWithOrder()));
    if (typeof renderMain === 'function') renderMain();
    if (typeof msg === 'function') msg('ブロックセットの順序を変更しました');
  }

  function addOrderButtons() {
    if (st.tab !== 'blocksets') return;
    const select = document.getElementById('bs-select');
    if (!select || document.getElementById('bs-order-controls')) return;
    const box = document.createElement('div');
    box.id = 'bs-order-controls';
    box.className = 'controls';
    box.style.margin = '6px 0 0';
    box.innerHTML = '<button class="btn" id="bs-order-up" title="上へ移動">▲ 上へ</button><button class="btn" id="bs-order-down" title="下へ移動">▼ 下へ</button>';
    select.parentElement.appendChild(box);
    document.getElementById('bs-order-up').onclick = () => moveSelectedBlockSet(-1);
    document.getElementById('bs-order-down').onclick = () => moveSelectedBlockSet(1);
    const current = SETS.indexOf(st.blockSetEdit);
    document.getElementById('bs-order-up').disabled = current <= 0;
    document.getElementById('bs-order-down').disabled = current < 0 || current >= SETS.length - 1;
  }

  function installAfterDynamicBlockSetScript() {
    const previousRenderMain = window.renderMain || renderMain;
    setGlobal('renderMain', function renderMainWithBlockSetOrder() {
      previousRenderMain();
      requestAnimationFrame(addOrderButtons);
    });

    const previousLoadObj = window.loadObj || loadObj;
    setGlobal('loadObj', function loadObjWithBlockSetOrder(obj) {
      if (obj && obj.blockSets && typeof obj.blockSets === 'object') {
        Object.keys(obj.blockSets).forEach((name) => {
          if (!SETS.includes(name)) SETS.push(name);
        });
      }
      applyOrder(obj && obj.blockSetOrder, obj && obj.blockSets);
      previousLoadObj(obj);
      applyOrder(obj && obj.blockSetOrder, obj && obj.blockSets);
    });

    const saveButton = document.getElementById('save-json');
    if (saveButton) {
      saveButton.onclick = () => {
        if (typeof saveXml === 'function') saveXml();
        const data = JSON.stringify(payloadWithOrder(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      };
    }

    if (typeof render === 'function') render();
  }

  setTimeout(installAfterDynamicBlockSetScript, 0);
})();
