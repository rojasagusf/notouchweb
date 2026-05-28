(() => {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'SCROLL_UP':
        window.scrollBy({ top: -(msg.payload?.speed ?? 200), behavior: 'smooth' });
        break;
      case 'SCROLL_DOWN':
        window.scrollBy({ top: msg.payload?.speed ?? 200, behavior: 'smooth' });
        break;
    }
  });
})();
