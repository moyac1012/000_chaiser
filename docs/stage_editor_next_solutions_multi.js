(() => {
  const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const MAX_FILE_BYTES = 3 * 1024 * 1024;

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function newId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `solution-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function emptyLegacySolution(stage) {
    stage.solution ||= {};
    stage.solution.imageDataUrl = '';
    stage.solution.imageName = '';
    stage.solution.imageMimeType = '';
    stage.solution.note = '';
    stage.solution.updatedAt = '';
  }

  function normalizeSolutions(stage) {
    if (!stage || typeof stage !== 'object') return [];
    stage.solutions = Array.isArray(stage.solutions) ? stage.solutions : [];
    stage.solutions = stage.solutions
      .filter((item) => item && typeof item.imageDataUrl === 'string' && item.imageDataUrl.startsWith('data:image/'))
      .map((item) => ({
        id: item.id || newId(),
        imageDataUrl: item.imageDataUrl,
        imageName: String(item.imageName || 'solution-image'),
        imageMimeType: String(item.imageMimeType || 'image/png'),
        note: String(item.note || ''),
        updatedAt: String(item.updatedAt || ''),
      }));

    const legacy = stage.solution;
    if (legacy?.imageDataUrl?.startsWith('data:image/') && !stage.solutions.some((item) => item.imageDataUrl === legacy.imageDataUrl)) {
      stage.solutions.push({
        id: newId(),
        imageDataUrl: legacy.imageDataUrl,
        imageName: String(legacy.imageName || '既存の模範解答'),
        imageMimeType: String(legacy.imageMimeType || 'image/png'),
        note: String(legacy.note || ''),
        updatedAt: String(legacy.updatedAt || new Date().toISOString()),
      });
      emptyLegacySolution(stage);
    }
    return stage.solutions;
  }

  function persist(stage, rollback) {
    try {
      if (typeof saveLocal === 'function') saveLocal();
      return true;
    } catch (error) {
      rollback?.();
      try { if (typeof saveLocal === 'function') saveLocal(); } catch (_) {}
      if (typeof msg === 'function') msg('保存容量が不足しています。画像を小さくしてから追加してください');
      console.error(error);
      return false;
    }
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  function solutionCard(solution, index) {
    return `<article class="solution-card" data-solution-id="${escapeHtml(solution.id)}">
      <div class="solution-card-head"><strong>模範解答 ${index + 1}</strong><button type="button" class="btn danger solution-delete" data-solution-id="${escapeHtml(solution.id)}">削除</button></div>
      <img class="solution-image" src="${solution.imageDataUrl}" alt="模範解答 ${index + 1}">
      <div class="hint">${escapeHtml(solution.imageName || 'image')}</div>
      <div class="field"><label>メモ</label><textarea class="solution-note" data-solution-id="${escapeHtml(solution.id)}">${escapeHtml(solution.note || '')}</textarea></div>
    </article>`;
  }

  function renderSolutionList(stage, container) {
    const solutions = normalizeSolutions(stage);
    if (!solutions.length) {
      container.innerHTML = '<div class="empty">模範解答はまだ登録されていません</div>';
      return;
    }
    container.innerHTML = `<div class="solution-grid">${solutions.map(solutionCard).join('')}</div>`;
    container.querySelectorAll('.solution-note').forEach((textarea) => {
      textarea.oninput = () => {
        const item = normalizeSolutions(stage).find((solution) => solution.id === textarea.dataset.solutionId);
        if (!item) return;
        item.note = textarea.value;
        item.updatedAt = new Date().toISOString();
        persist(stage);
      };
    });
    container.querySelectorAll('.solution-delete').forEach((button) => {
      button.onclick = () => {
        const solutionsNow = normalizeSolutions(stage);
        const index = solutionsNow.findIndex((solution) => solution.id === button.dataset.solutionId);
        if (index < 0) return;
        if (!confirm(`模範解答 ${index + 1} を削除しますか？`)) return;
        const removed = solutionsNow.splice(index, 1)[0];
        if (!persist(stage, () => solutionsNow.splice(index, 0, removed))) return;
        renderSolution(stage);
        if (typeof msg === 'function') msg('模範解答を削除しました');
      };
    });
  }

  async function addFiles(stage, files) {
    const candidates = Array.from(files || []);
    let added = 0;
    for (const file of candidates) {
      if (!IMAGE_TYPES.has(file.type)) {
        if (typeof msg === 'function') msg(`${file.name}: PNG / JPEG / WebP を選択してください`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        if (typeof msg === 'function') msg(`${file.name}: 1画像あたり3MB以下にしてください`);
        continue;
      }
      try {
        const imageDataUrl = await readFile(file);
        const solution = {
          id: newId(),
          imageDataUrl,
          imageName: file.name,
          imageMimeType: file.type,
          note: '',
          updatedAt: new Date().toISOString(),
        };
        const list = normalizeSolutions(stage);
        list.push(solution);
        if (!persist(stage, () => list.pop())) break;
        added += 1;
      } catch (error) {
        console.error(error);
        if (typeof msg === 'function') msg(`${file.name}: 読み込みに失敗しました`);
      }
    }
    renderSolution(stage);
    if (added && typeof msg === 'function') msg(`${added}件の模範解答を追加しました`);
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithMultipleSolutions(stage, no) {
    previousNormStage(stage, no);
    normalizeSolutions(stage);
  });

  setGlobal('renderSolution', function renderMultipleSolutions(stage) {
    normalizeSolutions(stage);
    const body = document.getElementById('body');
    if (!body) return;
    body.innerHTML = `<div class="panel solution-upload-panel">
      <div class="section" style="margin-top:0">模範解答</div>
      <div class="field"><label>模範解答画像を追加</label><input type="file" id="solution-files" accept="image/png,image/jpeg,image/webp" multiple><div class="hint">PNG / JPEG / WebP。1画像あたり3MB以下。複数選択・複数回の追加に対応しています。</div></div>
    </div><div id="solution-list" style="margin-top:12px"></div>`;
    const input = document.getElementById('solution-files');
    input.onchange = async () => {
      await addFiles(stage, input.files);
      input.value = '';
    };
    renderSolutionList(stage, document.getElementById('solution-list'));
  });

  function hotProgramText(xml) {
    if (!xml) return 'HOTの行動プログラムは未設定です。';
    const labels = {
      chaser_hot_on_turn: 'HOTの毎ターン', chaser_hot_turn_end: 'HOTのターンを終える',
      chaser_hot_walk: 'HOTが歩く', chaser_hot_walk_last: 'HOTが前に進んだ向きで歩く',
      chaser_hot_walk_random: 'HOTがどこかに歩く', chaser_hot_put: 'HOTがブロックを置く',
      chaser_hot_is_tile: 'HOTの方向のマス判定', chaser_hot_get_tile: 'HOTの方向のマス', controls_if: 'もし',
    };
    const dirs = { Up: '↑ 上', Down: '↓ 下', Left: '← 左', Right: '→ 右' };
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('parse error');
      return Array.from(doc.querySelectorAll('block')).map((block) => {
        const type = block.getAttribute('type') || '';
        const direction = Array.from(block.children).find((node) => node.tagName === 'field' && node.getAttribute('name') === 'DIR')?.textContent;
        return `${labels[type] || type}${dirs[direction] ? ` ${dirs[direction]}` : ''}`;
      }).join('\n') || 'HOTの行動プログラムは未設定です。';
    } catch (_) {
      return 'HOTの行動プログラムを読み取れませんでした。';
    }
  }

  function reviewPayloadWithSolutions() {
    let number = 1;
    const phases = (st.phases || []).map((phase) => {
      const stages = (phase.stages || []).filter((stage) => stage?.includeInExport !== false).map((stage) => ({
        no: number++,
        id: stage.id || '',
        title: stage.title || '無題ステージ',
        blockSet: stage.blockSet || 'BASIC',
        variants: Number(stage.variants) || (stage.maps || []).length || 1,
        cond: stage.cond || '',
        difficulty: Number(stage.difficulty) || 0,
        goal: stage.goal || '',
        rule: stage.rule || '',
        maps: copy(stage.maps || []),
        hotEnabled: Boolean(stage.hotEnabled || stage.hotBehavior?.enabled),
        hotProgram: Boolean(stage.hotEnabled || stage.hotBehavior?.enabled) ? hotProgramText(stage.hotBehavior?.savedBlocklyXml || '') : '',
        solutions: copy(normalizeSolutions(stage)),
      }));
      return { id: phase.id || '–', name: phase.name || '無題', range: phase.range || '', color: phase.color || '#64748b', bg: phase.bg || '#f1f5f9', desc: phase.desc || '', stages };
    }).filter((phase) => phase.stages.length);

    const order = Array.isArray(window.SETS) ? [...window.SETS] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : (window.BLOCK_SET_ALLOWED || {});
    const blockSets = {};
    [...order, ...Object.keys(source || {}).filter((name) => !order.includes(name))].forEach((name) => {
      blockSets[name] = Array.isArray(source?.[name]) ? [...source[name]] : [];
    });
    return { phases, blockSetOrder: Object.keys(blockSets), blockSets };
  }

  function reviewSolutionMarkup() {
    return `<style>
.solution-review{margin-top:12px;padding-top:12px;border-top:1px solid #dbe3ee}.solution-review-title{font-size:9px;font-weight:900;letter-spacing:.16em;color:#94a3b8;margin-bottom:7px}.solution-review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.solution-review-card{border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;padding:8px}.solution-review-card img{display:block;width:100%;max-height:240px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:7px}.solution-review-name{font-size:10px;font-weight:800;color:#334155;margin-top:6px;overflow-wrap:anywhere}.solution-review-note{font-size:11px;color:#475569;white-space:pre-wrap;margin-top:3px}
</style><script>(() => {const source=document.getElementById('review-data');if(!source)return;const data=JSON.parse(source.textContent);const stages=(data.phases||[]).flatMap((phase)=>phase.stages||[]);const cards=[...document.querySelectorAll('.stage')];stages.forEach((stage,index)=>{const solutions=Array.isArray(stage.solutions)?stage.solutions.filter((item)=>item&&item.imageDataUrl):[];if(!solutions.length)return;const body=cards[index]?.querySelector('.stage-body');if(!body)return;const section=document.createElement('section');section.className='solution-review';const title=document.createElement('div');title.className='solution-review-title';title.textContent='模範解答';const grid=document.createElement('div');grid.className='solution-review-grid';solutions.forEach((solution,solutionIndex)=>{const card=document.createElement('article');card.className='solution-review-card';const image=document.createElement('img');image.src=solution.imageDataUrl;image.alt='模範解答 '+(solutionIndex+1);const name=document.createElement('div');name.className='solution-review-name';name.textContent=solution.imageName||('模範解答 '+(solutionIndex+1));card.append(image,name);if(solution.note){const note=document.createElement('div');note.className='solution-review-note';note.textContent=solution.note;card.appendChild(note)}grid.appendChild(card)});section.append(title,grid);body.appendChild(section)});})();<\/script>`;
  }

  const baseReviewHtml = window.reviewHtml;
  setGlobal('reviewHtml', function reviewHtmlWithSolutions(data) {
    const html = baseReviewHtml(data);
    return html.replace('</body>', `${reviewSolutionMarkup()}</body>`);
  });

  setGlobal('exportReview', function exportReviewWithSolutions() {
    if (typeof saveXml === 'function') saveXml();
    const html = window.reviewHtml(reviewPayloadWithSolutions());
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stage_review.html';
    anchor.click();
    URL.revokeObjectURL(url);
  });

  const reviewButton = document.getElementById('export-review');
  if (reviewButton) reviewButton.onclick = window.exportReview;

  const style = document.createElement('style');
  style.textContent = `.solution-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.solution-card{background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:12px}.solution-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.solution-image{width:100%;max-height:460px;object-fit:contain;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;display:block}.solution-upload-panel{margin-bottom:0}`;
  document.head.appendChild(style);

  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeSolutions));
  if (typeof render === 'function') render();
})();
