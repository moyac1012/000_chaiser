(() => {
  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function variableKey(block) {
    return JSON.stringify(String(block.getFieldValue('VAR') || ''));
  }

  function valueCode(generator, block, input, fallback) {
    return generator.valueToCode(block, input, 0) || fallback;
  }

  const previousInitPlay = window.initPlay || initPlay;
  setGlobal('initPlay', function initPlayWithPersistentVariables(stage, index) {
    const play = previousInitPlay(stage, index);
    // 変数はプレイ開始時だけ初期化する。リセット時は新しいplayになるため自然に初期化される。
    play.variables = Object.create(null);
    return play;
  });

  const previousMakeApi = window.makeApi || makeApi;
  setGlobal('makeApi', function makeApiWithPersistentVariables(...args) {
    const api = previousMakeApi(...args);
    const play = st.play;
    if (play) {
      play.variables ||= Object.create(null);
      api.state = play.variables;
      // 実行中の「現在のターン数」は1始まりで公開する。
      api.turn = (Number(play.turn) || 0) + 1;
    }
    return api;
  });

  const previousRegisterGenerators = window.registerGenerators || registerGenerators;
  setGlobal('registerGenerators', function registerGeneratorsWithPersistentVariables() {
    previousRegisterGenerators();
    const generator = window.gen();
    if (!generator?.forBlock) return;

    // 変数ブロックは、コンパイル関数のローカル変数ではなくplay.variablesを参照する。
    // そのため、編集による再コンパイルが起きても、同じプレイ中の値は保持される。
    generator.forBlock.chaser_state_create = (block) => `if(api.state[${variableKey(block)}]===undefined){api.state[${variableKey(block)}]=0;}`;
    generator.forBlock.chaser_state_set = (block) => `api.state[${variableKey(block)}]=${valueCode(generator, block, 'VALUE', '0')};`;
    generator.forBlock.chaser_state_get = (block) => [`(api.state[${variableKey(block)}]===undefined?0:api.state[${variableKey(block)}])`, 0];
    generator.forBlock.chaser_state_change = (block) => `api.state[${variableKey(block)}]=(Number(api.state[${variableKey(block)}])||0)+(Number(${valueCode(generator, block, 'DELTA', '0')})||0);`;
    generator.forBlock.chaser_turn_number = () => ['api.turn', 0];

    ['look', 'search'].forEach((method) => {
      generator.forBlock[`chaser_action_${method}_store`] = (block) => {
        const direction = block.getFieldValue('DIR') || 'Right';
        return `api.state[${variableKey(block)}]=api.${method}${direction}();`;
      };
    });
  });

  // initBlocklyの呼び出し前に上書きされたgeneratorを確実に登録する。
  try { window.registerGenerators(); } catch (_) {}
})();
