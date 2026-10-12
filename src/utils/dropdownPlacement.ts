type Rectangle = { x: number; y: number; width: number; height: number };
type Viewport = { width: number; height: number; top: number; right: number; bottom: number; left: number };

// Coordinates and safe-area limits are in window pixels. Prefer below, flip
// above when needed, and make long menus scroll inside the available space.
export function getDropdownPlacement(anchor: Rectangle, viewport: Viewport, contentHeight: number) {
  const margin = 8;
  const gap = 4;
  const leftBound = viewport.left + margin;
  const rightBound = Math.max(leftBound, viewport.width - viewport.right - margin);
  const topBound = viewport.top + margin;
  const bottomBound = Math.max(topBound, viewport.height - viewport.bottom - margin);
  const desiredHeight = Math.min(240, Math.max(0, contentHeight));
  const below = Math.max(0, bottomBound - (anchor.y + anchor.height) - gap);
  const above = Math.max(0, anchor.y - topBound - gap);
  const opensBelow = below >= desiredHeight || below >= above;
  const available = opensBelow ? below : above;
  // If the trigger itself is outside the visible viewport, stay on-screen
  // rather than returning a zero-height or off-screen menu.
  const maxHeight = Math.min(desiredHeight, available || bottomBound - topBound);
  const width = Math.min(anchor.width, rightBound - leftBound);
  const left = Math.max(leftBound, Math.min(anchor.x, rightBound - width));
  const idealTop = opensBelow ? anchor.y + anchor.height + gap : anchor.y - gap - maxHeight;
  const top = Math.max(topBound, Math.min(idealTop, bottomBound - maxHeight));
  return { left, top, width, maxHeight };
}
