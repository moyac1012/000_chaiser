(() => {
  const COLOR_ACTION = '#f97316';
  const COLOR_ON_TURN = '#2563eb';
  const COLOR_VIEW = '#06b6d4';
  const COLOR_STATE = '#22c55e';
  const DIRS = [['→ 右','Right'],['← 左','Left'],['↑ 上','Up'],['↓ 下','Down']];
  const DIRS_UDLR = [['↑ 上','Up'],['↓ 下','Down'],['← 左','Left'],['→ 右','Right']];
  const TILE_OPTIONS = [['床 (0)','0'],['プレイヤー (1)','1'],['ブロック (2)','2'],['アイテム (3)','3']];
  const AROUND_INDEX = {Up:1,Down:7,Left:3,Right:5};

  window.blockJson = function blockJson() {
    return [
      {type:'chaser_on_start',message0:'最初に1回だけ',message1:'やること %1',args1:[{type:'input_statement',name:'DO'}],colour:COLOR_ON_TURN,tooltip:'最初の1回だけ動くブロックです。',hat:'cap'},
      {type:'chaser_on_turn',message0:'毎ターン',message1:'やること %1',args1:[{type:'input_statement',name:'DO'}],colour:COLOR_ON_TURN,tooltip:'毎ターンここから始まります。',hat:'cap'},
      {type:'chaser_turn_end',message0:'ターンを終える',previousStatement:null,colour:COLOR_ON_TURN,tooltip:'このターンを終了します。'},
      {type:'chaser_state_create',message0:'変数を作る %1',args0:[{type:'field_variable',name:'VAR',variable:'x'}],previousStatement:null,nextStatement:null,colour:COLOR_STATE,tooltip:'変数を作ります。'},
      {type:'chaser_state_set',message0:'変数 %1 に %2 を入れる',args0:[{type:'field_variable',name:'VAR',variable:'x'},{type:'input_value',name:'VALUE'}],previousStatement:null,nextStatement:null,colour:COLOR_STATE,tooltip:'変数に値を入れます。'},
      {type:'chaser_state_get',message0:'変数 %1',args0:[{type:'field_variable',name:'VAR',variable:'x'}],output:'Number',colour:COLOR_STATE,tooltip:'変数の値を読みます。'},
      {type:'chaser_state_change',message0:'変数 %1 を %2 だけ増減',args0:[{type:'field_variable',name:'VAR',variable:'x'},{type:'input_value',name:'DELTA',check:'Number'}],previousStatement:null,nextStatement:null,colour:COLOR_STATE,tooltip:'変数を増減します。'},
      {type:'chaser_turn_number',message0:'現在のターン数',output:'Number',colour:COLOR_STATE,tooltip:'現在のターン数を返します。'},
      {type:'chaser_last_direction',message0:'前に進んだ向き',output:'Direction',colour:COLOR_STATE,tooltip:'前に進んだ向きを返します。'},
      {type:'chaser_direction_value',message0:'向き %1',args0:[{type:'field_dropdown',name:'DIR',options:DIRS}],output:'Direction',colour:COLOR_STATE,tooltip:'向きを選びます。'},
      {type:'chaser_action_walk_last',message0:'前に進んだ向きで歩く（最初は %1）',args0:[{type:'field_dropdown',name:'DIR',options:DIRS}],previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'前に進んだ向きで歩きます。'},
      {type:'chaser_action_walk_random',message0:'どこかに歩く',previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'ブロックを避けてランダムに歩きます。'},
      {type:'chaser_action_walk',message0:'歩く %1',args0:[{type:'field_dropdown',name:'DIR',options:DIRS_UDLR}],previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'1マス進みます。'},
      {type:'chaser_action_put',message0:'ブロックを置く %1',args0:[{type:'field_dropdown',name:'DIR',options:DIRS_UDLR}],previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'となりにブロックを置きます。'},
      {type:'chaser_action_look',message0:'見る %1',args0:[{type:'field_dropdown',name:'DIR',options:DIRS_UDLR}],output:'Array',colour:COLOR_ACTION,tooltip:'まわり3×3を見ます。'},
      {type:'chaser_action_search',message0:'まっすぐ見る %1',args0:[{type:'field_dropdown',name:'DIR',options:DIRS_UDLR}],output:'Array',colour:COLOR_ACTION,tooltip:'直線9マスを見ます。'},
      {type:'chaser_action_look_store',message0:'広く %1 を見た結果を %2 に入れる',args0:[{type:'field_dropdown',name:'DIR',options:DIRS},{type:'field_variable',name:'VAR',variable:'x'}],previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'まわり3×3の結果を変数に入れます。'},
      {type:'chaser_action_search_store',message0:'まっすぐ %1 を見た結果を %2 に入れる',args0:[{type:'field_dropdown',name:'DIR',options:DIRS},{type:'field_variable',name:'VAR',variable:'x'}],previousStatement:null,nextStatement:null,colour:COLOR_ACTION,tooltip:'直線9マスの結果を変数に入れます。'},
      {type:'chaser_get_tile',message0:'方向 %1 のマス',args0:[{type:'field_dropdown',name:'DIR',options:DIRS}],output:'Number',colour:COLOR_VIEW,tooltip:'上下左右のマスの種類を返します。'},
      {type:'chaser_is_tile',message0:'方向 %1 のマスは %2 ?',args0:[{type:'field_dropdown',name:'DIR',options:DIRS},{type:'field_dropdown',name:'TILE',options:TILE_OPTIONS}],output:'Boolean',colour:COLOR_VIEW,tooltip:'指定方向のマスを判定します。'},
      {type:'chaser_get_around',message0:'まわりの %1 番',args0:[{type:'input_value',name:'INDEX',check:'Number'}],output:'Number',colour:COLOR_VIEW,tooltip:'まわりの結果を参照します。'},
      {type:'chaser_view_get_around',message0:'見た結果 %1 の %2 番',args0:[{type:'input_value',name:'VIEW'},{type:'input_value',name:'INDEX',check:'Number'}],output:'Number',colour:COLOR_VIEW,tooltip:'見た結果を参照します。'},
      {type:'chaser_view_has_tile',message0:'見た結果 %1 に %2 がある',args0:[{type:'input_value',name:'VIEW'},{type:'field_dropdown',name:'TILE',options:TILE_OPTIONS}],output:'Boolean',colour:COLOR_VIEW,tooltip:'見た結果の中に指定マスがあるか調べます。'},
      {type:'chaser_view_count_tile',message0:'見た結果 %1 の %2 の数',args0:[{type:'input_value',name:'VIEW'},{type:'field_dropdown',name:'TILE',options:TILE_OPTIONS}],output:'Number',colour:COLOR_VIEW,tooltip:'見た結果に含まれるマスの数を数えます。'},
      {type:'chaser_discard_value',message0:'結果を使わない %1',args0:[{type:'input_value',name:'VALUE'}],previousStatement:null,nextStatement:null,colour:COLOR_VIEW,tooltip:'結果を使わないときに使います。'},
      {type:'chaser_tile_value',message0:'マスの種類 %1',args0:[{type:'field_dropdown',name:'TILE',options:TILE_OPTIONS}],output:'Number',colour:COLOR_VIEW,tooltip:'マスの種類を選びます。'}
    ];
  };

  window.registerGenerators = function registerGenerators() {
    const g = window.gen();
    g.forBlock.chaser_on_start = (b, gg) => `function onStart(api){${gg.statementToCode(b,'DO')}}`;
    g.forBlock.chaser_on_turn = (b, gg) => `function onTurn(api){__chaserTurn=(typeof __chaserTurn==='number'?__chaserTurn:0)+1;let __chaserTurnEnded=false;${gg.statementToCode(b,'DO')}if(!__chaserTurnEnded){throw new Error('ターンを終えるブロックを置いてください。');}}`;
    g.forBlock.chaser_turn_end = () => `__chaserTurnEnded=true;return;`;
    g.forBlock.chaser_state_create = () => '';
    g.forBlock.chaser_state_set = b => `${g.getVariableName(b.getFieldValue('VAR'))}=${g.valueToCode(b,'VALUE',0)||'0'};`;
    g.forBlock.chaser_state_get = b => [g.getVariableName(b.getFieldValue('VAR')),0];
    g.forBlock.chaser_state_change = b => {
      const n = g.getVariableName(b.getFieldValue('VAR'));
      const d = g.valueToCode(b,'DELTA',0) || '0';
      return `${n}=(typeof ${n}==='number'?${n}:0)+(${d});`;
    };
    g.forBlock.chaser_turn_number = () => ['__chaserTurn',0];
    g.forBlock.chaser_last_direction = () => [`(__chaserLastAction&&__chaserLastAction.dir)||'Up'`,0];
    g.forBlock.chaser_direction_value = b => [`'${b.getFieldValue('DIR')||'Up'}'`,0];
    g.forBlock.chaser_action_walk_last = b => {
      const f = b.getFieldValue('DIR') || 'Up';
      return `(()=>{const d=(__chaserLastAction&&__chaserLastAction.dir)||'${f}';__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();`;
    };
    g.forBlock.chaser_action_walk_random = () => `(()=>{const ds=['Up','Down','Left','Right'];const ok=ds.filter(d=>api.around[({Up:1,Down:7,Left:3,Right:5})[d]]!==2);const pool=ok.length?ok:ds;const d=pool[Math.floor(Math.random()*pool.length)];__chaserLastAction={kind:'walk',dir:d};api['walk'+d]();})();`;
    ['walk','put'].forEach(method => {
      g.forBlock['chaser_action_' + method] = b => {
        const d = b.getFieldValue('DIR') || 'Right';
        return `__chaserLastAction={kind:'${method}',dir:'${d}'};api.${method+d}();`;
      };
    });
    ['look','search'].forEach(method => {
      g.forBlock['chaser_action_' + method] = b => {
        const d = b.getFieldValue('DIR') || 'Right';
        return [`(()=>{__chaserLastAction={kind:'${method}',dir:'${d}'};return api.${method+d}();})()`,0];
      };
      g.forBlock['chaser_action_' + method + '_store'] = b => {
        const d = b.getFieldValue('DIR') || 'Right';
        const n = g.getVariableName(b.getFieldValue('VAR'));
        return `__chaserLastAction={kind:'${method}',dir:'${d}'};${n}=api.${method+d}();`;
      };
    });
    g.forBlock.chaser_get_tile = b => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]`,0];
    g.forBlock.chaser_is_tile = b => [`api.around[${AROUND_INDEX[b.getFieldValue('DIR')] ?? 5}]===${b.getFieldValue('TILE')||'0'}`,0];
    g.forBlock.chaser_get_around = b => [`api.around[${g.valueToCode(b,'INDEX',0)||'0'}]`,0];
    g.forBlock.chaser_view_get_around = b => [`(${g.valueToCode(b,'VIEW',0)||'[]'})[${g.valueToCode(b,'INDEX',0)||'0'}]`,0];
    g.forBlock.chaser_view_has_tile = b => [`(${g.valueToCode(b,'VIEW',0)||'[]'}).includes(${b.getFieldValue('TILE')||'0'})`,0];
    g.forBlock.chaser_view_count_tile = b => [`(${g.valueToCode(b,'VIEW',0)||'[]'}).filter(v=>v===${b.getFieldValue('TILE')||'0'}).length`,0];
    g.forBlock.chaser_discard_value = b => `${g.valueToCode(b,'VALUE',0)||'undefined'};`;
    g.forBlock.chaser_tile_value = b => [b.getFieldValue('TILE')||'0',0];
  };

  window.compileBot = function compileBot() {
    const g = window.gen();
    g.init(window.st.ws);
    const code = g.workspaceToCode(window.st.ws);
    const vars = window.st.ws.getVariableMap().getAllVariables().map(v => g.getVariableName(v.getId()));
    const defs = vars.map(n => `var ${n}=0;`).join(';');
    const src = `var __chaserLastAction=null;var __chaserTurn=0;${defs};${code};return {onStart:typeof onStart==='function'?onStart:null,onTurn:typeof onTurn==='function'?onTurn:null};`;
    return new Function(src)();
  };

  window.resetRuntime = function resetRuntime(s) {
    window.saveXml();
    window.st.play = window.initPlay(s, window.st.map);
    window.st.bot = window.compileBot();
    try {
      if (window.st.bot.onStart) window.st.bot.onStart(window.makeApi());
    } catch (e) {
      window.fail(`初期化エラー: ${e.message}`);
    }
  };

  window.runOneFromButton = function runOneFromButton(s) {
    window.ensureRunningFromButton(s);
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
    } catch (e) {
      window.fail(`Blockly実行エラー: ${e.message}`);
    }
  };

  window.delta = function delta(d) {
    return {Up:{x:0,y:-1},Down:{x:0,y:1},Left:{x:-1,y:0},Right:{x:1,y:0}}[d] || {x:0,y:0};
  };

  window.tileAt = function tileAt(p,x,y) {
    if (y < 0 || y >= p.tiles.length || x < 0 || x >= p.tiles[y].length) return 2;
    if (p.hot && p.hot.x === x && p.hot.y === y) return 1;
    if (p.cool && p.cool.x === x && p.cool.y === y) return 1;
    const ch = p.tiles[y][x];
    return ch === '#' ? 2 : ch === 'I' ? 3 : 0;
  };

  window.around = function around() {
    const p = window.st.play;
    const arr = [];
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) arr.push(window.tileAt(p,p.cool.x+dx,p.cool.y+dy));
    return arr;
  };

  window.look = function look() { return window.around(); };
  window.search = function search(dir) {
    const p = window.st.play;
    const d = window.delta(dir);
    const arr = [];
    for (let i=1;i<=9;i++) arr.push(window.tileAt(p,p.cool.x+d.x*i,p.cool.y+d.y*i));
    return arr;
  };

  window.makeApi = function makeApi() {
    const api = {around: window.around()};
    ['Up','Down','Left','Right'].forEach(dir => {
      api['walk'+dir] = () => { window.st.play.pending = {kind:'walk',dir}; window.st.play.lastDir = dir; };
      api['put'+dir] = () => { window.st.play.pending = {kind:'put',dir}; window.st.play.lastDir = dir; };
      api['look'+dir] = () => { window.st.play.pending = {kind:'look',dir}; window.st.play.lastDir = dir; return window.look(dir); };
      api['search'+dir] = () => { window.st.play.pending = {kind:'search',dir}; window.st.play.lastDir = dir; return window.search(dir); };
    });
    return api;
  };

  window.applyPending = function applyPending() {
    const p = window.st.play;
    const a = p.pending;
    p.turn++;
    if (!a) {
      p.logs.push(`${p.turn}: actionなし`);
      window.judge();
      return;
    }
    if (a.kind === 'look' || a.kind === 'search') {
      p.logs.push(`${p.turn}: ${a.kind}${a.dir}`);
      window.judge();
      return;
    }
    if (a.kind === 'walk') {
      const d = window.delta(a.dir);
      const x = p.cool.x + d.x;
      const y = p.cool.y + d.y;
      if (window.tileAt(p,x,y) === 2) {
        window.fail(`壁: walk${a.dir}`);
        return;
      }
      p.cool = {x,y};
      if (p.tiles[y][x] === 'I') {
        p.items++;
        p.tiles[y][x] = '.';
        p.logs.push(`${p.turn}: walk${a.dir} / item +1`);
      } else {
        p.logs.push(`${p.turn}: walk${a.dir}`);
      }
      window.judge();
      return;
    }
    if (a.kind === 'put') {
      const d = window.delta(a.dir);
      const x = p.cool.x + d.x;
      const y = p.cool.y + d.y;
      if (p.hot && p.hot.x === x && p.hot.y === y) {
        p.status = 'success';
        p.msg = 'put成功';
        p.logs.push(`${p.turn}: put${a.dir} / win`);
        return;
      }
      if (y>=0 && y<p.tiles.length && x>=0 && x<p.tiles[y].length && p.tiles[y][x] === '.') p.tiles[y][x] = '#';
      p.logs.push(`${p.turn}: put${a.dir}`);
      window.judge();
    }
  };

  window.fail = function fail(m) {
    window.st.play.status = 'failed';
    window.st.play.msg = m;
    window.st.play.logs.push(`失敗: ${m}`);
  };

  window.judge = function judge() {
    const p = window.st.play;
    const v = p.validation;
    const remain = p.tiles.reduce((a,r)=>a+r.filter(c=>c==='I').length,0);
    if (v.kind === 'reachGoal' && p.goal && p.cool.x === p.goal.x && p.cool.y === p.goal.y) {
      if (v.requireAllItems && remain > 0) {
        window.fail('アイテム未回収');
        return;
      }
      p.status = 'success';
      p.msg = 'ゴール到達';
      p.logs.push('成功: ゴール到達');
      return;
    }
    if (v.kind === 'collectItems' && p.items >= v.minItems) {
      p.status = 'success';
      p.msg = 'アイテム条件達成';
      return;
    }
    if (v.kind === 'survive' && p.turn >= v.minTurns) {
      p.status = 'success';
      p.msg = '生存条件達成';
      return;
    }
    if (v.maxActions && p.turn >= v.maxActions) window.fail(`最大${v.maxActions}手を超過`);
  };

  window.startAuto = function startAuto(s) {
    window.stopAuto();
    window.ensureRunningFromButton(s);
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
})();