(() => {
  const COLOR_ACTION = '#f97316';
  const COLOR_ON_TURN = '#2563eb';
  const COLOR_VIEW = '#06b6d4';
  const COLOR_STATE = '#22c55e';
  const DIRS = [['→ 右', 'Right'], ['← 左', 'Left'], ['↑ 上', 'Up'], ['↓ 下', 'Down']];
  const DIRS_UDLR = [['↑ 上', 'Up'], ['↓ 下', 'Down'], ['← 左', 'Left'], ['→ 右', 'Right']];
  const TILE_OPTIONS = [['床 (0)', '0'], ['プレイヤー (1)', '1'], ['ブロック (2)', '2'], ['アイテム (3)', '3']];
  const AROUND_INDEX = { Up: 1, Down: 7, Left: 3, Right: 5 };

  const makeBlock = (type) => ({ kind: 'block', type });
  const CHASER_ACTIONS = ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_walk_last', 'chaser_action_walk_random', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end'];
  const CHASER_VIEW = ['chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_view_count_tile', 'chaser_discard_value', 'chaser_tile_value'];
  const CHASER_STATE = ['chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value'];
  const STD_LOGIC = ['controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate'];
  const STD_MATH = ['math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'];

  const BLOCK_CATALOG = [
    { group: 'スタート・行動', blocks: [
      ['chaser_on_turn', '毎ターン'],
      ['chaser_action_walk', '歩く'],
      ['chaser_action_put', 'ブロックを置く'],
      ['chaser_action_walk_last', '前に進んだ向きで歩く'],
      ['chaser_action_walk_random', 'どこかに歩く'],
      ['chaser_action_look', '見る'],
      ['chaser_action_search', 'まっすぐ見る'],
      ['chaser_action_look_store', '広く見た結果を変数に入れる'],
      ['chaser_action_search_store', 'まっすぐ見た結果を変数に入れる'],
      ['chaser_turn_end', 'ターンを終える'],
    ] },
    { group: 'まわりを見る', blocks: [
      ['chaser_get_tile', '方向のマス'],
      ['chaser_is_tile', '方向のマス判定'],
      ['chaser_get_around', 'まわりの番号'],
      ['chaser_view_get_around', '見た結果の番号'],
      ['chaser_view_has_tile', '見た結果に指定マスがある'],
      ['chaser_view_count_tile', '見た結果の指定マス数'],
      ['chaser_discard_value', '結果を使わない'],
      ['chaser_tile_value', 'マスの種類'],
    ] },
    { group: '変数・状態', blocks: [
      ['chaser_state_create', '変数を作る'],
      ['chaser_state_set', '変数に値を入れる'],
      ['chaser_state_get', '変数を読む'],
      ['chaser_state_change', '変数を増減'],
      ['chaser_turn_number', '現在のターン数'],
      ['chaser_last_direction', '前に進んだ向き'],
      ['chaser_direction_value', '向き'],
    ] },
    { group: '条件・論理', blocks: [
      ['controls_if', 'もし / そうでなければ'],
      ['logic_compare', '比較'],
      ['logic_operation', 'かつ / または'],
      ['logic_boolean', '真 / 偽'],
      ['logic_negate', 'ではない'],
    ] },
    { group: '数', blocks: [
      ['math_number', '数'],
      ['math_arithmetic', '四則演算'],
      ['math_modulo', '余り'],
      ['math_number_property', '数の性質'],
      ['math_random_int', 'ランダムな整数'],
      ['math_random_float', 'ランダムな小数'],
    ] },
  ];
  const CATALOG_TYPES = BLOCK_CATALOG.flatMap((cat) => cat.blocks.map(([type]) => type));
  const BLOCK_LABELS = Object.fromEntries(BLOCK_CATALOG.flatMap((cat) => cat.blocks));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultBlockSets() {
    if (typeof BLOCK_SET_ALLOWED !== 'undefined') return clone(BLOCK_SET_ALLOWED);
    return {
      BASIC: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end'],
      CHECK: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_tile_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate'],
      STATE: ['chaser_on_turn', 'chaser_action_walk', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
      LOOK: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_look', 'chaser_action_look_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
      SEARCH: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
      ENEMY: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_walk_last', 'chaser_action_walk_random', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
      COUNT: ['chaser_on_turn', 'chaser_action_walk', 'chaser_action_put', 'chaser_action_walk_last', 'chaser_action_walk_random', 'chaser_action_look', 'chaser_action_search', 'chaser_action_look_store', 'chaser_action_search_store', 'chaser_turn_end', 'chaser_get_tile', 'chaser_is_tile', 'chaser_get_around', 'chaser_view_get_around', 'chaser_view_has_tile', 'chaser_view_count_tile', 'chaser_discard_value', 'chaser_tile_value', 'chaser_state_create', 'chaser_state_set', 'chaser_state_get', 'chaser_state_change', 'chaser_turn_number', 'chaser_last_direction', 'chaser_direction_value', 'controls_if', 'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'math_number', 'math_arithmetic', 'math_modulo', 'math_number_property', 'math_random_int', 'math_random_float'],
    };
  }

  const DEFAULT_BLOCK_SETS = defaultBlockSets();

  function normalizeAllowed(list, fallback) {
    const source = Array.isArray(list) ? list : fallback;
    const seen = new Set();
    const allowed = [];
    source.forEach((type) => {
      if (type === 'chaser_on_start') return;
      if (!CATALOG_TYPES.includes(type)) return;
      if (seen.has(type)) return;
      seen.add(type);
      allowed.push(type);
    });
    return allowed;
  }

  function applyBlockSets(source) {
    const next = {};
    const setNames = typeof SETS !== 'undefined' ? SETS : Object.keys(DEFAULT_BLOCK_SETS);
    setNames.forEach((set) => {
      next[set] = normalizeAllowed(source && source[set], DEFAULT_BLOCK_SETS[set] || []);
      if (typeof BLOCK_SET_ALLOWED !== 'undefined') BLOCK_SET_ALLOWED[set] = [...next[set]];
    });
    window.st.blockSets = next;
    return next;
  }

  function currentBlockSets() {
    return window.st.blockSets || applyBlockSets(undefined);
  }

  function allowedFor(set) {
    return (currentBlockSets()[set] || DEFAULT_BLOCK_SETS[set] || []).filter((type) => type !== 'chaser_on_start');
  }

  function editorPayload() {
    return { version: 2, blockSets: clone(currentBlockSets()), phases: window.st.phases };
  }

  window.fullToolbox = function fullToolbox() {
    return {
      kind: 'categoryToolbox',
      contents: [
        { kind: 'category', name: 'スタート・行動', colour: COLOR_ON_TURN, contents: CHASER_ACTIONS.map(makeBlock) },
        { kind: 'category', name: 'まわりを見る', colour: COLOR_VIEW, contents: CHASER_VIEW.map(makeBlock) },
        { kind: 'category', name: '変数', colour: COLOR_STATE, contents: [{ kind: 'button', text: '変数を作成', callbackkey: 'CREATE_VAR' }, ...CHASER_STATE.map(makeBlock)] },
        { kind: 'sep' },
        { kind: 'category', name: '条件', colour: '210', contents: STD_LOGIC.map(makeBlock) },
        { kind: 'category', name: '数', colour: '230', contents: STD_MATH.map(makeBlock) },
      ],
    };
  };

  window.filterToolbox = function filterToolbox(tb, allowed) {
    const filterItems = (items) => items.flatMap((item) => {
      if (item.kind === 'category') {
        const children = filterItems(item.contents || []);
        return children.length ? [{ ...item, contents: children }] : [];
      }
      if (item.kind === 'block') return allowed.has(item.type) ? [item] : [];
      if (item.kind === 'button') return [...allowed].some((x) => x.startsWith('chaser_state_')) ? [item] : [];
      return [item];
    });
    const contents = filterItems(tb.contents).filter((item, i, arr) => (
      item.kind !== 'sep' || (i > 0 && i < arr.length - 1 && arr[i - 1].kind !== 'sep' && arr[i + 1].kind !== 'sep')
    ));
    return { ...tb, contents };
  };

  window.toolbox = function toolbox(set) {
    return window.filterToolbox(window.fullToolbox(), new Set(allowedFor(set)));
  };

  window.blockJson = function blockJson() {
    return [
      { type: 'chaser_on_start', message0: '最初に1回だけ', message1: 'やること %1', args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR_ON_TURN, tooltip: '最初の1回だけ動くブロックです。', hat: 'cap' },
      { type: 'chaser_on_turn', message0: '毎ターン', message1: 'やること %1', args1: [{ type: 'input_statement', name: 'DO' }], colour: COLOR_ON_TURN, tooltip: '毎ターンここから始まります。', hat: 'cap' },
      { type: 'chaser_turn_end', message0: 'ターンを終える', previousStatement: null, colour: COLOR_ON_TURN, tooltip: 'このターンを終了します。' },
      { type: 'chaser_state_create', message0: '変数を作る %1', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE, tooltip: '変数を作ります。' },
      { type: 'chaser_state_set', message0: '変数 %1 に %2 を入れる', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }, { type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE, tooltip: '変数に値を入れます。' },
      { type: 'chaser_state_get', message0: '変数 %1', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }], output: 'Number', colour: COLOR_STATE, tooltip: '変数の値を読みます。' },
      { type: 'chaser_state_change', message0: '変数 %1 を %2 だけ増減', args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }, { type: 'input_value', name: 'DELTA', check: 'Number' }], previousStatement: null, nextStatement: null, colour: COLOR_STATE, tooltip: '変数を増減します。' },
      { type: 'chaser_turn_number', message0: '現在のターン数', output: 'Number', colour: COLOR_STATE, tooltip: '現在のターン数を返します。' },
      { type: 'chaser_last_direction', message0: '前に進んだ向き', output: 'Direction', colour: COLOR_STATE, tooltip: '前に進んだ向きを返します。' },
      { type: 'chaser_direction_value', message0: '向き %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], output: 'Direction', colour: COLOR_STATE, tooltip: '向きを選びます。' },
      { type: 'chaser_action_walk_last', message0: '前に進んだ向きで歩く（最初は %1）', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: '前に進んだ向きで歩きます。' },
      { type: 'chaser_action_walk_random', message0: 'どこかに歩く', previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: 'ブロックを避けてランダムに歩きます。' },
      { type: 'chaser_action_walk', message0: '歩く %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: '1マス進みます。' },
      { type: 'chaser_action_put', message0: 'ブロックを置く %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: 'となりにブロックを置きます。' },
      { type: 'chaser_action_look', message0: '見る %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], output: 'Array', colour: COLOR_ACTION, tooltip: 'まわり3×3を見ます。' },
      { type: 'chaser_action_search', message0: 'まっすぐ見る %1', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS_UDLR }], output: 'Array', colour: COLOR_ACTION, tooltip: '直線9マスを見ます。' },
      { type: 'chaser_action_look_store', message0: '広く %1 を見た結果を %2 に入れる', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: 'まわり3×3の結果を変数に入れます。' },
      { type: 'chaser_action_search_store', message0: 'まっすぐ %1 を見た結果を %2 に入れる', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_variable', name: 'VAR', variable: 'x' }], previousStatement: null, nextStatement: null, colour: COLOR_ACTION, tooltip: '直線9マスの結果を変数に入れます。' },
      { type: 'chaser_get_tile', message0: '方向 %1 のマス', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }], output: 'Number', colour: COLOR_VIEW, tooltip: '上下左右のマスの種類を返します。' },
      { type: 'chaser_is_tile', message0: '方向 %1 のマスは %2 ?', args0: [{ type: 'field_dropdown', name: 'DIR', options: DIRS }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Boolean', colour: COLOR_VIEW, tooltip: '指定方向のマスを判定します。' },
      { type: 'chaser_get_around', message0: 'まわりの %1 番', args0: [{ type: 'input_value', name: 'INDEX', check: 'Number' }], output: 'Number', colour: COLOR_VIEW, tooltip: 'まわりの結果を参照します。' },
      { type: 'chaser_view_get_around', message0: '見た結果 %1 の %2 番', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'input_value', name: 'INDEX', check: 'Number' }], output: 'Number', colour: COLOR_VIEW, tooltip: '見た結果を参照します。' },
      { type: 'chaser_view_has_tile', message0: '見た結果 %1 に %2 がある', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Boolean', colour: COLOR_VIEW, tooltip: '見た結果の中に指定マスがあるか調べます。' },
      { type: 'chaser_view_count_tile', message0: '見た結果 %1 の %2 の数', args0: [{ type: 'input_value', name: 'VIEW' }, { type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Number', colour: COLOR_VIEW, tooltip: '見た結果に含まれるマスの数を数えます。' },
      { type: 'chaser_discard_value', message0: '結果を使わない %1', args0: [{ type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null, colour: COLOR_VIEW, tooltip: '結果を使わないときに使います。' },
      { type: 'chaser_tile_value', message0: 'マスの種類 %1', args0: [{ type: 'field_dropdown', name: 'TILE', options: TILE_OPTIONS }], output: 'Number', colour: COLOR_VIEW, tooltip: 'マスの種類を選びます。' },
    ];
  };

  window.registerGenerators = function registerGenerators() {
    const g = window.gen();
    g.forBlock.chaser_on_start = (b, gg) => `function onStart(api){${gg.statementToCode(b, 'DO')}}`;
    g.forBlock.chaser_on_turn = (b, gg) => `function onTurn(api){__chaserTurn=(typeof __chaserTurn==='number'?__chaserTurn:0)+1;let __chaserTurnEnded=false;${gg.statementToCode(b, 'DO')}if(!__chaserTurnEnded){throw new Error('ターンを終えるブロックを置いてください。');}}`;
    g.forBlock.chaser_turn_end = () => '__chaserTurnEnded=true;return;';
    g.forBlock.chaser_state_create = () => '';
    g.forBlock.chaser_state_set = (b) => `${g.getVariableName(b.getFieldValue('VAR'))}=${g.valueToCode(b, 'VALUE', 0) || '0'};`;
    g.forBlock.chaser_state_get = (b) => [g.getVariableName(b.getFieldValue('VAR')), 0];
    g.forBlock.chaser_state_change = (b) => {
      const name = g.getVariableName(b.getFieldValue('VAR'));
      const delta = g.valueToCode(b, 'DELTA', 0) || '0';
      return `${name}=(typeof ${name}==='number'?${name}:0)+(${delta});`;
    };
    g.forBlock.chaser_turn_number = () => ['__chaserTurn', 0];
    g.forBlock.chaser_last_direction = () => ["(__chaserLastAction&&__chaserLastAction.dir)||'Up'", 0];
    g.forBlock.chaser_direction_value = (b) => [`'${b.getFieldValue('DIR') || 'Up'}'`, 0];
    g.forBlock.chaser_action_walk_last = (b) => {
      const fallback = b.getFieldValue('DIR') || 'Up';
      return `(()=>{const d=(__chaserLastAction&&__chaserLastAction.dir)||'${fallback}';__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();`;
    };
    g.forBlock.chaser_action_walk_random = () => "(()=>{const ds=['Up','Down','Left','Right'];const ok=ds.filter(d=>api.around[({Up:1,Down:7,Left:3,Right:5})[d]]!==2);const pool=ok.length?ok:ds;const d=pool[Math.floor(Math.random()*pool.length)];__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();";
    ['walk', 'put'].forEach((method) => {
      g.forBlock['chaser_action_' + method] = (b) => {
        const dir = b.getFieldValue('DIR') || 'Right';
        return `__chaserLastAction={kind:'${method}',dir:'${dir}'};api.${method + dir}();`;
      };
    });
    ['look', 'search'].forEach((method) => {
      g.forBlock['chaser_action_' + method] = (b) => {
        const dir = b.getFieldValue('DIR') || 'Right';
        return [`(()=>{__chaserLastAction={kind:'${method}',dir:'${dir}'};return api.${method + dir}();})()`, 0];
      };
      g.forBlock['chaser_action_' + method + '_store'] = (b) => {
        const dir = b.getFieldValue('DIR') || 'Right';
        const name = g.getVariableName(b.getFieldValue('VAR'));
        return `__chaserLastAction={kind:'${method}',dir:'${dir}'};${name}=api.${method + dir}();`;
      };
    });
    g.forBlock.chaser_get_tile = (b) => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]`, 0];
    g.forBlock.chaser_is_tile = (b) => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]===${b.getFieldValue('TILE') || '0'}`, 0];
    g.forBlock.chaser_get_around = (b) => [`api.around[${g.valueToCode(b, 'INDEX', 0) || '0'}]`, 0];
    g.forBlock.chaser_view_get_around = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'})[${g.valueToCode(b, 'INDEX', 0) || '0'}]`, 0];
    g.forBlock.chaser_view_has_tile = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'}).includes(${b.getFieldValue('TILE') || '0'})`, 0];
    g.forBlock.chaser_view_count_tile = (b) => [`(${g.valueToCode(b, 'VIEW', 0) || '[]'}).filter(v=>v===${b.getFieldValue('TILE') || '0'}).length`, 0];
    g.forBlock.chaser_discard_value = (b) => `${g.valueToCode(b, 'VALUE', 0) || 'undefined'};`;
    g.forBlock.chaser_tile_value = (b) => [b.getFieldValue('TILE') || '0', 0];
  };

  function syncGlobalOverrides() {
    try { fullToolbox = window.fullToolbox; } catch (_) {}
    try { filterToolbox = window.filterToolbox; } catch (_) {}
    try { toolbox = window.toolbox; } catch (_) {}
    try { blockJson = window.blockJson; } catch (_) {}
    try { registerGenerators = window.registerGenerators; } catch (_) {}
  }
  syncGlobalOverrides();

  window.compileBot = function compileBot() {
    const g = window.gen();
    g.init(window.st.ws);
    const code = g.workspaceToCode(window.st.ws);
    const vars = window.st.ws.getVariableMap().getAllVariables().map((v) => g.getVariableName(v.getId()));
    const defs = vars.map((name) => `var ${name}=0;`).join(';');
    const src = `var __chaserLastAction=null;var __chaserTurn=0;${defs};${code};return {onStart:typeof onStart==='function'?onStart:null,onTurn:typeof onTurn==='function'?onTurn:null};`;
    return new Function(src)();
  };

  window.resetRuntime = function resetRuntime(stage) {
    window.saveXml();
    window.st.play = window.initPlay(stage, window.st.map);
    window.st.bot = window.compileBot();
    try {
      if (window.st.bot.onStart) window.st.bot.onStart(window.makeApi());
    } catch (error) {
      window.fail(`初期化エラー: ${error.message}`);
    }
  };

  window.runOneFromButton = function runOneFromButton(stage) {
    window.ensureRunningFromButton(stage);
    window.runTurn();
    window.drawRuntime();
  };

  window.runTurn = function runTurn() {
    if (!window.st.play || window.st.play.status !== 'running') return;
    if (!window.st.bot) window.st.bot = window.compileBot();
    try {
      window.st.play.pending = null;
      const api = window.makeApi();
      if (!window.st.bot.onTurn) {
        window.fail('毎ターンブロックがありません');
        return;
      }
      window.st.bot.onTurn(api);
      window.applyPending();
    } catch (error) {
      window.fail(`Blockly実行エラー: ${error.message}`);
    }
  };

  window.delta = (dir) => ({ Up: { x: 0, y: -1 }, Down: { x: 0, y: 1 }, Left: { x: -1, y: 0 }, Right: { x: 1, y: 0 } }[dir] || { x: 0, y: 0 });

  window.tileAt = function tileAt(play, x, y) {
    if (y < 0 || y >= play.tiles.length || x < 0 || x >= play.tiles[y].length) return 2;
    if (play.hot && play.hot.x === x && play.hot.y === y) return 1;
    if (play.cool && play.cool.x === x && play.cool.y === y) return 1;
    const ch = play.tiles[y][x];
    return ch === '#' ? 2 : ch === 'I' ? 3 : 0;
  };

  window.around = function around() {
    const play = window.st.play;
    const result = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) result.push(window.tileAt(play, play.cool.x + dx, play.cool.y + dy));
    }
    return result;
  };

  window.look = () => window.around();

  window.search = function search(dir) {
    const play = window.st.play;
    const delta = window.delta(dir);
    const result = [];
    for (let i = 1; i <= 9; i++) result.push(window.tileAt(play, play.cool.x + delta.x * i, play.cool.y + delta.y * i));
    return result;
  };

  window.makeApi = function makeApi() {
    const api = { around: window.around() };
    ['Up', 'Down', 'Left', 'Right'].forEach((dir) => {
      api['walk' + dir] = () => { window.st.play.pending = { kind: 'walk', dir }; window.st.play.lastDir = dir; };
      api['put' + dir] = () => { window.st.play.pending = { kind: 'put', dir }; window.st.play.lastDir = dir; };
      api['look' + dir] = () => { window.st.play.pending = { kind: 'look', dir }; window.st.play.lastDir = dir; return window.look(dir); };
      api['search' + dir] = () => { window.st.play.pending = { kind: 'search', dir }; window.st.play.lastDir = dir; return window.search(dir); };
    });
    return api;
  };

  window.applyPending = function applyPending() {
    const play = window.st.play;
    const action = play.pending;
    play.turn++;
    if (!action) {
      play.logs.push(`${play.turn}: actionなし`);
      window.judge();
      return;
    }
    if (action.kind === 'look' || action.kind === 'search') {
      play.logs.push(`${play.turn}: ${action.kind}${action.dir}`);
      window.judge();
      return;
    }
    if (action.kind === 'walk') {
      const delta = window.delta(action.dir);
      const x = play.cool.x + delta.x;
      const y = play.cool.y + delta.y;
      if (window.tileAt(play, x, y) === 2) {
        window.fail(`壁: walk${action.dir}`);
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
      window.judge();
      return;
    }
    if (action.kind === 'put') {
      const delta = window.delta(action.dir);
      const x = play.cool.x + delta.x;
      const y = play.cool.y + delta.y;
      if (play.hot && play.hot.x === x && play.hot.y === y) {
        play.status = 'success';
        play.msg = 'put成功';
        play.logs.push(`${play.turn}: put${action.dir} / win`);
        return;
      }
      if (y >= 0 && y < play.tiles.length && x >= 0 && x < play.tiles[y].length && play.tiles[y][x] === '.') play.tiles[y][x] = '#';
      play.logs.push(`${play.turn}: put${action.dir}`);
      window.judge();
    }
  };

  window.fail = function fail(message) {
    window.st.play.status = 'failed';
    window.st.play.msg = message;
    window.st.play.logs.push(`失敗: ${message}`);
  };

  window.judge = function judge() {
    const play = window.st.play;
    const validation = play.validation;
    const remainingItems = play.tiles.reduce((sum, row) => sum + row.filter((ch) => ch === 'I').length, 0);
    if (validation.kind === 'reachGoal' && play.goal && play.cool.x === play.goal.x && play.cool.y === play.goal.y) {
      if (validation.requireAllItems && remainingItems > 0) {
        window.fail('アイテム未回収');
        return;
      }
      play.status = 'success';
      play.msg = 'ゴール到達';
      play.logs.push('成功: ゴール到達');
      return;
    }
    if (validation.kind === 'collectItems' && play.items >= validation.minItems) {
      play.status = 'success';
      play.msg = 'アイテム条件達成';
      return;
    }
    if (validation.kind === 'survive' && play.turn >= validation.minTurns) {
      play.status = 'success';
      play.msg = '生存条件達成';
      return;
    }
    if (validation.maxActions && play.turn >= validation.maxActions) window.fail(`最大${validation.maxActions}手を超過`);
  };

  window.startAuto = function startAuto(stage) {
    window.stopAuto();
    window.ensureRunningFromButton(stage);
    window.drawRuntime();
    window.st.timer = setInterval(() => {
      if (!window.st.play || window.st.play.status !== 'running') {
        window.stopAuto();
        window.drawRuntime();
        return;
      }
      window.runTurn();
      window.drawRuntime();
    }, 350);
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function scriptSafeJson(value) {
    return JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
  }

  function countStages(phases) {
    return phases.reduce((sum, phase) => sum + (phase.stages ? phase.stages.length : 0), 0);
  }

  window.buildReviewHtml = function buildReviewHtml(phases) {
    const safePhases = scriptSafeJson(phases || []);
    const stageCount = countStages(phases || []);
    const groupCount = (phases || []).length;
    return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CHaser チュートリアル ステージ一覧</title>
<style>
:root{--cool:#38bdf8;--hot:#fb7185;--ink:#0f172a;--ink-soft:#334155;--panel-strong:rgba(255,255,255,0.97);--border:rgba(15,23,42,0.12);--font-ui:"Space Grotesk",system-ui,sans-serif;--font-display:"Oxanium","Space Grotesk",system-ui,sans-serif;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:var(--font-ui);color:var(--ink);background-color:#f8fafc;background-image:radial-gradient(700px 400px at 8% 12%,rgba(56,189,248,0.18),transparent 65%),radial-gradient(680px 380px at 95% -4%,rgba(251,146,60,0.20),transparent 60%),linear-gradient(rgba(15,23,42,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,0.04) 1px,transparent 1px),linear-gradient(180deg,#f8fafc 0%,#f1f5f9 55%,#eef2ff 100%);background-size:auto,auto,26px 26px,26px 26px,auto;min-height:100vh;}
.site-header{position:sticky;top:0;z-index:50;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border-bottom:1px solid rgba(148,163,184,0.2);box-shadow:0 4px 24px rgba(15,23,42,0.25);}
.header-inner{max-width:1400px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.header-logo{font-family:var(--font-display);font-size:20px;font-weight:800;letter-spacing:0.1em;color:#f8fafc;}
.header-logo span{color:var(--cool);}
.header-sub{font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(148,163,184,0.8);margin-left:8px;}
.header-count{margin-left:auto;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.3);border-radius:999px;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e2e8f0;}
.phase-nav{max-width:1400px;margin:0 auto;padding:16px 24px 0;display:flex;gap:8px;flex-wrap:wrap;}
.phase-tab{padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;cursor:pointer;transition:all 0.15s;text-decoration:none;border:1px solid transparent;}
.main{max-width:1400px;margin:0 auto;padding:24px;}
.phase-section{margin-bottom:48px;}
.phase-header{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px 20px;border-radius:20px;color:#e2e8f0;background:linear-gradient(120deg,#0f172a 0%,#1e293b 55%,#0b1020 100%);border:1px solid rgba(148,163,184,0.22);}
.phase-label{font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:0.12em;}
.phase-name{font-size:15px;font-weight:600;color:#cbd5e1;}
.phase-range{margin-left:auto;font-size:11px;font-weight:700;letter-spacing:0.14em;color:rgba(226,232,240,0.6);text-transform:uppercase;}
.stage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;}
.stage-card{background:var(--panel-strong);border:1px solid var(--border);border-radius:24px;box-shadow:0 8px 24px rgba(15,23,42,0.08),inset 0 1px 0 rgba(255,255,255,0.7);display:flex;flex-direction:column;overflow:hidden;}
.card-header{padding:14px 18px 10px;display:flex;align-items:flex-start;gap:10px;border-bottom:1px solid var(--border);}
.step-num{font-family:var(--font-display);font-size:28px;font-weight:800;letter-spacing:-0.01em;line-height:1;min-width:42px;color:var(--ink);}
.card-title-area{flex:1;}
.card-title{font-size:14px;font-weight:700;color:var(--ink);line-height:1.3;}
.card-id{font-size:10px;color:#94a3b8;margin-top:2px;font-family:monospace;}
.phase-pip{width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0;}
.card-badges{padding:8px 18px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--border);}
.badge{font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid transparent;}
.badge--block{background:#f1f5f9;color:#475569;border-color:#cbd5e1}.badge--var{background:#ede9fe;color:#7c3aed;border-color:#c4b5fd}.badge--cond{background:#e0f2fe;color:#0369a1;border-color:#7dd3fc}.badge--items{background:#fef3c7;color:#92400e;border-color:#fcd34d}.badge--look{background:#ccfbf1;color:#0f766e;border-color:#5eead4}.badge--put{background:#fee2e2;color:#991b1b;border-color:#fca5a5}.badge--enemy{background:#ffedd5;color:#9a3412;border-color:#fdba74}.badge--count{background:#f3e8ff;color:#7e22ce;border-color:#d8b4fe}.badge--goal{background:#f0fdf4;color:#166534;border-color:#86efac}.badge--survive{background:#fff1f2;color:#9f1239;border-color:#fda4af}.badge--new-sys{background:#fdf4ff;color:#86198f;border-color:#e879f9;}
.card-body{padding:12px 18px;flex:1;display:flex;flex-direction:column;gap:10px;}
.field-label{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px;}
.field-value{font-size:12px;color:var(--ink-soft);line-height:1.5;}
.field-mono{font-family:monospace;font-size:11px;}
.maps-wrap{display:flex;flex-wrap:wrap;gap:12px;}
.map-label{font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;}
.map-grid{display:inline-grid;gap:1px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:8px;padding:4px;}
.map-row{display:flex;}
.cell{width:16px;height:16px;border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;font-family:monospace;}
.c-wall{background:#1e293b}.c-floor{background:#f8fafc}.c-item{background:#fbbf24}.c-cool{background:#38bdf8}.c-hot{background:#fb7185}.c-goal{background:#34d399}
.solution-image{max-width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:6px;background:#fff;}
.solution-image img{max-width:100%;display:block;border-radius:8px;}
.phase-anchor{scroll-margin-top:80px;}
@media (max-width:600px){.stage-grid{grid-template-columns:1fr}.main{padding:16px}.phase-header{align-items:flex-start;flex-direction:column}.phase-range{margin-left:0}}
</style></head>
<body>
<header class="site-header"><div class="header-inner"><div><span class="header-logo">CH<span>aser</span></span><span class="header-sub">Tutorial Stage Review</span></div><div class="header-count">${stageCount} Stages · ${groupCount} Groups</div></div></header>
<nav class="phase-nav" aria-label="フェーズ" id="phase-nav"></nav>
<main class="main" id="main"></main>
<script>
const PHASES = ${safePhases};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderMap(rows){const map={'#':'wall','.':'floor','I':'item','C':'cool','H':'hot','G':'goal',' ':'floor'};const label={wall:'',floor:'',item:'I',cool:'C',hot:'H',goal:'G'};return (rows||[]).map(row=>'<div class="map-row">'+[...row].map(ch=>{const cls=map[ch]||'floor';return '<div class="cell c-'+cls+'">'+(label[cls]||'')+'</div>';}).join('')+'</div>').join('');}
function mapBlock(label,rows,note){if(!rows||!rows.length)return '';return '<div><div class="map-label">'+esc(label)+'</div><div class="map-grid">'+renderMap(rows)+'</div>'+(note?'<div style="font-size:10px;color:#64748b;margin-top:3px">'+esc(note)+'</div>':'')+'</div>';}
function blockBadge(set){const cls={BASIC:'badge--block',CHECK:'badge--cond',STATE:'badge--var',LOOK:'badge--look',SEARCH:'badge--look',ENEMY:'badge--enemy',COUNT:'badge--count'};return '<span class="badge '+(cls[set]||'badge--block')+'">'+esc(set)+'</span>';}
function condBadge(cond){const c=(cond||'').toLowerCase();let cls='badge--goal';if(c.includes('put'))cls='badge--put';else if(c.includes('survive'))cls='badge--survive';else if(c.includes('items'))cls='badge--items';return '<span class="badge '+cls+'">'+esc(cond)+'</span>';}
function stageCard(s,phColor){const variants=s.variants||(s.maps?s.maps.length:1);const badges=[blockBadge(s.blockSet),'<span class="badge badge--block">'+variants+'バリアント</span>',condBadge(s.cond),s.ai?'<span class="badge badge--enemy">AI: '+esc(s.ai)+'</span>':'',s.newSys?'<span class="badge badge--new-sys">⚠ '+esc(s.newSys)+'</span>':''].filter(Boolean).join('');const mapsHTML=s.maps&&s.maps.length?'<div><div class="field-label">マップ</div><div class="maps-wrap">'+s.maps.map(m=>mapBlock(m.label,m.rows,m.note||'')).join('')+'</div></div>':'';const sol=s.solution&&s.solution.imageDataUrl?'<div><div class="field-label">模範解答</div><div class="solution-image"><img src="'+s.solution.imageDataUrl+'" alt="模範解答"></div>'+(s.solution.note?'<div class="field-value">'+esc(s.solution.note)+'</div>':'')+'</div>':'';return '<div class="stage-card"><div class="card-header"><div class="step-num">'+String(s.no).padStart(2,'0')+'</div><div class="card-title-area"><div class="card-title">'+esc(s.title)+'</div><div class="card-id">'+esc(s.id)+'</div></div><div class="phase-pip" style="background:'+phColor+'"></div></div><div class="card-badges">'+badges+'</div><div class="card-body"><div><div class="field-label">学習目標</div><div class="field-value">'+esc(s.goal)+'</div></div><div><div class="field-label">反応型ルール</div><div class="field-value field-mono">'+(esc(s.rule)||'—')+'</div></div>'+mapsHTML+sol+'</div></div>';}
const main=document.getElementById('main');const nav=document.getElementById('phase-nav');
nav.innerHTML=PHASES.map(p=>'<a class="phase-tab" style="background:'+(p.bg||'#f1f5f9')+';color:'+(p.color||'#64748b')+';border-color:'+(p.color||'#64748b')+'" href="#phase-'+p.id+'">'+p.id+' '+esc(p.name)+'</a>').join('');
PHASES.forEach(ph=>{main.innerHTML+='<section class="phase-section phase-anchor" id="phase-'+ph.id+'"><div class="phase-header"><div class="phase-label" style="color:'+(ph.color||'#64748b')+'">Phase '+ph.id+'</div><div><div class="phase-name">'+esc(ph.name)+'</div><div style="font-size:11px;color:#94a3b8;margin-top:2px">'+esc(ph.desc||'')+'</div></div><div class="phase-range">Step '+esc(ph.range||'')+'</div></div><div class="stage-grid">'+(ph.stages||[]).map(s=>stageCard(s,ph.color||'#64748b')).join('')+'</div></section>';});
<\/script>
</body></html>`;
  };

  function downloadText(text, name, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  window.exportReviewHtmlFromEditor = function exportReviewHtmlFromEditor() {
    if (typeof window.saveXml === 'function') window.saveXml();
    downloadText(window.buildReviewHtml(window.st?.phases || []), 'stage_review_next.html', 'text/html');
  };

  function renderBlockSetEditor() {
    const body = document.getElementById('body');
    const setNames = typeof SETS !== 'undefined' ? SETS : Object.keys(DEFAULT_BLOCK_SETS);
    const selected = setNames.includes(window.st.blockSetEdit) ? window.st.blockSetEdit : setNames[0];
    window.st.blockSetEdit = selected;
    const allowed = new Set(allowedFor(selected));
    const currentStage = typeof curStage === 'function' ? curStage() : null;
    body.innerHTML = `
      <div class="panel">
        <div class="grid">
          <div class="field">
            <label>編集するブロックセット</label>
            <select id="bs-select">${setNames.map((set) => `<option value="${set}" ${set === selected ? 'selected' : ''}>${set}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>選択中ステージ</label>
            <div class="hint">${currentStage ? `${escapeHtml(currentStage.title)} / ${escapeHtml(currentStage.blockSet)}` : '—'}</div>
          </div>
        </div>
        <div class="controls">
          <button class="btn" id="bs-check-all">すべて選択</button>
          <button class="btn" id="bs-uncheck-all">すべて外す</button>
          <button class="btn warn" id="bs-reset-one">このセットを既定に戻す</button>
          <button class="btn danger" id="bs-reset-all">全セットを既定に戻す</button>
        </div>
        <div class="hint">「最初に1回だけやること」ブロックは、以前の指定どおりどのセットにも入れられないようにしています。</div>
      </div>
      <div class="grid" style="margin-top:12px">
        ${BLOCK_CATALOG.map((cat) => `
          <div class="panel">
            <div class="section" style="margin-top:0">${escapeHtml(cat.group)}</div>
            ${cat.blocks.map(([type, label]) => `
              <label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:12px">
                <input type="checkbox" class="bs-block" value="${type}" ${allowed.has(type) ? 'checked' : ''}>
                <span><b>${escapeHtml(label)}</b><br><span class="hint mono">${escapeHtml(type)}</span></span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('bs-select').onchange = (event) => {
      window.st.blockSetEdit = event.target.value;
      renderBlockSetEditor();
    };
    document.querySelectorAll('.bs-block').forEach((input) => {
      input.onchange = () => {
        const selectedSet = window.st.blockSetEdit;
        const checked = [...document.querySelectorAll('.bs-block:checked')].map((el) => el.value);
        currentBlockSets()[selectedSet] = normalizeAllowed(checked, []);
        applyBlockSets(currentBlockSets());
        if (window.st.ws && typeof curStage === 'function' && curStage()?.blockSet === selectedSet) {
          window.st.ws.updateToolbox(window.toolbox(selectedSet));
        }
        window.saveLocal();
      };
    });
    document.getElementById('bs-check-all').onclick = () => {
      currentBlockSets()[window.st.blockSetEdit] = [...CATALOG_TYPES];
      applyBlockSets(currentBlockSets());
      window.saveLocal();
      renderBlockSetEditor();
    };
    document.getElementById('bs-uncheck-all').onclick = () => {
      currentBlockSets()[window.st.blockSetEdit] = [];
      applyBlockSets(currentBlockSets());
      window.saveLocal();
      renderBlockSetEditor();
    };
    document.getElementById('bs-reset-one').onclick = () => {
      currentBlockSets()[window.st.blockSetEdit] = [...(DEFAULT_BLOCK_SETS[window.st.blockSetEdit] || [])];
      applyBlockSets(currentBlockSets());
      window.saveLocal();
      renderBlockSetEditor();
    };
    document.getElementById('bs-reset-all').onclick = () => {
      if (!confirm('全ブロックセットを既定に戻しますか？')) return;
      applyBlockSets(DEFAULT_BLOCK_SETS);
      window.saveLocal();
      renderBlockSetEditor();
    };
  }

  function installBlockSetEditorTab() {
    if (typeof TABS !== 'undefined' && Array.isArray(TABS) && !TABS.some(([id]) => id === 'blocksets')) {
      TABS.push(['blocksets', 'ブロックセット']);
    }
    const originalRenderMain = window.renderMain;
    window.renderMain = function renderMainWithBlockSets() {
      if (window.st.tab !== 'blocksets') return originalRenderMain();
      const stage = typeof curStage === 'function' ? curStage() : null;
      const main = document.getElementById('main');
      if (!stage) {
        main.innerHTML = '<div class=empty>JSONを読み込んでください</div>';
        return;
      }
      main.innerHTML = `<div class=tabs>${TABS.map(([id, label]) => `<div class="tab ${window.st.tab === id ? 'active' : ''}" data-tab="${id}">${label}</div>`).join('')}</div><div id=body></div>`;
      main.querySelectorAll('.tab').forEach((tab) => {
        tab.onclick = () => {
          if (window.st.tab === 'play' && typeof window.saveXml === 'function') window.saveXml();
          if (typeof window.disposeBlockly === 'function') window.disposeBlockly();
          window.st.tab = tab.dataset.tab;
          window.renderMain();
        };
      });
      renderBlockSetEditor();
    };
    try { renderMain = window.renderMain; } catch (_) {}
  }

  const originalSaveLocal = window.saveLocal;
  window.saveLocal = function saveLocalWithBlockSets() {
    localStorage.setItem(STORAGE, JSON.stringify(editorPayload()));
  };
  try { saveLocal = window.saveLocal; } catch (_) {}

  const originalSaveJson = window.saveJson;
  window.saveJson = function saveJsonWithBlockSets() {
    if (typeof window.saveXml === 'function') window.saveXml();
    downloadText(JSON.stringify(editorPayload(), null, 2), `chaiser-stages-v2-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };
  try { saveJson = window.saveJson; } catch (_) {}

  const originalLoadObj = window.loadObj;
  window.loadObj = function loadObjWithBlockSets(obj) {
    originalLoadObj(obj);
    applyBlockSets(obj && obj.blockSets ? obj.blockSets : undefined);
    window.saveLocal();
    if (typeof window.render === 'function') window.render();
  };
  try { loadObj = window.loadObj; } catch (_) {}

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    applyBlockSets(stored.blockSets);
  } catch (_) {
    applyBlockSets(undefined);
  }

  installBlockSetEditorTab();

  const exportButton = document.getElementById('export-review');
  if (exportButton) exportButton.onclick = window.exportReviewHtmlFromEditor;
  const saveButton = document.getElementById('save-json');
  if (saveButton) saveButton.onclick = window.saveJson;

  if (typeof window.renderMain === 'function') window.renderMain();
})();