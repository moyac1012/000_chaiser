(() => {
  const DELETED_KEY = `${STORAGE}:deletedBlockSets`;
  const STANDARD_SET_NAMES = ['BASIC', 'CHECK', 'STATE', 'LOOK', 'SEARCH', 'ENEMY', 'COUNT'];

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function getDeletedNames() {
    try {
      const value = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.filter((name) => typeof name === 'string') : []);
    } catch (_) {
      return new Set();
    }
  }

  function saveDeletedNames(names) {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...names]));
  }

  function countStagesUsing(name) {
    return (st.phases || []).reduce((count, phase) => count + (phase.stages || []).filter((stage) => stage.blockSet === name).length, 0);
  }

  function chooseReplacement(name) {
    const index = SETS.indexOf(name);
    if (SETS.includes('BASIC') && name !== 'BASIC') return 'BASIC';
    return SETS[index + 1] || SETS[index - 1] || null;
  }

  function saveEditorData() {
    const sets = st.blockSets || Object.fromEntries(SETS.map((name) => [name, Array.isArray(BLOCK_SET_ALLOWED[name]) ? [...BLOCK_SET_ALLOWED[name]] : []]));
    const deletedBlockSets = [...getDeletedNames()];
    localStorage.setItem(STORAGE, JSON.stringify({
      version: 2,
      blockSets: sets,
      blockSetOrder: [...SETS],
      deletedBlockSets,
      phases: st.phases || [],
    }));
  }

  function applyDeletedNames(names) {
    const deleted = names instanceof Set ? names : new Set(names || []);
    let changed = false;
    [...deleted].forEach((name) => {
      const index = SETS.indexOf(name);
      if (index < 0) return;
      if (SETS.length <= 1) return;
      const replacement = chooseReplacement(name);
      if (!replacement) return;
      SETS.splice(index, 1);
      if (st.blockSets) delete st.blockSets[name];
      delete BLOCK_SET_ALLOWED[name];
      (st.phases || []).forEach((phase) => {
        (phase.stages || []).forEach((stage) => {
          if (stage.blockSet === name) stage.blockSet = replacement;
        });
      });
      if (st.blockSetEdit === name) st.blockSetEdit = replacement;
      changed = true;
    });
    st.blockSetOrder = [...SETS];
    return changed;
  }

  function deleteBlockSet() {
    const name = st.blockSetEdit;
    if (!name || !SETS.includes(name)) return;
    if (SETS.length <= 1) {
      alert('最後のブロックセットは削除できません');
      return;
    }
    const replacement = chooseReplacement(name);
    if (!replacement) {
      alert('代替となるブロックセットがありません');
      return;
    }
    const usedCount = countStagesUsing(name);
    const message = usedCount > 0
      ? `ブロックセット「${name}」を削除しますか？\n\n使用中の ${usedCount} ステージは「${replacement}」へ変更されます。`
      : `ブロックセット「${name}」を削除しますか？\n\nステージで使用されていません。`;
    if (!confirm(message)) return;

    const index = SETS.indexOf(name);
    SETS.splice(index, 1);
    if (st.blockSets) delete st.blockSets[name];
    delete BLOCK_SET_ALLOWED[name];
    (st.phases || []).forEach((phase) => {
      (phase.stages || []).forEach((stage) => {
        if (stage.blockSet === name) stage.blockSet = replacement;
      });
    });
    st.blockSetEdit = replacement;
    st.blockSetOrder = [...SETS];

    const deleted = getDeletedNames();
    deleted.add(name);
    saveDeletedNames(deleted);
    saveEditorData();
    render();
    if (typeof msg === 'function') msg('ブロックセットを削除しました');
  }

  function decorateBlockSetTab() {
    if (st.tab !== 'blocksets') return;
    const renameButton = document.getElementById('bs-rename');
    if (!renameButton || document.getElementById('bs-delete')) return;
    const button = document.createElement('button');
    button.id = 'bs-delete';
    button.className = 'btn danger';
    button.type = 'button';
    button.textContent = '削除';
    button.title = '選択中のブロックセットを削除';
    button.disabled = SETS.length <= 1;
    renameButton.insertAdjacentElement('afterend', button);
    button.onclick = deleteBlockSet;
  }

  function installObserver() {
    const main = document.getElementById('main');
    if (!main) return;
    const observer = new MutationObserver(() => {
      requestAnimationFrame(decorateBlockSetTab);
    });
    observer.observe(main, { childList: true, subtree: true });
    decorateBlockSetTab();
  }

  function prepareDeletedSetsFromImportedData(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.deletedBlockSets)) {
      saveDeletedNames(new Set(data.deletedBlockSets));
      return;
    }
    if (data.blockSets && typeof data.blockSets === 'object') {
      const declared = new Set(Object.keys(data.blockSets));
      const deleted = new Set(STANDARD_SET_NAMES.filter((name) => !declared.has(name)));
      saveDeletedNames(deleted);
    }
  }

  const previousLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithDeletedBlockSets(data) {
    prepareDeletedSetsFromImportedData(data);
    previousLoadObj(data);
    const deleted = getDeletedNames();
    if (applyDeletedNames(deleted)) {
      saveEditorData();
      render();
    }
  });

  const saveButton = document.getElementById('save-json');
  if (saveButton) {
    saveButton.onclick = () => {
      if (typeof saveXml === 'function') saveXml();
      const sets = st.blockSets || Object.fromEntries(SETS.map((name) => [name, Array.isArray(BLOCK_SET_ALLOWED[name]) ? [...BLOCK_SET_ALLOWED[name]] : []]));
      const data = {
        version: 2,
        blockSets: sets,
        blockSetOrder: [...SETS],
        deletedBlockSets: [...getDeletedNames()],
        phases: st.phases || [],
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    };
  }

  document.addEventListener('click', (event) => {
    if (event.target && event.target.id === 'bs-add') {
      setTimeout(() => {
        const deleted = getDeletedNames();
        [...deleted].forEach((name) => {
          if (SETS.includes(name)) deleted.delete(name);
        });
        saveDeletedNames(deleted);
        saveEditorData();
      }, 0);
    }
  });

  const initiallyDeleted = getDeletedNames();
  if (applyDeletedNames(initiallyDeleted)) saveEditorData();
  installObserver();
})();
