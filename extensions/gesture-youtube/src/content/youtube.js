(() => {
  function pressKey(key) {
    const el = document.activeElement ?? document.body;
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  function clickSelector(sel) {
    document.querySelector(sel)?.click();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'PLAY_PAUSE':
        pressKey('k');
        break;

      case 'NEXT_TRACK':
        // next video in queue / playlist
        clickSelector('.ytp-next-button') || pressKey('N');
        break;

      case 'PREV_TRACK':
        pressKey('j'); // rewind 10s (no true prev in YT)
        break;

      case 'VOLUME_UP':
        pressKey('ArrowUp');
        break;

      case 'VOLUME_DOWN':
        pressKey('ArrowDown');
        break;
    }
  });
})();
