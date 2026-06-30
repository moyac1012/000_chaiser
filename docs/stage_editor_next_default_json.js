(() => {
  const DEFAULT_JSON_URL = './data/default-stages.json';
  const LEGACY_REVIEW_URL = './stage_review.html';

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function globalValue(name, fallback) {
    try {
      const value = Function(`return typeof ${name} !== 'undefined' ? ${name} : undefined`)();
      return value === undefined ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function buildDefaultPayload() {
    const names = Array.isArray(globalValue('SETS', [])) ? [...globalValue('SETS', [])] : [];
    const allowed = globalValue('BLOCK_SET_ALLOWED', {});
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : allowed;
    const blockSets = {};
    names.forEach((name) => {
      blockSets[name] = Array.isArray(source?.[name]) ? [...source[name]] : [];
    });
    return {
      version: 2,
      blockSets,
      blockSetOrder: names,
      deletedBlockSets: Array.isArray(st.deletedBlockSets) ? [...st.deletedBlockSets] : [],
      phases: clone(st.phases || []),
    };
  }

  function downloadDefaultJson() {
    if (typeof saveXml === 'function') saveXml();
    const text = JSON.stringify(buildDefaultPayload(), null, 2);
    const blob = new Blob([text], { type: 'application/json' });
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
    button.onclick = downloadDefaultJson;
    const before = document.getElementById('clear-local');
    toolbar.insertBefore(button, before || null);
  }

  function cacheBustedUrl(url) {
    return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  }

  async function fetchJson(url) {
    const response = await fetch(cacheBustedUrl(url), { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function loadStagesFromReviewHtml() {
    const response = await fetch(cacheBustedUrl(LEGACY_REVIEW_URL), { cache: 'no-store' });
    if (!response.ok) throw new Error(`review HTML: ${response.status}`);
    const html = await response.text();
    const marker = 'const PHASES = ';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error('review HTMLにPHASESがありません');
    const bodyStart = start + marker.length;
    const endings = [
      ';\nconst BLOCK_SETS_INFO',
      ';\nconst esc=',
      ';\nconst esc =',
    ].map((ending) => html.indexOf(ending, bodyStart)).filter((index) => index >= 0);
    const end = endings.length ? Math.min(...endings) : -1;
    if (end < 0) throw new Error('review HTMLのPHASES終端が見つかりません');
    const phases = JSON.parse(html.slice(bodyStart, end));
    if (!Array.isArray(phases) || phases.length === 0) throw new Error('review HTMLのフェーズが空です');
    return { version: 2, phases };
  }

  async function loadRepositoryDefault() {
    let payload = null;
    let usedReviewFallback = false;
    try {
      const candidate = await fetchJson(DEFAULT_JSON_URL);
      if (candidate?.defaultPlaceholder || !Array.isArray(candidate?.phases) || candidate.phases.length === 0) {
        throw new Error('default JSON is not set');
      }
      payload = candidate;
    } catch (_) {
      payload = await loadStagesFromReviewHtml();
      usedReviewFallback = true;
    }

    loadObj(payload);
    if (typeof msg === 'function') {
      msg(usedReviewFallback ? '既定JSONを読み込みました（移行前データを使用中）' : '既定JSONを読み込みました');
    }
  }

  function hasUsableLocalStages() {
    const storageKey = globalValue('STORAGE', 'chaiserStageBlockly');
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      return Array.isArray(saved?.phases) && saved.phases.length > 0;
    } catch (_) {
      return false;
    }
  }

  setGlobal('loadDefault', async function loadDefaultFromRepository() {
    try {
      await loadRepositoryDefault();
    } catch (error) {
      console.error(error);
      if (typeof msg === 'function') msg('既定JSON読込に失敗しました。default-stages.json を登録してください');
    }
  });

  const defaultButton = document.getElementById('load-default');
  if (defaultButton) defaultButton.onclick = () => window.loadDefault();
  addDefaultExportButton();

  if (!hasUsableLocalStages() && !window.__chaserDefaultAutoLoadStarted) {
    window.__chaserDefaultAutoLoadStarted = true;
    window.loadDefault();
  }

  window.chaserDefaultJson = {
    path: 'docs/data/default-stages.json',
    download: downloadDefaultJson,
    payload: buildDefaultPayload,
  };
})();
