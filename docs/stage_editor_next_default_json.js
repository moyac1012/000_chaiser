(() => {
  const DEFAULT_JSON_URL = './data/default-stages.json';
  const LEGACY_REVIEW_URL = './stage_review.html';

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function getGlobal(name, fallback) {
    try {
      const value = Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)();
      return value === undefined ? fallback : value;
    } catch (_) { return fallback; }
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function defaultPayload() {
    const order = Array.isArray(getGlobal('SETS', [])) ? [...getGlobal('SETS', [])] : [];
    const fallbackSets = getGlobal('BLOCK_SET_ALLOWED', {});
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : fallbackSets;
    const blockSets = {};
    order.forEach((name) => { blockSets[name] = Array.isArray(source?.[name]) ? [...source[name]] : []; });
    return {
      version: 2,
      blockSets,
      blockSetOrder: order,
      deletedBlockSets: Array.isArray(st.deletedBlockSets) ? [...st.deletedBlockSets] : [],
      phases: copy(st.phases || []),
    };
  }

  function saveDefaultJson() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([JSON.stringify(defaultPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'default-stages.json';
    anchor.click();
    URL.revokeObjectURL(url);
    if (typeof msg === 'function') msg('default-stages.json を保存しました');
  }

  function addDefaultExportButton() {
    if (document.getElementById('save-default-json')) return;
    const toolbar = document.querySelector('.head .right');
    if (!toolbar) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'save-default-json';
    button.className = 'btn warn';
    button.textContent = '既定JSONとして書出し';
    button.title = 'GitHubの docs/data/default-stages.json を置き換えるためのJSONを保存します';
    button.onclick = saveDefaultJson;
    toolbar.insertBefore(button, document.getElementById('clear-local') || null);
  }

  function noCache(url) { return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`; }

  async function fetchJson(url) {
    const response = await fetch(noCache(url), { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function legacyReviewData() {
    const response = await fetch(noCache(LEGACY_REVIEW_URL), { cache: 'no-store' });
    if (!response.ok) throw new Error(`review HTML: ${response.status}`);
    const html = await response.text();
    const marker = 'const PHASES = ';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error('review HTMLにPHASESがありません');
    const bodyStart = start + marker.length;
    const end = [';\nconst BLOCK_SETS_INFO', ';\nconst esc=', ';\nconst esc =']
      .map((ending) => html.indexOf(ending, bodyStart))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0];
    if (end === undefined) throw new Error('review HTMLのPHASES終端が見つかりません');
    const phases = JSON.parse(html.slice(bodyStart, end));
    if (!Array.isArray(phases) || !phases.length) throw new Error('review HTMLのフェーズが空です');
    return { version: 2, phases };
  }

  async function repositoryDefault() {
    try {
      const data = await fetchJson(DEFAULT_JSON_URL);
      if (data?.defaultPlaceholder || !Array.isArray(data?.phases) || !data.phases.length) throw new Error('default not set');
      return { data, fallback: false };
    } catch (_) {
      return { data: await legacyReviewData(), fallback: true };
    }
  }

  function hasLocalStages() {
    const key = getGlobal('STORAGE', 'chaiserStageBlockly');
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(saved?.phases) && saved.phases.length > 0;
    } catch (_) { return false; }
  }

  setGlobal('loadDefault', async function loadDefaultFromRepository() {
    try {
      const result = await repositoryDefault();
      loadObj(result.data);
      if (typeof msg === 'function') msg(result.fallback ? '既定JSONを読み込みました（移行前データを使用中）' : '既定JSONを読み込みました');
    } catch (error) {
      console.error(error);
      if (typeof msg === 'function') msg('既定JSON読込に失敗しました。default-stages.json を登録してください');
    }
  });

  function autoLoadInitialStages() {
    if (!hasLocalStages() && !window.__chaserDefaultAutoLoadStarted) {
      window.__chaserDefaultAutoLoadStarted = true;
      window.loadDefault();
    }
  }

  function loadScript(src) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    });
  }

  const defaultButton = document.getElementById('load-default');
  if (defaultButton) defaultButton.onclick = () => window.loadDefault();
  addDefaultExportButton();
  window.chaserDefaultJson = { path: 'docs/data/default-stages.json', download: saveDefaultJson, payload: defaultPayload };

  (async () => {
    await loadScript('./stage_editor_next_hot_competition.js');
    await loadScript('./stage_editor_next_review_details_fix.js');
    await loadScript('./stage_editor_next_map_delete.js');
    await loadScript('./stage_editor_next_variable_runtime_fix.js');
    autoLoadInitialStages();
  })();
})();
