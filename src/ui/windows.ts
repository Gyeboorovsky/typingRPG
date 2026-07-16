// Which open window Esc should close: options is always topmost, otherwise the
// last-opened one (LIFO). Pure so the priority rule is unit-testable without a DOM.
export type WindowId = 'inventory' | 'character' | 'options';

export function topmostWindow(order: WindowId[]): WindowId | null {
  if (order.includes('options')) return 'options'; // options always wins
  return order.length ? order[order.length - 1] : null; // else last opened
}
