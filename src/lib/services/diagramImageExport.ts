import { getDiagramRenderer } from '../editor-core/renderers';
import type { DiagramRenderer } from './render';
import type { MermaidThemeDefinition } from '../theme/types';

/** 图表复制与 Word 导出共用的一次导出参数。 */
export interface DiagramImageOptions {
  signal?: AbortSignal;
  pixelRatio?: number;
  maxSide?: number;
  maxPixelArea?: number;
  backgroundColor?: string;
  padding?: number;
  theme?: MermaidThemeDefinition;
  useCache?: boolean;
  /** 调用方自带渲染器时优先使用，避免依赖全局注册状态。 */
  renderer?: DiagramRenderer;
}

export interface DiagramImageResult {
  bytes: Uint8Array;
  /** SVG 固有宽度，不含内边距。 */
  width: number;
  /** SVG 固有高度，不含内边距。 */
  height: number;
  canvasWidth: number;
  canvasHeight: number;
  pixelWidth: number;
  pixelHeight: number;
}

/** 超出一张图片的缓存预算时不保留，避免单张大图长期占用内存。 */
export const DIAGRAM_IMAGE_CACHE_BUDGET_BYTES = 4 * 1024 * 1024;
export const DIAGRAM_IMAGE_MAX_SIDE = 4096;

/** 复制给外部文档使用的浅色配色，与 Word 导出保持一致。 */
export const DIAGRAM_EXPORT_THEME: MermaidThemeDefinition = {
  theme: 'default',
  themeVariables: {
    darkMode: 'false',
    background: '#ffffff',
    primaryTextColor: '#202124',
  },
};

const DEFAULT_PIXEL_RATIO = 2;
const DEFAULT_PADDING = 8;
const DEFAULT_BACKGROUND = '#ffffff';
const MIN_SCALE = 0.1;
const FALLBACK_WIDTH = 800;
const FALLBACK_HEIGHT = 600;

/** 超出调用方给定的画布预算；Word 导出据此映射为既有预算错误。 */
export class DiagramImageBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagramImageBudgetError';
  }
}

let cachedImage: (DiagramImageResult & { key: string }) | null = null;

export function clearDiagramImageCache(): void {
  cachedImage = null;
}

/**
 * 把 Mermaid 源码按导出主题重新渲染并光栅化为 PNG。
 *
 * 与 Word 导出共用同一实现：离屏节点 + html-to-image，输出白底、固定内边距，
 * 长边超过 maxSide 或画布超过 maxPixelArea 时按参数处理。
 */
export async function renderDiagramImage(
  code: string,
  options: DiagramImageOptions = {},
): Promise<DiagramImageResult> {
  if (!code.trim()) throw new Error('empty-diagram');

  const theme = options.theme ?? DIAGRAM_EXPORT_THEME;
  const pixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;
  const padding = options.padding ?? DEFAULT_PADDING;
  const backgroundColor = options.backgroundColor ?? DEFAULT_BACKGROUND;
  const useCache = options.useCache !== false;
  const key = buildCacheKey(code, {
    theme,
    pixelRatio,
    padding,
    backgroundColor,
    maxSide: options.maxSide,
    maxPixelArea: options.maxPixelArea,
  });

  if (useCache && cachedImage?.key === key) {
    options.signal?.throwIfAborted();
    return toResult(cachedImage);
  }

  const renderer = options.renderer ?? getDiagramRenderer();
  if (!renderer) throw new Error('diagram-renderer-unavailable');

  const rendered = await renderer.renderMermaid(code, { theme, signal: options.signal });
  options.signal?.throwIfAborted();
  if (rendered.error || !rendered.svg) throw new Error(rendered.error || 'diagram-render-failed');

  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  const root = holder.attachShadow({ mode: 'open' });
  const element = document.createElement('div');
  element.style.cssText = `display:inline-block;background:${backgroundColor};padding:${padding}px;`;
  root.append(element);
  document.body.append(holder);

  try {
    element.innerHTML = rendered.svg;
    const svg = element.querySelector('svg');
    if (!svg) throw new Error('diagram-render-failed');

    const { width, height } = readSvgIntrinsicSize(svg);
    const canvasWidth = width + padding * 2;
    const canvasHeight = height + padding * 2;

    let scale = pixelRatio;
    if (options.maxSide && options.maxSide > 0) {
      scale = Math.min(scale, options.maxSide / Math.max(canvasWidth, canvasHeight));
    }
    scale = Math.max(scale, MIN_SCALE);

    if (
      options.maxPixelArea &&
      options.maxPixelArea > 0 &&
      Math.ceil(canvasWidth * scale) * Math.ceil(canvasHeight * scale) > options.maxPixelArea
    ) {
      throw new DiagramImageBudgetError('diagram-image-too-large');
    }

    svg.style.cssText = `width:${width}px;height:${height}px;max-width:none;`;
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    options.signal?.throwIfAborted();
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(element, {
      width: canvasWidth,
      height: canvasHeight,
      pixelRatio: scale,
      backgroundColor,
    });
    if (!blob) throw new Error('diagram-raster-failed');
    options.signal?.throwIfAborted();

    const result: DiagramImageResult = {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width,
      height,
      canvasWidth,
      canvasHeight,
      pixelWidth: Math.round(canvasWidth * scale),
      pixelHeight: Math.round(canvasHeight * scale),
    };
    if (useCache && result.bytes.byteLength <= DIAGRAM_IMAGE_CACHE_BUDGET_BYTES) {
      cachedImage = { key, ...result };
    }
    return result;
  } finally {
    element.replaceChildren();
    holder.remove();
  }
}

function toResult(entry: DiagramImageResult & { key: string }): DiagramImageResult {
  return {
    bytes: entry.bytes,
    width: entry.width,
    height: entry.height,
    canvasWidth: entry.canvasWidth,
    canvasHeight: entry.canvasHeight,
    pixelWidth: entry.pixelWidth,
    pixelHeight: entry.pixelHeight,
  };
}

function buildCacheKey(
  code: string,
  options: {
    theme: MermaidThemeDefinition;
    pixelRatio: number;
    padding: number;
    backgroundColor: string;
    maxSide?: number;
    maxPixelArea?: number;
  },
): string {
  return JSON.stringify([
    code,
    options.theme.theme,
    options.theme.themeVariables ?? null,
    options.pixelRatio,
    options.padding,
    options.backgroundColor,
    options.maxSide ?? null,
    options.maxPixelArea ?? null,
  ]);
}

/** jsdom 不实现 SVGAnimatedRect，因此同时兼容 viewBox 属性解析。 */
function readSvgIntrinsicSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (
      parts.length === 4 &&
      parts.every((value) => Number.isFinite(value)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  return { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };
}
