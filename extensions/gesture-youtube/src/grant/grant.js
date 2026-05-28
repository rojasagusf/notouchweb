(async () => {
  const spinner  = document.getElementById('spinner');
  const success  = document.getElementById('success');
  const errorMsg = document.getElementById('error-msg');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Permiso concedido — liberar stream de inmediato, no lo necesitamos acá
    stream.getTracks().forEach((t) => t.stop());

    spinner.style.display = 'none';
    success.style.display = 'block';

    // Avisar al side panel
    chrome.runtime.sendMessage({ type: 'CAMERA_PERMISSION_GRANTED' });

    // Cerrar esta ventana después de un momento
    setTimeout(() => window.close(), 800);
  } catch (e) {
    spinner.style.display = 'none';
    errorMsg.style.display = 'block';
    errorMsg.textContent = e.name === 'NotAllowedError'
      ? 'Permiso denegado. Revisá los permisos de cámara del sistema.'
      : e.message;
  }
})();
