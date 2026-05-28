(() => {
  const CURSOR_ID = '__ntw_cursor__';

  function getOrCreateCursor() {
    let el = document.getElementById(CURSOR_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = CURSOR_ID;
      Object.assign(el.style, {
        position: 'fixed',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'rgba(0, 212, 170, 0.7)',
        border: '2px solid #00d4aa',
        pointerEvents: 'none',
        zIndex: '2147483647',
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.08s ease, top 0.08s ease',
        boxShadow: '0 0 12px rgba(0,212,170,0.6)',
        display: 'none',
      });
      document.body.appendChild(el);
    }
    return el;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'EXECUTE_ACTION') return;

    switch (msg.action) {
      case 'SCROLL_UP':
        window.scrollBy({ top: -(msg.payload?.speed ?? 200), behavior: 'smooth' });
        break;

      case 'SCROLL_DOWN':
        window.scrollBy({ top: msg.payload?.speed ?? 200, behavior: 'smooth' });
        break;

      case 'CLICK': {
        const { x, y } = msg.payload ?? {};
        if (x != null && y != null) {
          const el = document.elementFromPoint(x, y);
          el?.click();
        }
        break;
      }

      case 'MOVE_CURSOR': {
        const cursor = getOrCreateCursor();
        cursor.style.display = 'block';
        cursor.style.left = `${msg.payload.x}px`;
        cursor.style.top  = `${msg.payload.y}px`;
        break;
      }

      case 'HIDE_CURSOR': {
        const cursor = document.getElementById(CURSOR_ID);
        if (cursor) cursor.style.display = 'none';
        break;
      }
    }
  });
})();
