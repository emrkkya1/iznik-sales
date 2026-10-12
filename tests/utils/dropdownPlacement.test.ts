import { describe, expect, it } from 'vitest';
import { getDropdownPlacement } from '@/utils/dropdownPlacement';

const viewport = { width: 800, height: 600, top: 0, right: 0, bottom: 0, left: 0 };
const anchor = { x: 100, y: 100, width: 200, height: 40 };

describe('getDropdownPlacement', () => {
  it('opens below when the full menu fits', () => {
    expect(getDropdownPlacement(anchor, viewport, 88)).toEqual({ left: 100, top: 144, width: 200, maxHeight: 88 });
  });

  it('flips above a trigger near the bottom edge', () => {
    expect(getDropdownPlacement({ ...anchor, y: 540 }, viewport, 88)).toEqual({ left: 100, top: 448, width: 200, maxHeight: 88 });
  });

  it('caps long menus at 240px so their contents can scroll', () => {
    expect(getDropdownPlacement(anchor, viewport, 2000).maxHeight).toBe(240);
  });

  it('uses the roomier side and shrinks when neither side fits', () => {
    const small = { ...viewport, height: 300 };
    expect(getDropdownPlacement({ ...anchor, y: 120 }, small, 500)).toEqual({ left: 100, top: 164, width: 200, maxHeight: 128 });
    expect(getDropdownPlacement({ ...anchor, y: 160 }, small, 500)).toEqual({ left: 100, top: 8, width: 200, maxHeight: 148 });
  });

  it('respects all safe-area edges and clamps horizontal overflow', () => {
    const safe = { ...viewport, top: 24, bottom: 34, left: 20, right: 20 };
    const placed = getDropdownPlacement({ x: 750, y: 550, width: 300, height: 40 }, safe, 100);
    expect(placed).toEqual({ left: 472, top: 446, width: 300, maxHeight: 100 });
    expect(placed.left + placed.width).toBeLessThanOrEqual(safe.width - safe.right - 8);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(safe.height - safe.bottom - 8);
  });

  it('clamps oversized triggers to the viewport width', () => {
    expect(getDropdownPlacement({ ...anchor, x: -100, width: 2000 }, viewport, 100)).toMatchObject({ left: 8, width: 784 });
  });

  it.each([-100, 900])('keeps the menu visible even if its anchor moves off-screen (%s)', (y) => {
    const placed = getDropdownPlacement({ ...anchor, y }, viewport, 100);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(592);
  });

  it('bounds the menu to a resized/keyboard-constrained viewport', () => {
    const placed = getDropdownPlacement({ ...anchor, y: 250 }, { ...viewport, height: 320 }, 200);
    expect(placed.top + placed.maxHeight).toBeLessThanOrEqual(312);
    expect(placed.top).toBeLessThan(250);
  });
});
