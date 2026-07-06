(() => {
  function setGlobal(name, value) {
    window[name] = value;
    try { Function('value', `${name}=value`)(value); } catch (_) {}
  }

  function currentMap(stage) {
    return stage?.maps?.[st.map] || stage?.maps?.[0] || null;
  }

  function mapName(map, index) {
    return String(map?.label || `マップ ${index + 1}`);
  }

  function resetRuntime() {
    st.play = null;
    st.bot = null;
    st.hotBot = null;
    st.hotBotPlay = null;
  }

  function deleteMap(stage) {
    if (!stage || !Array.isArray(stage.maps)) return;
    if (stage.maps.length <= 1) {
      if (typeof msg === 'function') msg('最後の1マップは削除できません');
      return;
    }

    const index = Math.max(0, Math.min(Number(st.map) || 0, stage.maps.length - 1));
    const map = currentMap(stage);
    if (!confirm(`「${mapName(map, index)}」を削除しますか？`)) return;

    stage.maps.splice(index, 1);
    stage.variants = stage.maps.length;
    st.map = Math.min(index, stage.maps.length - 1);
    resetRuntime();
    if (typeof saveLocal === 'function') saveLocal();
    if (typeof renderMain === 'function') renderMain();
    if (typeof msg === 'function') msg('マップを削除しました');
  }

  function installControls(stage) {
    const selector = document.getElementById('map-sel');
    if (!selector || document.getElementById('map-delete-controls')) return;

    const container = document.createElement('div');
    container.id = 'map-delete-controls';
    container.className = 'controls';

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'map-delete';
    button.className = 'btn danger';
    button.textContent = '× このマップを削除';
    button.disabled = !Array.isArray(stage.maps) || stage.maps.length <= 1;
    button.title = button.disabled ? '最後の1マップは削除できません' : '現在選択しているマップを削除します';
    button.onclick = () => deleteMap(stage);

    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = button.disabled
      ? '最後の1マップは残す必要があります。'
      : '削除後は次のマップを選択します。';

    container.append(button, hint);
    const addControls = document.getElementById('map-add-controls');
    (addControls || selector.closest('.field'))?.insertAdjacentElement('afterend', container);
  }

  const previousRenderEdit = window.renderEdit || renderEdit;
  setGlobal('renderEdit', function renderEditWithMapDelete(stage, ...args) {
    const result = previousRenderEdit(stage, ...args);
    installControls(stage);
    return result;
  });

  window.chaserDeleteMap = deleteMap;
  if (typeof render === 'function') render();

  const statePersistence = document.createElement('script');
  statePersistence.src = './stage_editor_next_state_persistence.js';
  statePersistence.async = false;
  document.body.appendChild(statePersistence);
})();
