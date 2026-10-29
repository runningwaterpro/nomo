import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { MermaidBlockNodeView } from './nodeViews/MermaidBlockNodeView';
import { schema } from './schema';
import { setCodeBlockDiagramRenderer } from './renderers';
import { t } from '../../app/i18n';

const { renderImageMock, writeClipboardMock } = vi.hoisted(() => ({
  renderImageMock: vi.fn(),
  writeClipboardMock: vi.fn(),
}));

vi.mock('../services/diagramImageExport', () => ({
  renderDiagramImage: (...args: unknown[]) => renderImageMock(...args),
  clearDiagramImageCache: vi.fn(),
}));

vi.mock('../desktop/clipboardImage', () => ({
  writePngToClipboard: (...args: unknown[]) => writeClipboardMock(...args),
}));

function mountDiagram(code = 'flowchart TD\n  A --> B'): {
  view: EditorView;
  target: HTMLDivElement;
} {
  setCodeBlockDiagramRenderer({
    async renderMermaid() {
      return { svg: '<svg data-copy-diagram="true" viewBox="0 0 100 50"><g></g></svg>' };
    },
  });

  const node = schema.nodes.mermaid_block.create({ code });
  const doc = schema.nodes.doc.create(null, [node]);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const view = new EditorView(target, {
    state: EditorState.create({ doc }),
    nodeViews: {
      mermaid_block: (node, view, getPos) =>
        new MermaidBlockNodeView(node, view, getPos as () => number),
    },
  });
  return { view, target };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.querySelector('.mermaid-fullscreen-overlay')?.remove();
});

describe('Mermaid 图表复制按钮', () => {
  it('copies the rendered PNG and shows success feedback before resetting', async () => {
    vi.useFakeTimers();
    renderImageMock.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) });
    writeClipboardMock.mockResolvedValue(true);
    const { view, target } = mountDiagram();
    await flush();

    const button = target.querySelector<HTMLButtonElement>('.mermaid-block-copy-button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe(t.copyImage());

    button?.click();
    await flush();

    expect(renderImageMock).toHaveBeenCalledWith('flowchart TD\n  A --> B');
    expect(writeClipboardMock).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(button?.classList.contains('is-copied')).toBe(true);
    expect(button?.getAttribute('aria-label')).toBe(t.copied());
    expect(target.querySelector('.mermaid-block-textarea')).toBeNull();

    vi.advanceTimersByTime(1200);
    expect(button?.classList.contains('is-copied')).toBe(false);
    expect(button?.getAttribute('aria-label')).toBe(t.copyImage());

    view.destroy();
    target.remove();
  });

  it('shows an error state when the clipboard write fails', async () => {
    vi.useFakeTimers();
    renderImageMock.mockResolvedValue({ bytes: new Uint8Array([1]) });
    writeClipboardMock.mockResolvedValue(false);
    const { view, target } = mountDiagram();
    await flush();

    const button = target.querySelector<HTMLButtonElement>('.mermaid-block-copy-button');
    button?.click();
    await flush();

    expect(button?.classList.contains('is-copy-error')).toBe(true);
    expect(button?.getAttribute('aria-label')).toBe(t.copyFailed());

    vi.advanceTimersByTime(1500);
    expect(button?.classList.contains('is-copy-error')).toBe(false);

    view.destroy();
    target.remove();
  });

  it('offers the same copy action inside the fullscreen viewer', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    renderImageMock.mockResolvedValue({ bytes: new Uint8Array([9]) });
    writeClipboardMock.mockResolvedValue(true);
    const { view, target } = mountDiagram();
    await flush();

    target.querySelector<HTMLButtonElement>('.mermaid-block-fullscreen-button')?.click();
    const overlay = document.body.querySelector('.mermaid-fullscreen-overlay');
    const copyButton = overlay?.querySelector<HTMLButtonElement>(
      '.mermaid-fullscreen-controls .mermaid-fullscreen-copy-button',
    );
    expect(copyButton).not.toBeNull();

    copyButton?.click();
    await flush();

    expect(writeClipboardMock).toHaveBeenCalledWith(new Uint8Array([9]));
    expect(copyButton?.classList.contains('is-copied')).toBe(true);

    view.destroy();
    target.remove();
  });
});
