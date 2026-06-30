(() => {
  const DELTA = {
    Up: { x: 0, y: -1 },
    Down: { x: 0, y: 1 },
    Left: { x: -1, y: 0 },
    Right: { x: 1, y: 0 },
  };
  const DIRECTIONS = Object.values(DELTA);

  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function inside(play, x, y) {
    return y >= 0 && y < play.tiles.length && x >= 0 && x < play.tiles[y].length;
  }

  function blocked(play, x, y) {
    return !inside(play, x, y) || play.tiles[y][x] === '#';
  }

  function surroundedByBlocks(play, position) {
    if (!position) return false;
    return DIRECTIONS.every(({ x, y }) => blocked(play, position.x + x, position.y + y));
  }

  function win(play, message) {
    play.status = 'success';
    play.msg = message;
    play.logs.push(`成功: ${message}`);
  }

  function endByEnclosure(play) {
    // HOTを完全に囲んだ勝利を優先する。
    if (play.hot && surroundedByBlocks(play, play.hot)) {
      win(play, 'HOTの四方をブロックで囲んだ');
      return true;
    }
    if (surroundedByBlocks(play, play.cool)) {
      fail('COOLの四方がブロックになった');
      return true;
    }
    return false;
  }

  function runNormalClearJudge(play) {
    const validation = play.validation || { kind: 'reachGoal' };
    const atGoal = Boolean(play.goal && play.cool.x === play.goal.x && play.cool.y === play.goal.y);
    const remainingItems = play.tiles.reduce((sum, row) => sum + row.filter((cell) => cell === 'I').length, 0);

    if (validation.kind === 'reachGoal' && atGoal) {
      if (validation.requireAllItems && remainingItems > 0) {
        play.msg = `アイテム未回収（残り${remainingItems}個）`;
      } else {
        win(play, 'ゴール到達');
        return;
      }
    }
    if (validation.kind === 'collectItemsAndGoal' && atGoal && play.items >= validation.minItems) {
      win(play, `アイテム${validation.minItems}個以上取得してゴール`);
      return;
    }
    if (validation.kind === 'defeatEnemy' && play.enemyDefeated) {
      win(play, '敵を倒した');
      return;
    }
    if (validation.kind === 'survive' && play.turn >= validation.minTurns) {
      win(play, `${validation.minTurns}ターン生存`);
      return;
    }
    if (validation.maxActions && play.turn >= validation.maxActions) {
      fail(`最大${validation.maxActions}手を超過`);
      return;
    }
    if (validation.kind === 'collectItemsAndGoal' && atGoal) {
      play.msg = `アイテム不足（${play.items}/${validation.minItems}個）`;
    }
  }

  setGlobal('judge', function judgeWithEnclosureRules() {
    const play = st.play;
    if (!play || play.status !== 'running') return;
    if (endByEnclosure(play)) return;
    runNormalClearJudge(play);
  });

  setGlobal('applyPending', function applyPendingWithEnclosureRules() {
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
    const from = { x: play.cool.x, y: play.cool.y };
    const x = from.x + delta.x;
    const y = from.y + delta.y;

    if (action.kind === 'walk') {
      if (!inside(play, x, y) || play.tiles[y][x] === '#') {
        fail(`壁: walk${action.dir}`);
        return;
      }
      if (play.hot && play.hot.x === x && play.hot.y === y) {
        fail('敵にやられた');
        return;
      }

      const collectedItem = play.tiles[y][x] === 'I';
      play.cool = { x, y };
      if (collectedItem) {
        play.items++;
        play.tiles[y][x] = '.';
        play.tiles[from.y][from.x] = '#';
        play.logs.push(`${play.turn}: walk${action.dir} / item +1 / previous position blocked`);
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
      if (inside(play, x, y) && play.tiles[y][x] === '.') play.tiles[y][x] = '#';
      play.logs.push(`${play.turn}: put${action.dir}`);
      judge();
    }
  });
})();
