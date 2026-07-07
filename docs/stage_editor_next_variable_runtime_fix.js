(() => {
  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function safeVariableName(generator, idOrName) {
    const raw = String(idOrName || 'x');
    try {
      if (typeof generator.getVariableName === 'function') return generator.getVariableName(raw);
    } catch (_) {}
    try {
      if (generator.nameDB_ && window.Blockly?.Names?.NameType?.VARIABLE) {
        return generator.nameDB_.getName(raw, Blockly.Names.NameType.VARIABLE);
      }
    } catch (_) {}
    try {
      const variable = st.ws?.getVariableMap?.().getVariableById?.(raw);
      const name = variable?.name || raw;
      return name.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_$&') || 'x';
    } catch (_) {
      return raw.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]/, '_$&') || 'x';
    }
  }

  function value(generator, block, input, fallback = '0') {
    return generator.valueToCode(block, input, generator.ORDER_NONE ?? 0) || fallback;
  }

  function installGenerators() {
    if (!window.gen || !window.Blockly) return;
    const generator = window.gen();
    if (!generator?.forBlock) return;

    const variableName = (block, field = 'VAR') => safeVariableName(generator, block.getFieldValue(field));
    generator.forBlock.chaser_state_create = () => '';
    generator.forBlock.chaser_state_set = (block) => `${variableName(block)} = (${value(generator, block, 'VALUE')});`;
    generator.forBlock.chaser_state_get = (block) => [variableName(block), generator.ORDER_ATOMIC ?? 0];
    generator.forBlock.chaser_state_change = (block) => `${variableName(block)} = (${variableName(block)} || 0) + (${value(generator, block, 'DELTA')});`;

    generator.forBlock.variables_get = (block) => [variableName(block), generator.ORDER_ATOMIC ?? 0];
    generator.forBlock.variables_set = (block) => `${variableName(block)} = (${value(generator, block, 'VALUE')});`;
    generator.forBlock.math_change = (block) => `${variableName(block)} = (${variableName(block)} || 0) + (${value(generator, block, 'DELTA')});`;

    if (!generator.forBlock.math_modulo) {
      generator.forBlock.math_modulo = (block) => {
        const dividend = value(generator, block, 'DIVIDEND');
        const divisor = value(generator, block, 'DIVISOR', '1');
        return [`(${dividend} % ${divisor})`, generator.ORDER_MULTIPLICATIVE ?? 0];
      };
    }
  }

  function compileBotCompat() {
    const generator = window.gen();
    generator.init(st.ws);
    installGenerators();
    const code = generator.workspaceToCode(st.ws);
    const variables = st.ws?.getVariableMap?.().getAllVariables?.() || [];
    const defs = variables.map((variable) => `var ${safeVariableName(generator, variable.getId())}=0;`).join('');
    return new Function(`var __chaserLastAction=null;var __chaserTurn=0;${defs}${code};return {onStart:typeof onStart==='function'?onStart:null,onTurn:typeof onTurn==='function'?onTurn:null,code:${JSON.stringify(code)}};`)();
  }

  const previousResetRuntime = window.resetRuntime || resetRuntime;
  setGlobal('resetRuntime', function resetRuntimeWithVariableFix(stage) {
    if (typeof saveXml === 'function') saveXml();
    st.play = initPlay(stage, st.map);
    st.hotBot = null;
    st.hotBotPlay = null;
    try {
      st.bot = compileBotCompat();
      if (st.bot.onStart) st.bot.onStart(makeApi());
    } catch (error) {
      st.bot = null;
      fail(`初期化エラー: ${error.message}`);
    }
  });

  // HOT・対戦条件は、先にrunTurnをラップしている。
  // ここではCOOL用プログラムだけを先にコンパイルし、既存の実行連鎖へ委譲する。
  const previousRunTurn = window.runTurn || runTurn;
  setGlobal('runTurn', function runTurnWithVariableFix() {
    if (!st.play || st.play.status !== 'running') return;
    try {
      if (!st.bot) st.bot = compileBotCompat();
    } catch (error) {
      fail(`Blockly実行エラー: ${error.message}`);
      return;
    }
    previousRunTurn();
  });

  const previousRegisterGenerators = window.registerGenerators || registerGenerators;
  setGlobal('registerGenerators', function registerGeneratorsWithVariableFix(...args) {
    const result = previousRegisterGenerators(...args);
    installGenerators();
    return result;
  });

  window.chaserCompileBotDebug = compileBotCompat;

  const solutionsExtension = document.createElement('script');
  solutionsExtension.src = './stage_editor_next_solutions_multi.js';
  solutionsExtension.async = false;
  document.body.appendChild(solutionsExtension);
})();