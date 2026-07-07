(() => {
  const DIRS = { Up: '↑ 上', Down: '↓ 下', Left: '← 左', Right: '→ 右' };
  const TILES = { '0': '床', '1': 'COOL', '2': 'ブロック', '3': 'アイテム' };
  const COMPARE = { EQ: '＝', NEQ: '≠', LT: '＜', LTE: '≦', GT: '＞', GTE: '≧' };
  const ARITHMETIC = { ADD: '＋', MINUS: '－', MULTIPLY: '×', DIVIDE: '÷', POWER: '^' };
  const LABELS = {
    chaser_hot_on_turn: 'HOTの毎ターン',
    chaser_hot_turn_end: 'HOTのターンを終える',
    chaser_hot_walk: 'HOTが歩く',
    chaser_hot_walk_last: 'HOTが前に進んだ向きで歩く',
    chaser_hot_walk_random: 'HOTがどこかに歩く',
    chaser_hot_put: 'HOTがブロックを置く',
    chaser_hot_is_tile: 'HOTの方向のマス判定',
    chaser_hot_get_tile: 'HOTの方向のマス',
    chaser_state_get: '変数',
    variables_get: '変数',
    chaser_turn_number: '現在のターン数',
    logic_boolean: '真 / 偽',
  };

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function children(element, tagName) {
    return Array.from(element?.children || []).filter((node) => node.tagName === tagName);
  }

  function directField(block, name) {
    return children(block, 'field').find((node) => node.getAttribute('name') === name)?.textContent || '';
  }

  function inputBlock(block, inputName) {
    const input = [...children(block, 'value'), ...children(block, 'statement')]
      .find((node) => node.getAttribute('name') === inputName);
    return children(input, 'block')[0] || null;
  }

  function nextBlock(block) {
    return children(children(block, 'next')[0], 'block')[0] || null;
  }

  function variableName(block) {
    return directField(block, 'VAR') || '変数';
  }

  function valueText(block) {
    if (!block) return '（値なし）';
    const type = block.getAttribute('type') || '';

    if (type === 'chaser_hot_is_tile') {
      const direction = DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '指定方向';
      const tile = TILES[directField(block, 'TILE')] || directField(block, 'TILE') || '指定した種類';
      return `HOTの${direction}のマスが${tile}である`;
    }
    if (type === 'chaser_hot_get_tile') {
      const direction = DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '指定方向';
      return `HOTの${direction}のマスの種類`;
    }
    if (type === 'logic_boolean') return directField(block, 'BOOL') === 'TRUE' ? '真' : '偽';
    if (type === 'math_number') return directField(block, 'NUM') || '0';
    if (type === 'chaser_state_get' || type === 'variables_get') return `変数「${variableName(block)}」`;
    if (type === 'chaser_turn_number') return '現在のターン数';
    if (type === 'chaser_direction_value') return DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '指定方向';
    if (type === 'logic_compare') {
      const left = valueText(inputBlock(block, 'A'));
      const right = valueText(inputBlock(block, 'B'));
      const operator = COMPARE[directField(block, 'OP')] || directField(block, 'OP') || '＝';
      return `${left} ${operator} ${right}`;
    }
    if (type === 'logic_operation') {
      const left = valueText(inputBlock(block, 'A'));
      const right = valueText(inputBlock(block, 'B'));
      const operator = directField(block, 'OP') === 'AND' ? 'かつ' : 'または';
      return `(${left} ${operator} ${right})`;
    }
    if (type === 'logic_negate') return `（${valueText(inputBlock(block, 'BOOL'))}）ではない`;
    if (type === 'math_modulo') return `(${valueText(inputBlock(block, 'DIVIDEND'))} を ${valueText(inputBlock(block, 'DIVISOR'))} で割った余り)`;
    if (type === 'math_arithmetic') {
      const left = valueText(inputBlock(block, 'A'));
      const right = valueText(inputBlock(block, 'B'));
      return `(${left} ${ARITHMETIC[directField(block, 'OP')] || directField(block, 'OP') || '＋'} ${right})`;
    }
    if (type === 'math_random_int') return `${valueText(inputBlock(block, 'FROM'))} から ${valueText(inputBlock(block, 'TO'))} までのランダムな整数`;
    if (type === 'math_random_float') return '0以上1未満のランダムな小数';

    const label = LABELS[type] || type || '不明なブロック';
    const fields = children(block, 'field').map((node) => node.textContent).filter(Boolean);
    return fields.length ? `${label}（${fields.join('，')}）` : label;
  }

  function statementLines(firstBlock, depth) {
    const lines = [];
    let block = firstBlock;
    while (block) {
      lines.push(...blockLines(block, depth));
      block = nextBlock(block);
    }
    return lines;
  }

  function blockLines(block, depth) {
    const indent = '\t'.repeat(depth);
    const type = block.getAttribute('type') || '';

    if (type === 'chaser_hot_on_turn') {
      const body = statementLines(inputBlock(block, 'DO'), depth + 1);
      return [`${indent}HOTの毎ターン`, ...body];
    }

    if (type === 'controls_if') {
      const lines = [];
      let index = 0;
      while (inputBlock(block, `IF${index}`) || inputBlock(block, `DO${index}`)) {
        const condition = valueText(inputBlock(block, `IF${index}`));
        lines.push(`${indent}${index === 0 ? 'もし' : 'そうでなくもし'} ${condition}`);
        lines.push(...statementLines(inputBlock(block, `DO${index}`), depth + 1));
        index += 1;
      }
      const elseBlock = inputBlock(block, 'ELSE');
      if (elseBlock) {
        lines.push(`${indent}そうでなければ`);
        lines.push(...statementLines(elseBlock, depth + 1));
      }
      return lines;
    }

    if (type === 'chaser_hot_walk') {
      return [`${indent}HOTが歩く：${DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '指定方向'}`];
    }
    if (type === 'chaser_hot_walk_last') {
      return [`${indent}HOTが前に進んだ向きで歩く（最初は：${DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '↑ 上'}）`];
    }
    if (type === 'chaser_hot_walk_random') return [`${indent}HOTがどこかに歩く`];
    if (type === 'chaser_hot_put') {
      return [`${indent}HOTがブロックを置く：${DIRS[directField(block, 'DIR')] || directField(block, 'DIR') || '指定方向'}`];
    }
    if (type === 'chaser_hot_turn_end') return [`${indent}HOTのターンを終える`];
    if (type === 'chaser_state_set' || type === 'variables_set') {
      return [`${indent}変数「${variableName(block)}」に ${valueText(inputBlock(block, 'VALUE'))} を入れる`];
    }
    if (type === 'chaser_state_change' || type === 'math_change') {
      return [`${indent}変数「${variableName(block)}」を ${valueText(inputBlock(block, 'DELTA'))} だけ増減する`];
    }
    if (type === 'chaser_state_create') return [`${indent}変数「${variableName(block)}」を作る`];

    return [`${indent}${valueText(block)}`];
  }

  function detailedHotProgram(xml) {
    if (!xml) return 'HOTの行動プログラムは未設定です。';
    try {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('HOT XML parse error');
      const roots = children(doc.querySelector('xml'), 'block');
      if (!roots.length) return 'HOTの行動プログラムは未設定です。';
      return statementLines(roots[0], 0).join('\n');
    } catch (error) {
      console.error(error);
      return 'HOTの行動プログラムを読み取れませんでした。';
    }
  }

  function solutionPayload(stage) {
    const items = Array.isArray(stage.solutions) ? stage.solutions : [];
    const fromLegacy = stage.solution?.imageDataUrl ? [stage.solution] : [];
    return [...items, ...fromLegacy]
      .filter((item) => item && typeof item.imageDataUrl === 'string' && item.imageDataUrl.startsWith('data:image/'))
      .map((item) => ({
        id: String(item.id || ''),
        imageDataUrl: item.imageDataUrl,
        imageName: String(item.imageName || '模範解答'),
        imageMimeType: String(item.imageMimeType || 'image/png'),
        note: String(item.note || ''),
        updatedAt: String(item.updatedAt || ''),
      }));
  }

  function reviewPayload() {
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
        hotProgram: Boolean(stage.hotEnabled || stage.hotBehavior?.enabled) ? detailedHotProgram(stage.hotBehavior?.savedBlocklyXml || '') : '',
        solutions: copy(solutionPayload(stage)),
      }));
      return {
        id: phase.id || '–', name: phase.name || '無題', range: phase.range || '',
        color: phase.color || '#64748b', bg: phase.bg || '#f1f5f9', desc: phase.desc || '', stages,
      };
    }).filter((phase) => phase.stages.length);

    const preferredOrder = Array.isArray(window.SETS) ? [...window.SETS] : [];
    const source = st.blockSets && typeof st.blockSets === 'object' ? st.blockSets : (window.BLOCK_SET_ALLOWED || {});
    const blockSets = {};
    [...preferredOrder, ...Object.keys(source || {}).filter((name) => !preferredOrder.includes(name))].forEach((name) => {
      blockSets[name] = Array.isArray(source?.[name]) ? [...source[name]] : [];
    });
    return { phases, blockSetOrder: Object.keys(blockSets), blockSets };
  }

  setGlobal('exportReview', function exportReviewWithDetailedHotProgram() {
    if (typeof saveXml === 'function') saveXml();
    const html = window.reviewHtml(reviewPayload());
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stage_review.html';
    anchor.click();
    URL.revokeObjectURL(url);
  });

  const button = document.getElementById('export-review');
  if (button) button.onclick = window.exportReview;
  window.chaserDetailedHotProgram = detailedHotProgram;
})();
