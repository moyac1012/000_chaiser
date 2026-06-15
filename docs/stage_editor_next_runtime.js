(() => {
  const COLOR_ACTION = '#f97316';
  const COLOR_ON_TURN = '#2563eb';
  const COLOR_VIEW = '#06b6d4';
  const COLOR_STATE = '#22c55e';
  const DIRS = [['→ 右', 'Right'], ['← 左', 'Left'], ['↑ 上', 'Up'], ['↓ 下', 'Down']];
  const DIRS_UDLR = [['↑ 上', 'Up'], ['↓ 下', 'Down'], ['← 左', 'Left'], ['→ 右', 'Right']];
  const TILE_OPTIONS = [['床 (0)', '0'], ['プレイヤー (1)', '1'], ['ブロック (2)', '2'], ['アイテム (3)', '3']];
  const AROUND_INDEX = { Up: 1, Down: 7, Left: 3, Right: 5 };

  const DEFAULT_BLOCK_SETS = {
    BASIC: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end'],
    CHECK: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_tile_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate'],
    STATE: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
    LOOK: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_look', 'chaser_action_look_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
    SEARCH: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
    ENEMY: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_walk_last', 'chaser_action_walk_random', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
    COUNT: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_walk_last', 'chaser_action_walk_random', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_view_count_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
  };

  const BLOCK_CATALOG = [
    { group: 'スタート・行動', color: COLOR_ON_TURN, blocks: [
      ['chaser_on_turn', '毎ターン'], ['chaser_action_walk', '歩く'], ['chaser_action_put', 'ブロックを置く'],
      ['chaser_action_walk_last', '前に進んだ向きで歩く'], ['chaser_action_walk_random', 'どこかに歩く'],
      ['chaser_action_look', '見る'], ['chaser_action_search', 'まっすぐ見る'],
      ['chaser_action_look_store', '広く見た結果を変数に入れる'], ['chaser_action_search_store', 'まっすぐ見た結果を変数に入れる'],
      ['chaser_turn_end', 'ターンを終える'],
    ] },
    { group: 'まわりを見る', color: COLOR_VIEW, blocks: [
      ['chaser_get_tile', '方向のマス'], ['chaser_is_tile', '方向のマス判定'], ['chaser_get_around', 'まわりの番号'],
      ['chaser_view_get_around', '見た結果の番号'], ['chaser_view_has_tile', '見た結果に指定マスがある'],
      ['chaser_view_count_tile', '見た結果の指定マス数'], ['chaser_discard_value', '結果を使わない'], ['chaser_tile_value', 'マスの種類'],
    ] },
    { group: '変数・状態', color: COLOR_STATE, blocks: [
      ['chaser_state_create', '変数を作る'], ['chaser_state_set', '変数に値を入れる'], ['chaser_state_get', '変数を読む'],
      ['chaser_state_change', '変数を増減'], ['chaser_turn_number', '現在のターン数'],
      ['chaser_last_direction', '前に進んだ向き'], ['chaser_direction_value', '向き'],
    ] },
    { group: '条件・論理', color: '210', blocks: [
      ['controls_if', 'もし / そうでなければ'], ['logic_compare', '比較'], ['logic_operation', 'かつ / または'],
      ['logic_boolean', '真 / 偽'], ['logic_negate', 'ではない'],
    ] },
    { group: '数', color: '230', blocks: [
      ['math_number', '数'], ['math_arithmetic', '四則演算'], ['math_modulo', '余り'],
      ['math_number_property', '数の性質'], ['math_random_int', 'ランダムな整数'], ['math_random_float', 'ランダムな小数'],
    ] },
  ];

  const ALL_BLOCK_TYPES = BLOCK_CATALOG.flatMap((cat) => cat.blocks.map(([type]) => type));
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function normalizeBlockSets(source) {
    const names = typeof SETS !== 'undefined' ? SETS : Object.keys(DEFAULT_BLOCK_SETS);
    const next = {};
    names.forEach((set) => {
      const fallback = DEFAULT_BLOCK_SETS[set] || [];
      const raw = Array.isArray(source && source[set]) ? source[set] : fallback;
      const seen = new Set();
      next[set] = raw.filter((type) => {
        if (type === 'chaser_on_start') return false;
        if (!ALL_BLOCK_TYPES.includes(type)) return false;
        if (seen.has(type)) return false;
        seen.add(type);
        return true;
      });
      if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[set] = [...next[set]];
    });
    window.st.blockSets = next;
    return next;
  }

  function currentBlockSets() {
    return window.st.blockSets || normalizeBlockSets();
  }

  function allowedFor(set) {
    return currentBlockSets()[set] || DEFAULT_BLOCK_SETS[set] || DEFAULT_BLOCK_SETS.BASIC;
  }

  function editorPayload() {
    return { version: 2, blockSets: clone(currentBlockSets()), phases: window.st.phases || [] };
  }

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  setGlobal('fullToolbox', function fullToolbox() {
    return { kind: 'categoryToolbox', contents: [
      { kind: 'category', name: 'スタート・行動', colour: COLOR_ON_TURN, contents: BLOCK_CATALOG[0].blocks.map(([type]) => ({ kind: 'block', type })) },
      { kind: 'category', name: 'まわりを見る', colour: COLOR_VIEW, contents: BLOCK_CATALOG[1].blocks.map(([type]) => ({ kind: 'block', type })) },
      { kind: 'category', name: '変数', colour: COLOR_STATE, contents: [{ kind: 'button', text: '変数を作成', callbackkey: 'CREATE_VAR' }, ...BLOCK_CATALOG[2].blocks.map(([type]) => ({ kind: 'block', type }))] },
      { kind: 'sep' },
      { kind: 'category', name: '条件', colour: '210', contents: BLOCK_CATALOG[3].blocks.map(([type]) => ({ kind: 'block', type })) },
      { kind: 'category', name: '数', colour: '230', contents: BLOCK_CATALOG[4].blocks.map(([type]) => ({ kind: 'block', type })) },
    ] };
  });

  setGlobal('filterToolbox', function filterToolbox(tb, allowed) {
    const filterItems = (items) => items.flatMap((item) => {
      if (item.kind === 'category') {
        const children = filterItems(item.contents || []);
        return children.length ? [{ ...item, contents: children }] : [];
      }
      if (item.kind === 'block') return allowed.has(item.type) ? [item] : [];
      if (item.kind === 'button') return [...allowed].some((type) => type.startsWith('chaser_state_')) ? [item] : [];
      return [item];
    });
    return { ...tb, contents: filterItems(tb.contents).filter((item, i, arr) => item.kind !== 'sep' || (i > 0 && i < arr.length - 1)) };
  });

  setGlobal('toolbox', function toolbox(set) {
    return window.filterToolbox(window.fullToolbox(), new Set(allowedFor(set)));
  });

  setGlobal('blockJson', function blockJson() {
    return [
      { type: 'chaser_on_start', message0: '最初に1回だけ', message1: 'やること %1', args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR_ON_TURN, hat: 'cap' },
      { type: 'chaser_on_turn', message0: '毎ターン', message1: 'やること %1', args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR_ON_TURN, hat: 'cap' },
      { type: 'chaser_turn_end', message0: 'ターンを終える', previousStatement: null, colour: COLOR_ON_TURN },
      { type: 'chaser_state_create', message0: '変数を作る %1', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE },
      { type: 'chaser_state_set', message0: '変数 %1 に %2 を入れる', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }, { type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE },
      { type: 'chaser_state_get', message0: '変数 %1', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }], output: 'Number', colour: COLOR_STATE },
      { type: 'chaser_state_change', message0: '変数 %1 を %2 だけ増減', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }, { type: 'input_value', name: 'DELTA', check: 'Number' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE },
      { type: 'chaser_turn_number', message0: '現在のターン数', output: 'Number', colour: COLOR_STATE },
      { type: 'chaser_last_direction', message0: '前に進んだ向き', output: 'Direction', colour: COLOR_STATE },
      { type: 'chaser_direction_value', message0: '向き %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], output: 'Direction', colour: COLOR_STATE },
      { type: 'chaser_action_walk_last', message0: '前に進んだ向きで歩く（最初は %1）', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_action_walk_random', message0: 'どこかに歩く', previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_action_walk', message0: '歩く %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_action_put', message0: 'ブロックを置く %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_action_look', message0: '見る %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], output: 'Array', colour: COLOR_ACTION },
      { type: 'chaser_action_search', message0: 'まっすぐ見る %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], output: 'Array', colour: COLOR_ACTION },
      { type: 'chaser_action_look_store', message0: '広く %1 を見た結果を %2 に入れる', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_action_search_store', message0: 'まっすぐ %1 を見た結果を %2 に入れる', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION },
      { type: 'chaser_get_tile', message0: '方向 %1 のマス', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], output: 'Number', colour: COLOR_VIEW },
      { type: 'chaser_is_tile', message0: '方向 %1 のマスは %2 ?', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Boolean', colour: COLOR_VIEW },
      { type: 'chaser_get_around', message0: 'まわりの %1 番', args0: [{ type: 'input_value', name: 'INDEX', check: 'Number' }], output: 'Number', colour: COLOR_VIEW },
      { type: 'chaser_view_get_around', message0: '見た結果 %1 の %2 番', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'input_value', name: 'INDEX', check: 'Number' }], output: 'Number', colour: COLOR_VIEW },
      { type: 'chaser_view_has_tile', message0: '見た結果 %1 に %2 がある', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Boolean', colour: COLOR_VIEW },
      { type: 'chaser_view_count_tile', message0: '見た結果 %1 の %2 の数', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Number', colour: COLOR_VIEW },
      { type: 'chaser_discard_value', message0: '結果を使わない %1', args0: [{ type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null, colour: COLOR_VIEW },
      { type: 'chaser_tile_value', message0: 'マスの種類 %1', args0: [{ type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Number', colour: COLOR_VIEW },
    ];
  });

  setGlobal('registerGenerators', function registerGenerators() {
    const g = window.gen();
    g.forBlock.chaser_on_start = (b, gg) => `function onStart(api){${gg.statementToCode(b, 'DO')}}`;
    g.forBlock.chaser_on_turn = (b, gg) => `function onTurn(api){__chaserTurn=(typeof __chaserTurn==='number'?__chaserTurn:0)+1;let __chaserTurnEnded=false;${gg.statementToCode(b, 'DO')}if(!__chaserTurnEnded){throw new Error('ターンを終えるブロックを置いてください。');}}`;
    g.forBlock.chaser_turn_end = () => '__chaserTurnEnded=true;return;';
    g.forBlock.chaser_state_create = () => '';
    g.forBlock.chaser_state_set = (b) => `${g.getVariableName(b.getFieldValue('VAR'))}=${g.valueToCode(b, 'VALUE', 0) || '0'};`;
    g.forBlock.chaser_state_get = (b) => [g.getVariableName(b.getFieldValue('VAR')), 0];
    g.forBlock.chaser_state_change = (b) => `${g.getVariableName(b.getFieldValue('VAR'))}+=(${g.valueToCode(b, 'DELTA', 0) || '0'});`;
    g.forBlock.chaser_turn_number = () => ['__chaserTurn', 0];
    g.forBlock.chaser_last_direction = () => ["(__chaserLastAction&&__chaserLastAction.dir)||'Up'", 0];
    g.forBlock.chaser_direction_value = (b) => [`'${b.getFieldValue('DIR') || 'Up'}'`, 0];
    g.forBlock.chaser_action_walk_last = (b) => `(()=>{const d=(__chaserLastAction&&__chaserLastAction.dir)||'${b.getFieldValue('DIR') || 'Up'}';__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();`;
    g.forBlock.chaser_action_walk_random = () => "(()=>{const ds=['Up','Down','Left','Right'];const ok=ds.filter(d=>api.around[({Up:1,Down:7,Left:3,Right:5})[d]]!==2);const pool=ok.length?ok:ds;const d=pool[Math.floor(Math.random()*pool.length)];__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();";
    ['walk', 'put'].forEach((method) => {
      g.forBlock['chaser_action_' + method] = (b) => `__chaserLastAction={kind:'${method}',dir:'${b.getFieldValue('DIR') || 'Right'}'};api.${method + (b.getFieldValue('DIR') || 'Right')}();`;
    });
    ['look', 'search'].forEach((method) => {
      g.forBlock['chaser_action_' + method] = (b) => [`(()=>{__chaserLastAction={kind:'${method}',dir:'${b.getFieldValue('DIR') || 'Right'}'};return api.${method + (b.getFieldValue('DIR') || 'Right')}();})()`, 0];
      g.forBlock['chaser_action_' + method + '_store'] = (b) => `${g.getVariableName(b.getFieldValue('VAR'))}=api.${method + (b.getFieldValue('DIR') || 'Right')}();`;
    });
    g.forBlock.chaser_get_tile = (b) => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]`, 0];
    g.forBlock.chaser_is_tile = (b) => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]===${b.getFieldValue('TILE') || '0'}`, 0];
    g.forBlock.chaser_get_around = (b) => [`api.around[${g.valueToCode(b, 'INDEX', 0) || '0'}]`, 0];
    g.forBlock.chaser_view_get_around = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'})[${g.valueToCode(b, 'INDEX', 0) || '0'}]`, 0];
    g.forBlock.chaser_view_has_tile = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'}).includes(${b.getFieldValue('TILE') || '0'})`, 0];
    g.forBlock.chaser_view_count_tile = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'}).filter(v=>v===${b.getFieldValue('TILE') || '0'}).length`, 0];
    g.forBlock.chaser_discard_value = (b) => `${g.valueToCode(b, 'VALUE', 0) || 'undefined'};`;
    g.forBlock.chaser_tile_value = (b) => [b.getFieldValue('TILE') || '0', 0];
  });

  setGlobal('initBlockly', function initBlockly(stage) {
    registerBlocks();
    st.ws = Blockly.inject('blockly', {
      toolbox: toolbox(stage.blockSet),
      trashcan: true,
      scrollbars: true,
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 2.5,
        minScale: 0.35,
        scaleSpeed: 1.15,
        pinch: true,
      },
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
    });
    st.ws.registerButtonCallback('CREATE_VAR', () => Blockly.Variables.createVariableButtonHandler(st.ws));
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(stage.play.savedBlocklyXml || defaultXml()), st.ws);
    } catch (_) {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(defaultXml()), st.ws);
    }
    st.ws.addChangeListener(() => { st.bot = null; });
  });

  function compileBot() {
    const g = window.gen();
    g.init(st.ws);
    const code = g.workspaceToCode(st.ws);
    const vars = st.ws.getVariableMap().getAllVariables().map((v) => g.getVariableName(v.getId()));
    const defs = vars.map((name) => `var ${name}=0;`).join(';');
    return new Function(`var __chaserLastAction=null;var __chaserTurn=0;${defs};${code};return {onStart:typeof onStart==='function'?onStart:null,onTurn:typeof onTurn==='function'?onTurn:null};`)();
  }

  function delta(dir) {
    return { Up: { x: 0, y: -1 }, Down: { x: 0, y: 1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } }[dir] || { x: 0, y: 0 };
  }

  function tileAt(play, x, y) {
    if (y < 0 || y >= play.tiles.length || x < 0 || x >= play.tiles[y].length) return 2;
    if (play.hot && play.hot.x === x && play.hot.y === y) return 1;
    if (play.cool && play.cool.x === x && play.cool.y === y) return 1;
    const ch = play.tiles[y][x];
    return ch === '#' ? 2 : ch === 'I' ? 3 : 0;
  }

  function around() {
    const play = st.play;
    const result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) result.push(tileAt(play, play.cool.x + dx, play.cool.y + dy));
    return result;
  }

  function search(dir) {
    const play = st.play;
    const d = delta(dir);
    const result = [];
    for (let i = 1; i <= 9; i++) result.push(tileAt(play, play.cool.x + d.x * i, play.cool.y + d.y * i));
    return result;
  }

  setGlobal('makeApi', function makeApi() {
    const api = { around: around() };
    ['Up', 'Down', 'Left', 'Right'].forEach((dir) => {
      api['walk' + dir] = () => { st.play.pending = { kind: 'walk', dir }; };
      api['put' + dir] = () => { st.play.pending = { kind: 'put', dir }; };
      api['look' + dir] = () => { st.play.pending = { kind: 'look', dir }; return around(); };
      api['search' + dir] = () => { st.play.pending = { kind: 'search', dir }; return search(dir); };
    });
    return api;
  });

  setGlobal('fail', function fail(message) {
    st.play.status = 'failed';
    st.play.msg = message;
    st.play.logs.push(`失敗: ${message}`);
  });

  setGlobal('judge', function judge() {
    const p = st.play;
    const v = p.validation;
    const remaining = p.tiles.reduce((sum, row) => sum + row.filter((ch) => ch === 'I').length, 0);
    if (v.kind === 'reachGoal' && p.goal && p.cool.x === p.goal.x && p.cool.y === p.goal.y) {
      if (v.requireAllItems && remaining > 0) return fail('アイテム未回収');
      p.status = 'success';
      p.msg = 'ゴール到達';
      p.logs.push('成功: ゴール到達');
      return;
    }
    if (v.kind === 'collectItems' && p.items >= v.minItems) { p.status = 'success'; p.msg = 'アイテム条件達成'; return; }
    if (v.kind === 'survive' && p.turn >= v.minTurns) { p.status = 'success'; p.msg = '生存条件達成'; return; }
    if (v.maxActions && p.turn >= v.maxActions) fail(`最大${v.maxActions}手を超過`);
  });

  setGlobal('applyPending', function applyPending() {
    const p = st.play;
    const a = p.pending;
    p.turn++;
    if (!a) { p.logs.push(`${p.turn}: actionなし`); judge(); return; }
    if (a.kind === 'look' || a.kind === 'search') { p.logs.push(`${p.turn}: ${a.kind}${a.dir}`); judge(); return; }
    const d = delta(a.dir);
    const x = p.cool.x + d.x;
    const y = p.cool.y + d.y;
    if (a.kind === 'walk') {
      if (tileAt(p, x, y) === 2) return fail(`壁: walk${a.dir}`);
      p.cool = { x, y };
      if (p.tiles[y][x] === 'I') { p.items++; p.tiles[y][x] = '.'; p.logs.push(`${p.turn}: walk${a.dir} / item +1`); }
      else p.logs.push(`${p.turn}: walk${a.dir}`);
      judge();
      return;
    }
    if (a.kind === 'put') {
      if (p.hot && p.hot.x === x && p.hot.y === y) { p.status = 'success'; p.msg = 'put成功'; p.logs.push(`${p.turn}: put${a.dir} / win`); return; }
      if (y >= 0 && y < p.tiles.length && x >= 0 && x < p.tiles[y].length && p.tiles[y][x] === '.') p.tiles[y][x] = '#';
      p.logs.push(`${p.turn}: put${a.dir}`);
      judge();
    }
  });

  setGlobal('resetRuntime', function resetRuntime(stage) {
    saveXml();
    st.play = initPlay(stage, st.map);
    st.bot = compileBot();
    try { if (st.bot.onStart) st.bot.onStart(makeApi()); } catch (error) { fail(`初期化エラー: ${error.message}`); }
  });

  setGlobal('runTurn', function runTurn() {
    if (!st.play || st.play.status !== 'running') return;
    if (!st.bot) st.bot = compileBot();
    try {
      st.play.pending = null;
      if (!st.bot.onTurn) return fail('毎ターンブロックがありません');
      st.bot.onTurn(makeApi());
      applyPending();
    } catch (error) { fail(`Blockly実行エラー: ${error.message}`); }
  });

  setGlobal('runOneFromButton', function runOneFromButton(stage) {
    ensureRunningFromButton(stage);
    runTurn();
    drawRuntime();
  });

  setGlobal('startAuto', function startAuto(stage) {
    stopAuto();
    ensureRunningFromButton(stage);
    drawRuntime();
    st.timer = setInterval(() => {
      if (!st.play || st.play.status !== 'running') { stopAuto(); drawRuntime(); return; }
      runTurn();
      drawRuntime();
    }, 350);
  });

  const oldSaveLocal = window.saveLocal || saveLocal;
  setGlobal('saveLocal', function saveLocalWithBlockSets() {
    localStorage.setItem(STORAGE, JSON.stringify(editorPayload()));
  });

  setGlobal('saveJson', function saveJsonWithBlockSets() {
    if (typeof saveXml === 'function') saveXml();
    const blob = new Blob([JSON.stringify(editorPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const oldLoadObj = window.loadObj || loadObj;
  setGlobal('loadObj', function loadObjWithBlockSets(obj) {
    oldLoadObj(obj);
    normalizeBlockSets(obj && obj.blockSets);
    saveLocal();
    render();
  });

  function renderBlockSetEditor() {
    const body = document.getElementById('body');
    const setNames = typeof SETS !== 'undefined' ? SETS : Object.keys(DEFAULT_BLOCK_SETS);
    const selected = setNames.includes(st.blockSetEdit) ? st.blockSetEdit : setNames[0];
    st.blockSetEdit = selected;
    const allowed = new Set(allowedFor(selected));
    body.innerHTML = `<div class="panel"><div class="grid"><div class="field"><label>編集するブロックセット</label><select id="bs-select">${setNames.map((set) => `<option value="${set}" ${set === selected ? 'selected' : ''}>${set}</option>`).join('')}</select></div><div class="field"><label>説明</label><div class="hint">チェックしたブロックだけが、そのセットのBlocklyツールボックスに表示されます。</div></div></div><div class="controls"><button class="btn" id="bs-check-all">すべて選択</button><button class="btn" id="bs-uncheck-all">すべて外す</button><button class="btn warn" id="bs-reset-one">このセットを既定に戻す</button><button class="btn danger" id="bs-reset-all">全セットを既定に戻す</button></div><div class="hint">「最初に1回だけやること」ブロックは、どのセットにも入れられません。</div></div><div class="grid" style="margin-top:12px">${BLOCK_CATALOG.map((cat) => `<div class="panel"><div class="section" style="margin-top:0">${cat.group}</div>${cat.blocks.map(([type, label]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px"><input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}><span><b>${label}</b><br><span class="hint mono">${type}</span></span></label>`).join('')}</div>`).join('')}</div>`;
    document.getElementById('bs-select').onchange = (e) => { st.blockSetEdit = e.target.value; renderBlockSetEditor(); };
    document.querySelectorAll('.bs-block').forEach((input) => {
      input.onchange = () => {
        currentBlockSets()[st.blockSetEdit] = [...document.querySelectorAll('.bs-block:checked')].map((el) => el.value);
        normalizeBlockSets(currentBlockSets());
        if (st.ws && curStage()?.blockSet === st.blockSetEdit) st.ws.updateToolbox(toolbox(st.blockSetEdit));
        saveLocal();
      };
    });
    document.getElementById('bs-check-all').onclick = () => { currentBlockSets()[st.blockSetEdit] = [...ALL_BLOCK_TYPES]; normalizeBlockSets(currentBlockSets()); saveLocal(); renderBlockSetEditor(); };
    document.getElementById('bs-uncheck-all').onclick = () => { currentBlockSets()[st.blockSetEdit] = []; normalizeBlockSets(currentBlockSets()); saveLocal(); renderBlockSetEditor(); };
    document.getElementById('bs-reset-one').onclick = () => { currentBlockSets()[st.blockSetEdit] = [...(DEFAULT_BLOCK_SETS[st.blockSetEdit] || [])]; normalizeBlockSets(currentBlockSets()); saveLocal(); renderBlockSetEditor(); };
    document.getElementById('bs-reset-all').onclick = () => { if (!confirm('全ブロックセットを既定に戻しますか？')) return; normalizeBlockSets(DEFAULT_BLOCK_SETS); saveLocal(); renderBlockSetEditor(); };
  }

  const oldRenderMain = window.renderMain || renderMain;
  setGlobal('renderMain', function renderMainWithBlockSets() {
    if (st.tab !== 'blocksets') return oldRenderMain();
    const s = curStage();
    const main = document.getElementById('main');
    if (!s) { main.innerHTML = '<div class=empty>JSONを読み込んでください</div>'; return; }
    main.innerHTML = `<div class=tabs>${TABS.map(([id, label]) => `<div class="tab ${st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id=body></div>`;
    main.querySelectorAll('.tab').forEach((tab) => {
      tab.onclick = () => {
        if (st.tab === 'play' && typeof saveXml === 'function') saveXml();
        if (typeof disposeBlockly === 'function') disposeBlockly();
        st.tab = tab.dataset.tab;
        renderMain();
      };
    });
    renderBlockSetEditor();
  });

  if (Array.isArray(TABS) && !TABS.some(([id]) => id === 'blocksets')) TABS.push(['blocksets', 'ブロックセット']);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    normalizeBlockSets(stored.blockSets);
  } catch (_) { normalizeBlockSets(); }
  document.getElementById('save-json').onclick = saveJson;
  if (typeof renderMain === 'function') renderMain();
})();