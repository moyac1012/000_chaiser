(() => {
  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function fallbackXml() {
    return '<xml xmlns="https://developers.google.com/blockly/xml"><block type="chaser_hot_on_turn" x="24" y="24"><statement name="DO"><block type="chaser_hot_turn_end"></block></statement></block></xml>';
  }

  function syncHotState(stage) {
    if (!stage || typeof stage !== 'object') return { enabled: false, savedBlocklyXml: fallbackXml() };
    const raw = stage.hotBehavior && typeof stage.hotBehavior === 'object' ? stage.hotBehavior : {};
    const enabled = typeof stage.hotEnabled === 'boolean' ? stage.hotEnabled : Boolean(raw.enabled);
    stage.hotEnabled = enabled;
    stage.hotBehavior = {
      enabled,
      savedBlocklyXml: typeof raw.savedBlocklyXml === 'string' && raw.savedBlocklyXml.trim() ? raw.savedBlocklyXml : fallbackXml(),
    };
    return stage.hotBehavior;
  }

  function syncAllHotStates() {
    (st.phases || []).forEach((phase) => {
      (phase.stages || []).forEach(syncHotState);
    });
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithStableHotState(stage, no) {
    previousNormStage(stage, no);
    syncHotState(stage);
  });

  const previousSaveLocal = window.saveLocal || saveLocal;
  setGlobal('saveLocal', function saveLocalWithStableHotState() {
    syncAllHotStates();
    return previousSaveLocal();
  });

  const previousLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithStableHotState(data) {
    previousLoadObj(data);
    syncAllHotStates();
    if (typeof saveLocal === 'function') saveLocal();
  });

  const previousRenderMain = window.renderMain || renderMain;
  setGlobal('renderMain', function renderMainWithStableHotState(...args) {
    const result = previousRenderMain(...args);
    if (st.tab !== 'hot') return result;

    const stage = curStage();
    if (!stage) return result;
    const behavior = syncHotState(stage);
    const checkbox = document.getElementById('hot-enabled');
    if (!checkbox) return result;

    checkbox.checked = behavior.enabled;
    checkbox.onchange = (event) => {
      const enabled = Boolean(event.target.checked);
      stage.hotEnabled = enabled;
      syncHotState(stage).enabled = enabled;
      stage.hotBehavior.enabled = enabled;
      st.hotBot = null;
      st.hotBotPlay = null;
      if (typeof saveLocal === 'function') saveLocal();
      if (typeof msg === 'function') msg(enabled ? 'HOTの行動プログラムを有効にしました' : 'HOTの行動プログラムを無効にしました');
    };
    return result;
  });

  syncAllHotStates();
  if (typeof render === 'function') render();
})();
