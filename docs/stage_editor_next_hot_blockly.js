(() => {
  const HOT_COLOR = '#dc2626';
  const SENSE_COLOR = '#7c3aed';
  const DIRS = [['→ 右', 'Right'], ['← 左', 'Left'], ['↑ 上', 'Up'], ['↓ 下', 'Down']];
  const DIRS_UDLR = [['↑ 上', 'Up'], ['↓ 下', 'Down'], ['← 左', 'Left'], ['→ 右', 'Right']];
  const HOT_TILE_OPTIONS = [['床 (0)', '0'], ['COOL (1)', '1'], ['ブロック (2)', '2'], ['アイテム (3)', '3']];
  const AROUND_INDEX = { Up: 1, Down: 7, Left: 3, Right: 5 };

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hotDefaultXml() {
    return '<xml xmlns="https://developers.google.com/blockly/xml"><block type="chaser_hot_on_turn" x="24" y="24"><statement name="DO"><block type="chaser_hot_turn_end"></block></statement></block></xml>';
  }

  function normalizeHotBehavior(stage) {
    if (!stage || typeof stage !== 'object') return { enabled: false, savedBlocklyXml: hotDefaultXml() };
    const original = stage.hotBehavior && typeof stage.hotBehavior === 'object' ? stage.hotBehavior : {};
    stage.hotBehavior = {
      enabled: Boolean(original.enabled),
      savedBlocklyXml: typeof original.savedBlocklyXml === 'string' && original.savedBlocklyXml.trim()
        ? original.savedBlocklyXml
        : hotDefaultXml(),
    };
    return stage.hotBehavior;
  }

  function stageHasHot(stage, mapIndex = st.map) {
    const map = stage?.maps?.[mapIndex] || stage?.maps?.[0];
    return Boolean(map?.rows?.some((row) => String(row).includes('H')));
  }

  function registerHotBlocks() {
    if (typeof registerBlocks === 'function') registerBlocks();
    const definitions = [
      { type: 'chaser_hot_on_turn', message0: 'HOTの毎ターン', message1: 'やること %1', args1: [{ type: 'input_statement', name: 'DO' }], colour: HOT_COLOR, hat: 'cap' },
      { type: 'chaser_hot_turn_end', message0: 'HOTのターンを終える', previousStatement: null, colour: HOT_COLOR },
      { type: 'chaser_hot_walk', message0: 'HOTが歩く %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], previousStatement: null, nextStatement: null, colour: HOT_COLOR },
      { type: 'chaser_hot_walk_random', message0: 'HOTがどこかに歩く', previousStatement: null, nextStatement: null, colour: HOT_COLOR },
      { type: 'chaser_hot_is_tile', message0: 'HOTの %1 のマスは %2 ?', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_dropdown', name: 'TILE', options: HOT_TILE_OPTIONS }], output: 'Boolean', colour: SENSE_COLOR },
      { type: 'chaser_hot_get_tile', message0: 'HOTの %1 のマス', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], output: 'Number', colour: SENSE_COLOR },
    ];
    const missing = definitions.filter((definition) => !Blockly.Blocks[definition.type]);
    if (missing.length) Blockly.defineBlocksWithJsonArray(missing);

    const g = window.gen();
    g.forBlock.chaser_hot_on_turn = (block, generator) => `function onHotTurn(api){let __hotTurnEnded=false;${generator.statementToCode(block, 'DO')}if(!__hotTurnEnded){throw new Error('HOTのターンを終えるブロックを置いてください。');}}`;
    g.forBlock.chaser_hot_turn_end = () => '__hotTurnEnded=true;return;';
    g.forBlock.chaser_hot_walk = (block) => `api.walk${block.getFieldValue('DIR') || 'Right'}();`;
    g.forBlock.chaser_hot_walk_random = () => "(()=>{const ds=['Up','Down','Left','Right'];const ix={Up:1,Down:7,Left:3,Right:5};const open=ds.filter(d=>api.around[ix[d]]!==2);const pool=open.length?open:ds;api.walk(pool[Math.floor(Math.random()*pool.length)]);})();";
    g.forBlock.chaser_hot_is_tile = (block) => [`api.around[${AROUND_INDEX[block.getFieldValue('DIR')] ?? 5}]===${block.getFieldValue('TILE') || '0'}`, 0];
    g.forBlock.chaser_hot_get_tile = (block) => [`api.around[${AROUND_INDEX[block.getFieldValue('DIR')] ?? 5}]`, 0];
  }

  function hotToolbox() {
    return {
      kind: 'categoryToolbox',
      contents: [
        { kind: 'category', name: 'HOTの行動', colour: HOT_COLOR, contents: [
          { kind: 'block', type: 'chaser_hot_on_turn' },
          { kind: 'block', type: 'chaser_hot_walk' },
          { kind: 'block', type: 'chaser_hot_walk_random' },
          { kind: 'block', type: 'chaser_hot_turn_end' },
        ] },
        { kind: 'category', name: 'HOTから見る', colour: SENSE_COLOR, contents: [
          { kind: 'block', type: 'chaser_hot_is_tile' },
          { kind: 'block', type: 'chaser_hot_get_tile' },
        ] },
        { kind: 'sep' },
        { kind: 'category', name: '条件', colour: '210', contents: [
          { kind: 'block', type: 'controls_if' },
          { kind: 'block', type: 'logic_compare' },
          { kind: 'block', type: 'logic_operation' },
          { kind: 'block', type: 'logic_boolean' },
          { kind: 'block', type: 'logic_negate' },
        ] },
        { kind: 'category', name: '数', colour: '230', contents: [
          { kind: 'block', type: 'math_number' },
          { kind: 'block', type: 'math_arithmetic' },
          { kind: 'block', type: 'math_modulo' },
          { kind: 'block', type: 'math_number_property' },
          { kind: 'block', type: 'math_random_int' },
          { kind: 'block', type: 'math_random_float' },
        ] },
      ],
    };
  }

  function saveHotWorkspace(persist = false) {
    const stage = st.hotEditingStage;
    if (!stage || !st.hotWs) return;
    const behavior = normalizeHotBehavior(stage);
    behavior.savedBlocklyXml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(st.hotWs));
    if (persist && typeof saveLocal === 'function') saveLocal();
  }

  function disposeHotWorkspace() {
    if (!st.hotWs) return;
    saveHotWorkspace(true);
    st.hotWs.dispose();
    st.hotWs = null;
    st.hotEditingStage = null;
  }

  function initHotWorkspace(stage) {
    registerHotBlocks();
    const behavior = normalizeHotBehavior(stage);
    st.hotEditingStage = stage;
    st.hotWs = Blockly.inject('hot-blockly', {
      toolbox: hotToolbox(),
      trashcan: true,
      scrollbars: true,
      zoom: { controls: true, wheel: true, startScale: 1.0, maxScale: 2.5, minScale: 0.35, scaleSpeed: 1.15, pinch: true },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(behavior.savedBlocklyXml), st.hotWs);
    } catch (_) {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(hotDefaultXml()), st.hotWs);
    }
    let timer = null;
    st.hotWs.addChangeListener(() => {
      saveHotWorkspace(false);
      clearTimeout(timer);
      timer = setTimeout(() => { if (typeof saveLocal === 'function') saveLocal(); }, 250);
    });
  }

  function compileHotBot(stage) {
    registerHotBlocks();
    const behavior = normalizeHotBehavior(stage);
    const workspace = new Blockly.Workspace();
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(behavior.savedBlocklyXml), workspace);
      const g = window.gen();
      g.init(workspace);
      const code = g.workspaceToCode(workspace);
      return new Function(`${code};return {onHotTurn:typeof onHotTurn==='function'?onHotTurn:null};`)();
    } finally {
      workspace.dispose();
    }
  }

  function hotTileAt(play, x, y) {
    if (y < 0 || y >= play.tiles.length || x < 0 || x >= play.tiles[y].length) return 2;
    if (play.cool && play.cool.x === x && play.cool.y === y) return 1;
    const cell = play.tiles[y][x];
    return cell === '#' ? 2 : cell === 'I' ? 3 : 0;
  }

  function hotAround(play) {
    const values = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1) values.push(hotTileAt(play, play.hot.x + dx, play.hot.y + dy));
    }
    return values;
  }

  function makeHotApi(play) {
    const api = { around: hotAround(play) };
    ['Up', 'Down', 'Left', 'Right'].forEach((direction) => {
      api[`walk${direction}`] = () => { play.hotPending = { kind: 'walk', dir: direction }; };
    });
    return api;
  }

  function directionDelta(direction) {
    return { Up: { x: 0, y: -1 }, Down: { x: 0, y: 1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } }[direction] || { x: 0, y: 0 };
  }

  function applyHotPending(play) {
    const action = play.hotPending;
    if (!action || action.kind !== 'walk') {
      play.logs.push(`${play.turn}: HOT actionなし`);
      judge();
      return;
    }
    const delta = directionDelta(action.dir);
    const x = play.hot.x + delta.x;
    const y = play.hot.y + delta.y;
    const tile = hotTileAt(play, x, y);
    if (tile === 2) {
      play.logs.push(`${play.turn}: HOT walk${action.dir} / wall`);
      judge();
      return;
    }
    if (play.cool && play.cool.x === x && play.cool.y === y) {
      play.hot = { x, y };
      play.logs.push(`${play.turn}: HOT walk${action.dir} / COOL caught`);
      fail('HOTにやられた');
      return;
    }
    play.hot = { x, y };
    play.logs.push(`${play.turn}: HOT walk${action.dir}`);
    judge();
  }

  function runHotTurn(stage) {
    const play = st.play;
    const behavior = normalizeHotBehavior(stage);
    if (!play || play.status !== 'running' || !play.hot || !behavior.enabled) return;
    try {
      if (st.hotBotPlay !== play) {
        st.hotBot = compileHotBot(stage);
        st.hotBotPlay = play;
      }
      play.hotPending = null;
      if (!st.hotBot?.onHotTurn) {
        fail('HOTの毎ターンブロックがありません');
        return;
      }
      st.hotBot.onHotTurn(makeHotApi(play));
      applyHotPending(play);
    } catch (error) {
      fail(`HOT Blockly実行エラー: ${error.message}`);
    }
  }

  const previousNormStage = window.normStage || normStage;
  setGlobal('normStage', function normStageWithHotBehavior(stage, no) {
    previousNormStage(stage, no);
    normalizeHotBehavior(stage);
  });

  const previousRenderMain = window.renderMain || renderMain;
  function renderHotTab() {
    const stage = curStage();
    const main = document.getElementById('main');
    if (!stage) {
      main.innerHTML = '<div class="empty">JSONを読み込んでください</div>';
      return;
    }
    if (st.hotWs) disposeHotWorkspace();
    const behavior = normalizeHotBehavior(stage);
    const selectedHasHot = stageHasHot(stage, st.map);
    const anyMapHasHot = (stage.maps || []).some((map) => map.rows?.some((row) => String(row).includes('H')));
    main.innerHTML = `<div class="tabs">${TABS.map(([id, label]) => `<div class="tab ${st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id="body"><div class="panel"><div class="grid"><div class="field"><label>HOTを動かす</label><label style="display:flex;align-items:center;gap:8px;margin-top:7px"><input id="hot-enabled" type="checkbox" ${behavior.enabled ? 'checked' : ''}>このステージでHOTの行動プログラムを有効にする</label></div><div class="field"><label>現在のマップ</label><div class="hint">${selectedHasHot ? 'このマップには HOT（H）があります。' : anyMapHasHot ? 'このマップには H がありません。H がある別マップでは同じプログラムが動きます。' : 'このステージには H がありません。マップ編集で H を配置してください。'}</div></div></div><div class="hint">COOLが行動した後、ゲームが継続している場合にHOTが1回行動します。HOTがCOOLのマスへ移動するとCOOLの敗北です。</div></div><div class="panel" style="margin-top:12px"><div class="section" style="margin-top:0">HOTの行動プログラム</div><div id="hot-blockly" style="height:540px;width:100%"></div></div></div>`;
    main.querySelectorAll('.tab').forEach((tab) => {
      tab.onclick = () => {
        if (st.tab === 'hot') disposeHotWorkspace();
        if (st.tab === 'play' && typeof saveXml === 'function') saveXml();
        if (st.tab === 'play' && typeof disposeBlockly === 'function') disposeBlockly();
        st.tab = tab.dataset.tab;
        renderMain();
      };
    });
    document.getElementById('hot-enabled').onchange = (event) => {
      behavior.enabled = event.target.checked;
      st.hotBot = null;
      st.hotBotPlay = null;
      if (typeof saveLocal === 'function') saveLocal();
      if (typeof msg === 'function') msg(behavior.enabled ? 'HOTの行動プログラムを有効にしました' : 'HOTの行動プログラムを無効にしました');
    };
    initHotWorkspace(stage);
  }

  setGlobal('renderMain', function renderMainWithHotBlockly() {
    if (st.tab !== 'hot') return previousRenderMain();
    renderHotTab();
  });

  const previousRunTurn = window.runTurn || runTurn;
  setGlobal('runTurn', function runTurnWithHotBlockly() {
    previousRunTurn();
    if (!st.play || st.play.status !== 'running') return;
    runHotTurn(curStage());
  });

  if (!TABS.some(([id]) => id === 'hot')) TABS.push(['hot', 'HOT行動']);
  (st.phases || []).forEach((phase) => (phase.stages || []).forEach(normalizeHotBehavior));
  if (typeof render === 'function') render();
})();
