(() => {
  function pressKey(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }

  function clickSelector(sel) {
    document.querySelector(sel)?.click();
  }

  function triggerFullscreen(attemptsLeft) {
    const player = document.querySelector('.html5-video-player');
    const btn    = document.querySelector('.ytp-fullscreen-button');

    if (btn && player) {
      player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      btn.click();
      return;
    }

    if (attemptsLeft > 0) {
      setTimeout(() => triggerFullscreen(attemptsLeft - 1), 250);
    }
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

      case 'FULLSCREEN':
        window.focus();
        triggerFullscreen(4);
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
