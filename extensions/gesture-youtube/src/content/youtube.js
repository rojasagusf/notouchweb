(() => {
  function pressKey(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  function clickSelector(sel) {
    document.querySelector(sel)?.click();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'PLAY_PAUSE':
        document.querySelector('.ytp-play-button')?.click();
        break;

      case 'NEXT_TRACK':
        // next video in queue / playlist
        clickSelector('.ytp-next-button') || pressKey('N');
        break;

      case 'PREV_TRACK':
        clickSelector('.ytp-prev-button') || pressKey('P');
        break;

      case 'FULLSCREEN': {
        const player = document.querySelector('.html5-video-player');
        if (player) {
          // Mostrar controles simulando hover, luego clickear
          player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
          player.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          setTimeout(() => {
            document.querySelector('.ytp-fullscreen-button')?.click();
          }, 150);
        }
        break;
      }

      case 'VOLUME_UP':
        pressKey('ArrowUp');
        break;

      case 'VOLUME_DOWN':
        pressKey('ArrowDown');
        break;
    }
  });
})();
