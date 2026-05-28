## Plan Hackathon 4h — Extensión de gestos YouTube (Red + Juang)

### Resumen
- Objetivo de cierre: demo en vivo estable.
- Alcance comprometido: `play/pause` + `next` por gestos.
- Estrategia técnica: stack híbrido, intentar TF.js primero y caer a MediaPipe ya instalado si hay riesgo de tiempo/rendimiento.
- Forma de trabajo: paralelo con integración en checkpoints fijos.

### Plan de trabajo y división de roles (4 horas)

1. **00:00–00:20 | Kickoff técnico conjunto**
- Red y Juang alinean contrato de mensajes y criterio de “done demo”.
- Se congela el gesto V1: `open_palm -> TOGGLE_PLAYBACK`, `swipe_right -> NEXT_TRACK`.
- Se define regla de corte: si TF.js no está estable al minuto 75, fallback inmediato a MediaPipe.

2. **00:20–01:15 | Desarrollo paralelo bloque 1**
- **Red**: detector de mano + loop de inferencia en offscreen + salida de landmarks normalizados.
- **Juang**: robustecer bus de comandos `service worker -> content script`, estados de error y telemetría mínima para popup.
- Checkpoint 01:15: prueba integrada “comando manual dispara acción YouTube”.

3. **01:15–02:15 | Desarrollo paralelo bloque 2**
- **Red**: clasificación por reglas (`open_palm`, `swipe_right`) + score de confianza.
- **Juang**: filtro temporal FSM (`IDLE/CANDIDATE/CONFIRMED/COOLDOWN`) + cooldown configurable desde popup.
- Checkpoint 02:15: gesto confirmado emite comando canónico sin dobles disparos.

4. **02:15–03:05 | Integración end-to-end**
- **Red** integra detector+clasificador con el emisor de eventos de gesto.
- **Juang** integra ejecución final en YouTube (`video.play/pause`, botón next) y feedback de resultado en popup.
- Checkpoint 03:05: demo interna completa en una máquina.

5. **03:05–03:35 | Hardening para demo**
- **Red**: tuning de umbrales por entorno real (luz/ángulo), preset “demo”.
- **Juang**: manejo explícito de fallos (`NO_TARGET_TAB`, `NEXT_UNAVAILABLE`, permisos cámara) y mensajes claros.
- Checkpoint 03:35: tasa baja de falsos positivos en 5 minutos de prueba.

6. **03:35–04:00 | Ensayo final y contingencias**
- Ensayo de guion completo 2 veces.
- **Red** opera la demo de gestos; **Juang** narra, monitorea estado y ejecuta plan B.
- Plan B: si `swipe_right` falla en vivo, demostrar solo `play/pause` estable y mostrar `next` en prueba rápida controlada.

### Cambios de implementación e interfaces (decision-complete)
- Contrato de evento de gesto desde offscreen:
- `OFFSCREEN_GESTURE_DETECTED` con payload `{ gesture: "open_palm" | "swipe_right", confidence: number, ts: number }`.
- Contrato de comando hacia YouTube:
- `COMMAND_EXECUTE` con payload `{ command: "TOGGLE_PLAYBACK" | "NEXT_TRACK", metadata }`.
- Estado unificado para popup:
- `enabled`, `cameraActive`, `fps`, `lastGesture`, `lastActionResult`, `lastError`, `settings`.
- Parámetros V1 por defecto:
- `confidenceThreshold=0.80`, `holdMs=180`, `cooldownMs=1200`.
- Regla de fallback técnico:
- Intento TF.js en bloque 1; si no llega a loop estable + landmarks al 01:15, migrar a MediaPipe sin discutir.

### Test plan y criterios de aceptación
1. **Smoke técnico**
- Activar extensión pide cámara solo al habilitar.
- Desactivar apaga stream y limpia estado.
2. **E2E funcional**
- En YouTube activo, `open_palm` alterna play/pause consistentemente.
- `swipe_right` avanza cuando hay siguiente disponible.
3. **Robustez mínima**
- No doble-disparo por mismo gesto dentro del cooldown.
- Con pestaña no-YouTube activa, no ejecuta acción y reporta estado.
4. **Criterio demo final (go/no-go)**
- 3 ejecuciones consecutivas sin fallo crítico de `play/pause`.
- Al menos 1 ejecución exitosa de `next` durante ensayo final.

### Supuestos y defaults fijados
- Se demoa en Chrome Desktop con extensión unpacked.
- Priorizamos estabilidad de demo sobre refactor/limpieza extra.
- No se persigue publicación en Store hoy.
- Si hay conflicto de integración, Juang decide corte de scope en tiempo real y Red optimiza estabilidad del gesto principal.
