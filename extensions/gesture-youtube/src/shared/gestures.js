export const GESTURES = {
  SWIPE_UP:    'SWIPE_UP',
  SWIPE_DOWN:  'SWIPE_DOWN',
  SWIPE_LEFT:  'SWIPE_LEFT',
  SWIPE_RIGHT: 'SWIPE_RIGHT',
  FIST:        'FIST',
  OPEN_HAND:   'OPEN_HAND',
  PEACE:       'PEACE',
  POINT:       'POINT',
};

export const GESTURE_LABELS = {
  [GESTURES.SWIPE_UP]:    '☝️ Swipe arriba → Scroll up',
  [GESTURES.SWIPE_DOWN]:  '👇 Swipe abajo → Scroll down',
  [GESTURES.SWIPE_LEFT]:  '👈 Swipe izq → Anterior',
  [GESTURES.SWIPE_RIGHT]: '👉 Swipe der → Siguiente',
  [GESTURES.PEACE]:       '✌️ Paz → Play/Pause',
  [GESTURES.FIST]:        '✊ Puño → Click',
  [GESTURES.POINT]:       '☝ Señalar → Mover cursor',
  [GESTURES.OPEN_HAND]:   '🖐 Mano abierta → Detener',
};

export const GESTURE_ACTION_MAP = {
  [GESTURES.SWIPE_UP]:    'SCROLL_UP',
  [GESTURES.SWIPE_DOWN]:  'SCROLL_DOWN',
  [GESTURES.SWIPE_LEFT]:  'PREV_TRACK',
  [GESTURES.SWIPE_RIGHT]: 'NEXT_TRACK',
  [GESTURES.PEACE]:       'PLAY_PAUSE',
  [GESTURES.FIST]:        'CLICK',
};
