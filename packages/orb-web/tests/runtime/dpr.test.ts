import { describe, expect, it } from 'vitest';
import { MAX_DEVICE_PIXEL_RATIO, cappedDevicePixelRatio, drawingBufferSize } from '../../src/runtime/dpr';

describe('cappedDevicePixelRatio', () => {
  it('passes through a DPR at or below the cap', () => {
    expect(cappedDevicePixelRatio(1)).toBe(1);
    expect(cappedDevicePixelRatio(1.5)).toBe(1.5);
    expect(cappedDevicePixelRatio(2)).toBe(2);
  });

  it('caps a DPR of 3 (a documented high-DPR device) at 2', () => {
    expect(cappedDevicePixelRatio(3)).toBe(MAX_DEVICE_PIXEL_RATIO);
  });

  it('falls back to 1 for non-finite or non-positive input', () => {
    expect(cappedDevicePixelRatio(0)).toBe(1);
    expect(cappedDevicePixelRatio(-1)).toBe(1);
    expect(cappedDevicePixelRatio(Number.NaN)).toBe(1);
  });
});

describe('drawingBufferSize', () => {
  it('sizes the drawing buffer using a DPR of 2 when the device reports 3', () => {
    expect(drawingBufferSize(100, 3)).toBe(200);
  });

  it('sizes exactly at DPR 1', () => {
    expect(drawingBufferSize(96, 1)).toBe(96);
  });

  it('rounds and never returns less than 1', () => {
    expect(drawingBufferSize(0.4, 1)).toBe(1);
    expect(drawingBufferSize(10.6, 1)).toBe(11);
  });
});
