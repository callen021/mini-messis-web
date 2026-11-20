import { type PointerEvent, type SyntheticEvent, useCallback, useEffect, useRef } from 'react';

/**
 * Press-and-hold for a button (D140): the action runs once on press, then keeps repeating while
 * the finger stays down. A keyboard press runs it once, as a click. Spread the result on a button.
 */
export function useHoldRepeat(action: () => void, delay = 400, every = 90) {
  const act = useRef(action);
  useEffect(() => {
    act.current = action;
  });
  const wait = useRef<number | undefined>(undefined);
  const loop = useRef<number | undefined>(undefined);
  // a press already ran the action: the click that follows it must not run it again
  const pressed = useRef(false);

  const stop = useCallback(() => {
    window.clearTimeout(wait.current);
    window.clearInterval(loop.current);
  }, []);
  useEffect(() => stop, [stop]);

  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button > 0) return;
      stop();
      pressed.current = true;
      act.current();
      wait.current = window.setTimeout(() => {
        loop.current = window.setInterval(() => act.current(), every);
      }, delay);
    },
    onPointerUp: stop,
    onPointerCancel: () => {
      pressed.current = false;
      stop();
    },
    onPointerLeave: () => {
      pressed.current = false;
      stop();
    },
    onClick: () => {
      if (pressed.current) pressed.current = false;
      else act.current();
    },
    // a long press must not open the phone's context menu
    onContextMenu: (e: SyntheticEvent) => e.preventDefault(),
  };
}
