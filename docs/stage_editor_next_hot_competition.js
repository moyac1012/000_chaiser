(() => {
  const COMPETITION_KIND = 'defeatHotOrOutscoreHot';
  const DEFAULT_TURNS = 10;

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function integer(value, fallback, minimum = 1) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) && number >= minimum ? number : fallback;
  }

  function isCompetition(stage) {
    return Boolean(stage?.hotCompetition?.enabled);
  }

  function competitionTurns(stage) {
    return integer(stage?.hotCompetition?.turns, DEFAULT_TURNS);
  }

  function competitionText(turns) {
    return `HOTを倒す または ${turns}ターン後にアイテム数でHOTを上回る`;
  }

  function normalizeCompetition(stage) {
    if (!isCompetition(stage)) return false;
    stage.hotCompetition = {
      enabled: true,
      turns: competitionTurns(stage),
    };
    stage.play ||= {};
    stage.play.validation ||= {};
    // 既存のゲームルールは defeatEnemy を即時勝利として扱う。
    // アイテム数の勝敗は、この拡張がHOT行動後に追加判定する。
    stage.play.validation.kind = 'defeatEnemy';
    stage.play.validation.maxActions = null;
    stage.cond = competitionText(stage.hotCompetition.turns);
    return true;
  }

  function resetPlayState() {
    st.play = null;
    st.bot = null;
    st.hotBot = null;
    st.hotBotPlay = null;
  }

  function persist() {
    if (typeof saveLocal === 'function') saveLocal();
  }

  function removeCompetition(stage) {
    if (!isCompetition(stage)) return;
    delete stage.hotCompetition;
    resetPlayState();
    persist();
  }

  function enableCompetition(stage) {
    stage.hotCompetition = {
      enabled: true,
      turns: competitionTurns(stage),
    };
    normalizeCompetition(stage);
    resetPlayState();
    persist();
  }

  function replaceConditionControls(stage) {
    const select = document.getElementById('condition-kind');
    if (!select || select.dataset.hotCompetitionBound === 'true') return;

    const option = document.createElement('option');
    option.value = COMPETITION_KIND;
    option.textContent = 'HOTを倒す、または Nターン後にアイテム数で上回る';
    select.appendChild(option);
    select.dataset.hotCompetitionBound = 'true';

    const active = normalizeCompetition(stage);
    if (active) select.value = COMPETITION_KIND;

    const originalChange = select.onchange;
    select.onchange = (event) => {
      if (event.target.value === COMPETITION_KIND) {
        enableCompetition(stage);
        if (typeof renderEdit === 'function') renderEdit(stage);
        return;
      }
      removeCompetition(stage);
      originalChange?.call(select, event);
    };

    if (!active) return;

    const description = document.getElementById('condition-description');
    if (description) description.textContent = competitionText(competitionTurns(stage));

    const grid = select.closest('.field')?.parentElement;
    if (!grid) return;

    [...grid.querySelectorAll('.field')].forEach((field) => {
      const label = field.querySelector('label')?.textContent?.trim();
      if (label === '条件の補足' || label === '手数制限（最大手数）') field.style.display = 'none';
    });

    const maxField = document.getElementById('condition-max')?.closest('.field');
    const turnsField = document.createElement('div');
    turnsField.className = 'field';
    turnsField.id = 'hot-competition-turns-field';
    turnsField.innerHTML = `<label>対戦終了ターン数 N</label><input id="hot-competition-turns" type="number" min="1" step="1" value="${competitionTurns(stage)}"><div class="hint">Nターン目はCOOLとHOTの行動が両方終わってから、アイテム数を比較します。同数またはHOT以下なら失敗です。</div>`;
    (maxField || select.closest('.field')).insertAdjacentElement('afterend', turnsField);

    const turns = document.getElementById('hot-competition-turns');
    turns.oninput = () => {
      stage.hotCompetition.turns = integer(turns.value, DEFAULT_TURNS);
      normalizeCompetition(stage);
      if (description) description.textContent = competitionText(stage.hotCompetition.turns);
      resetPlayState();
      persist();
    };
  }

  function score(play) {
    return {
      cool: Number(play.items) || 0,
      hot: Number(play.hotItems) || 0,
    };
  }

  function win(play, message) {
    play.status = 'success';
    play.msg = message;
    play.logs.push(`成功: ${message}`);
  }

  function lose(play, message) {
    if (typeof fail === 'function') {
      fail(message);
      return;
    }
    play.status = 'failed';
    play.msg = message;
    play.logs.push(`失敗: ${message}`);
  }

  function judgeCompetition(play) {
    const stage = typeof curStage === 'function' ? curStage() : null;
    if (!play || play.status !== 'running' || !isCompetition(stage)) return;
    if (play.enemyDefeated) {
      win(play, 'HOTを倒した');
      return;
    }

    const turns = competitionTurns(stage);
    if (play.turn < turns) return;
    const points = score(play);
    if (points.cool > points.hot) {
      win(play, `${turns}ターン終了時にアイテム数でHOTを上回った（COOL ${points.cool} / HOT ${points.hot}）`);
    } else {
      lose(play, `${turns}ターン終了時のアイテム数がHOT以下（COOL ${points.cool} / HOT ${points.hot}）`);
    }
  }

  function applyHotItemCollection(play, previousHot) {
    const hot = play?.hot;
    if (!play || !previousHot || !hot) return false;
    if (previousHot.x === hot.x && previousHot.y === hot.y) return false;
    if (play.tiles?.[hot.y]?.[hot.x] !== 'I') return false;

    play.hotItems = (Number(play.hotItems) || 0) + 1;
    play.tiles[hot.y][hot.x] = '.';
    play.tiles[previousHot.y][previousHot.x] = '#';
    play.logs.push(`${play.turn}: HOT item +1 / previous position blocked`);
    return true;
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithHotCompetition(stage, no) {
    previousNormStage(stage, no);
    normalizeCompetition(stage);
  });

  const previousRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithHotCompetition(stage) {
    previousRenderEdit(stage);
    normalizeCompetition(stage);
    replaceConditionControls(stage);
  });

  const previousInitPlay = window.initPlay || initPlay;
  setGlobal('initPlay', function initPlayWithHotScore(stage, index) {
    const play = previousInitPlay(stage, index);
    play.hotItems = 0;
    play.hotCompetitionTurns = isCompetition(stage) ? competitionTurns(stage) : null;
    return play;
  });

  const previousRunTurn = window.runTurn || runTurn;
  setGlobal('runTurn', function runTurnWithHotItemsAndCompetition() {
    const beforePlay = st.play;
    const previousHot = beforePlay?.hot ? { x: beforePlay.hot.x, y: beforePlay.hot.y } : null;
    previousRunTurn();

    const play = st.play;
    if (!play || play !== beforePlay) return;
    const collected = applyHotItemCollection(play, previousHot);
    if (collected && play.status === 'running' && typeof judge === 'function') judge();
    if (play.status === 'running') judgeCompetition(play);
  });

  const previousDrawStatus = window.drawStatus || drawStatus;
  setGlobal('drawStatus', function drawStatusWithHotScore() {
    previousDrawStatus();
    const play = st.play;
    const status = document.getElementById('status');
    if (!play || !status) return;
    const stage = typeof curStage === 'function' ? curStage() : null;
    if (!play.hot && !isCompetition(stage) && !(Number(play.hotItems) || 0)) return;
    const scoreLine = document.createElement('div');
    scoreLine.className = 'hint';
    scoreLine.style.marginTop = '4px';
    scoreLine.textContent = `アイテム数　COOL: ${Number(play.items) || 0} / HOT: ${Number(play.hotItems) || 0}`;
    status.appendChild(scoreLine);
  });

  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeCompetition));
  if (typeof render === 'function') render();
})();
