import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramRenderer } from './render';
import { setCodeBlockDiagramRenderer } from '../editor-core/renderers';
import {
  clearDiagramImageCache,
  DiagramImageBudgetError,
  DIAGRAM_IMAGE_CACHE_BUDGET_BYTES,
  renderDiagramImage,
} from './diagramImageExport';

const { toBlobMock } = vi.hoisted(() => ({ toBlobMock: vi.fn() }));

vi.mock('html-to-image', () => ({ toBlob: toBlobMock }));

const CODE = 'flowchart TD\n  A --> B';

function pngBlob(size = 16): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/png' });
}

function createRenderer(): DiagramRenderer & { renderMermaid: ReturnType<typeof vi.fn> } {
  return {
    renderMermaid: vi.fn(async () => ({ svg: '<svg viewBox="0 0 100 50"></svg>' })),
  };
}

describe('renderDiagramImage', () => {
  let renderer: ReturnType<typeof createRenderer>;

  beforeEach(() => {
    clearDiagramImageCache();
    toBlobMock.mockReset();
    toBlobMock.mockResolvedValue(pngBlob());
    renderer = createRenderer();
    setCodeBlockDiagramRenderer(renderer);
  });

  it('rasterizes at 2x with padding and returns PNG bytes', async () => {
    const result = await renderDiagramImage(CODE);

    expect(renderer.renderMermaid).toHaveBeenCalledTimes(1);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.canvasWidth).toBe(116);
    expect(result.canvasHeight).toBe(66);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.byteLength).toBe(16);
    expect(toBlobMock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ width: 116, height: 66, pixelRatio: 2, backgroundColor: '#ffffff' }),
    );
  });

  it('downscales so the longest side stays within maxSide', async () => {
    await renderDiagramImage(CODE, { maxSide: 58 });

    const options = toBlobMock.mock.calls[0]?.[1] as { pixelRatio: number };
    expect(options.pixelRatio).toBeCloseTo(0.5);
  });

  it('throws a budget error when the canvas exceeds maxPixelArea', async () => {
    await expect(renderDiagramImage(CODE, { maxPixelArea: 10 })).rejects.toBeInstanceOf(
      DiagramImageBudgetError,
    );
  });

  it('reuses the cached image for identical requests', async () => {
    await renderDiagramImage(CODE);
    const second = await renderDiagramImage(CODE);

    expect(renderer.renderMermaid).toHaveBeenCalledTimes(1);
    expect(second.bytes.byteLength).toBe(16);
  });

  it('recomputes when the source changes', async () => {
    await renderDiagramImage(CODE);
    await renderDiagramImage(`${CODE}\n  B --> C`);

    expect(renderer.renderMermaid).toHaveBeenCalledTimes(2);
  });

  it('does not retain images above the cache budget', async () => {
    toBlobMock.mockResolvedValue(pngBlob(DIAGRAM_IMAGE_CACHE_BUDGET_BYTES + 1));

    await renderDiagramImage(CODE);
    await renderDiagramImage(CODE);

    expect(renderer.renderMermaid).toHaveBeenCalledTimes(2);
  });

  it('prefers an explicitly provided renderer over the global one', async () => {
    const local = createRenderer();

    await renderDiagramImage(CODE, { renderer: local, useCache: false });

    expect(local.renderMermaid).toHaveBeenCalledTimes(1);
    expect(renderer.renderMermaid).not.toHaveBeenCalled();
  });
});
