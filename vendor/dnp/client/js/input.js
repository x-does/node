const SIDE_KEYS = new Set(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown']);
const EDGE_KEYS = new Set(['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight']);

export function createInputController(sendInput, getSlot = () => '') {
  const pressed = new Set();
  let lastDirection = 0;
  let enabled = true;

  function axisForSlot() {
    const slot = getSlot() || '';
    return slot.includes('_top') || slot.includes('_bottom') ? 'edge' : 'side';
  }

  function directionFromPressed() {
    const axis = axisForSlot();
    if (axis === 'edge') {
      const neg = pressed.has('KeyA') || pressed.has('ArrowLeft');
      const pos = pressed.has('KeyD') || pressed.has('ArrowRight');
      return neg === pos ? 0 : neg ? -1 : 1;
    }
    const neg = pressed.has('KeyW') || pressed.has('ArrowUp');
    const pos = pressed.has('KeyS') || pressed.has('ArrowDown');
    return neg === pos ? 0 : neg ? -1 : 1;
  }

  function emit(force = false) {
    if (!enabled) return;
    const direction = directionFromPressed();
    if (force || direction !== lastDirection) {
      lastDirection = direction;
      sendInput(direction);
    }
  }

  function relevant(code) {
    return SIDE_KEYS.has(code) || EDGE_KEYS.has(code);
  }

  function keydown(event) {
    if (!relevant(event.code)) return;
    event.preventDefault();
    pressed.add(event.code);
    emit();
  }

  function keyup(event) {
    if (!relevant(event.code)) return;
    event.preventDefault();
    pressed.delete(event.code);
    emit();
  }

  function blur() {
    pressed.clear();
    emit(true);
  }

  window.addEventListener('keydown', keydown, { passive: false });
  window.addEventListener('keyup', keyup, { passive: false });
  window.addEventListener('blur', blur);

  document.querySelectorAll('[data-touch]').forEach((button) => {
    const direction = Number(button.dataset.touch || 0);
    const start = (event) => {
      event.preventDefault();
      lastDirection = direction;
      sendInput(direction);
    };
    const stop = (event) => {
      event.preventDefault();
      lastDirection = 0;
      sendInput(0);
    };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', stop);
  });

  return {
    destroy() {
      enabled = false;
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    },
    reset: blur,
  };
}
