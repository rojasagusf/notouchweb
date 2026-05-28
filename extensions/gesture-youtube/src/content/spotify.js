(() => {
  function clickDataTestId(id) {
    document.querySelector(`[data-testid="${id}"]`)?.click();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'PLAY_PAUSE':
        clickDataTestId('control-button-playpause');
        break;

      case 'NEXT_TRACK':
        clickDataTestId('control-button-skip-forward');
        break;

      case 'PREV_TRACK':
        clickDataTestId('control-button-skip-back');
        break;
    }
  });
})();
