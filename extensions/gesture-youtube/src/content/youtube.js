(() => {
  function triggerFullscreen(attemptsLeft) {
    const player = document.querySelector('.html5-video-player');
    const btn    = document.querySelector('.ytp-fullscreen-button');
    if (btn && player) {
      player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      btn.click();
      return;
    }
    if (attemptsLeft > 0) setTimeout(() => triggerFullscreen(attemptsLeft - 1), 250);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'PLAY_PAUSE':
        document.querySelector('.ytp-play-button')?.click();
        break;

      case 'NEXT_TRACK': {
        const btn = document.querySelector('.ytp-next-button');
        if (btn) btn.click();
        break;
      }

      case 'PREV_TRACK': {
        const btn = document.querySelector('.ytp-prev-button');
        if (btn) btn.click();
        break;
      }

      case 'FULLSCREEN':
        window.focus();
        triggerFullscreen(4);
        break;
    }
  });
})();
