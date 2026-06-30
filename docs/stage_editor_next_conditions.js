(() => {
  const CONDITION_OPTIONS = [
    ['reachGoal', 'ゴールに到達'],
    ['collectItemsAndGoal', 'アイテムを N 個以上取得してゴール'],
    ['defeatEnemy', '敵を倒したらクリア'],
    ['survive', 'Nターンやられなければクリア'],
  ];
  const DELTA = {
    Up: { x: 0, y: -1 },
    Down: { x: 0, y: 1 },
    Left: { x: -1, y: 0 },
    Right: { x: 1, y: 0 },
  };

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
    if (kind === 'collectItems') {
      kind = legacy.includes('goal') ? 'collectItemsAndGoal' : 'collectItems';
    }

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
    const needsItems = validation.kind === 'collectItemsAndGoal' || validation.kind === 'collectItems';
    const needsTurns = validation.kind === 'survive';
    const extraHtml = needsItems
      ? `<div class="field" id="validation-count-field"><label>必要アイテム数 N</label><input id="validation-min-items" type="number" min="1" step="1" value="${validation.minItems}"></div>`
      : needsTurns
        ? `<div class="field" id="validation-count-field"><label>生存ターン数 N</label><input id="validation-min-turns" type="number" min="1" step="1" value="${validation.minTurns}"></div>`
        : `<div class="field" id="validation-count-field"><label>条件の補足</label><div class="hint">${validation.kind === 'defeatEnemy' ? 'マップ上に敵 H を配置し、隣へブロックを置くと倒せます。' : 'ゴール G に到達するとクリアです。'}</div></div>`;

    const replacement = document.createElement('div');
    replacement.className = 'field';
    replacement.innerHTML = `<label>クリア条件</label><select id="validation-kind">${optionHtml}</select><div class="hint" id="validation-description" style="margin-top:4px">${conditionDescription(validation)}</div>`;
    oldField.replaceWith(replacement);
    grid.insertAdjacentHTML('beforeend', `${extraHtml}<div class="field"><label>手数制限（最大手数）</label><input id="validation-max-actions" type="number" min="0" step="1" value="${validation.maxActions || ''}" placeholder="制限なし"><div class="hint">空欄または0なら制限なし。N手目で条件を満たせばクリアできます。</div></div>`);

    document.getElementById('validation-kind').onchange = (event) => {
      const next = event.target.value;
      const patch = { kind: next };
      if (next === 'collectItemsAndGoal') patch.minItems = validation.minItems || 1;
      if (next === 'survive') patch.minTurns = validation.minTurns || 10;
      updateStageValidation(stage, patch);
      renderEdit(stage);
    };
    const itemInput = document.getElementById('validation-min-items');
    if (itemInput) itemInput.oninput = () => {
      updateStageValidation(stage, { minItems: integer(itemInput.value, 1, 1) });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
    const turnInput = document.getElementById('validation-min-turns');
    if (turnInput) turnInput.oninput = () => {
      updateStageValidation(stage, { minTurns: integer(turnInput.value, 10, 1) });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
    const maxInput = document.getElementById('validation-max-actions');
    if (maxInput) maxInput.oninput = () => {
      updateStageValidation(stage, { maxActions: integer(maxInput.value, 0, 0) || null });
      document.getElementById('validation-description').textContent = conditionDescription(stage.play.validation);
    };
  }

  const originalNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithValidation(stage, no) {
    originalNormStage(stage, no);
    normalizeValidation(stage);
  });

  const originalRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithValidation(stage) {
    normalizeValidation(stage);
    originalRenderEdit(stage);
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
      if (validation.requireAllItems && remainingItems > 0) {
        play.msg = `アイテム未回収（残り${remainingItems}個）`;
      } else {
        clear(play, 'ゴール到達');
        return;
      }
    }
    if (validation.kind === 'collectItemsAndGoal' && atGoal && play.items >= validation.minItems) {
      clear(play, `アイテム${validation.minItems}個以上取得してゴール`);
      return;
    }
    if (validation.kind === 'collectItems' && play.items >= validation.minItems) {
      clear(play, `アイテム${validation.minItems}個以上取得`);
      return;
    }
    if (validation.kind === 'defeatEnemy' && play.enemyDefeated) {
      clear(play, '敵を倒した');
      return;
    }
    if (validation.kind === 'survive' && play.turn >= validation.minTurns) {
      clear(play, `${validation.minTurns}ターン生存`);
      return;
    }
    if (validation.maxActions && play.turn >= validation.maxActions) {
      fail(`最大${validation.maxActions}手を超過`);
      return;
    }
    if (validation.kind === 'collectItemsAndGoal' && atGoal) {
      play.msg = `アイテム不足（${play.items}/${validation.minItems}個）`;
    }
  });

  setGlobal('applyPending', function applyPendingWithValidation() {
    const play = st.play;
    const action = play.pending;
    play.turn++;

    if (!action) {
      play.logs.push(`${play.turn}: actionなし`);
      judge();
      return;
    }
    if (action.kind === 'look' || action.kind === 'search') {
      play.logs.push(`${play.turn}: ${action.kind}${action.dir}`);
      judge();
      return;
    }

    const delta = DELTA[action.dir] || { x: 0, y: 0 };
    const x = play.cool.x + delta.x;
    const y = play.cool.y + delta.y;

    if (action.kind === 'walk') {
      if (!isInside(play, x, y) || play.tiles[y][x] === '#') {
        fail(`壁: walk${action.dir}`);
        return;
      }
      if (play.hot && play.hot.x === x && play.hot.y === y) {
        fail('敵にやられた');
        return;
      }
      play.cool = { x, y };
      if (play.tiles[y][x] === 'I') {
        play.items++;
        play.tiles[y][x] = '.';
        play.logs.push(`${play.turn}: walk${action.dir} / item +1`);
      } else {
        play.logs.push(`${play.turn}: walk${action.dir}`);
      }
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

  (st.phases || []).forEach((phase) => (phase.stages || []).forEach((stage) => normalizeValidation(stage)));
  if (typeof render === 'function') render();
})();
