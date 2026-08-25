import { describe, expect, it } from 'vitest';
import { resizeCanvasIfNeeded } from '../../src/gl/renderFrame';

function makeCanvasStub() {
  let width = 0;
  let height = 0;
  let widthWrites = 0;
  let heightWrites = 0;
  const canvas = {
    get width() {
      return width;
    },
    set width(v: number) {
      widthWrites++;
      width = v;
    },
    get height() {
      return height;
    },
    set height(v: number) {
      heightWrites++;
      height = v;
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, widthWrites: () => widthWrites, heightWrites: () => heightWrites };
}

describe('resizeCanvasIfNeeded', () => {
  it('writes width/height on the first call', () => {
    const { canvas, widthWrites, heightWrites } = makeCanvasStub();
    resizeCanvasIfNeeded(canvas, 100, 50);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(widthWrites()).toBe(1);
    expect(heightWrites()).toBe(1);
  });

  it('does NOT reassign width/height when both are unchanged — assigning always resets the drawing buffer per spec, even to the same value', () => {
    const { canvas, widthWrites, heightWrites } = makeCanvasStub();
    resizeCanvasIfNeeded(canvas, 100, 50);
    resizeCanvasIfNeeded(canvas, 100, 50);
    resizeCanvasIfNeeded(canvas, 100, 50);
    expect(widthWrites()).toBe(1); // only the first call actually wrote
    expect(heightWrites()).toBe(1);
  });

  it('reassigns when only one dimension changes', () => {
    const { canvas, widthWrites, heightWrites } = makeCanvasStub();
    resizeCanvasIfNeeded(canvas, 100, 50);
    resizeCanvasIfNeeded(canvas, 100, 80); // width unchanged, height changed
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(80);
    // Both are written together (a canvas resize is one operation), but the
    // key guarantee is it didn't skip the needed update.
    expect(widthWrites()).toBe(2);
    expect(heightWrites()).toBe(2);
  });

  it('reassigns when the size actually changes', () => {
    const { canvas, widthWrites } = makeCanvasStub();
    resizeCanvasIfNeeded(canvas, 100, 100);
    resizeCanvasIfNeeded(canvas, 200, 200);
    expect(canvas.width).toBe(200);
    expect(widthWrites()).toBe(2);
  });

  it('supports non-square dimensions, as a Surface needs (e.g. 400x180)', () => {
    const { canvas } = makeCanvasStub();
    resizeCanvasIfNeeded(canvas, 400, 180);
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(180);
  });
});
