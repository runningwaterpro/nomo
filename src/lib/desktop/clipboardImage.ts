/**
 * 把 PNG 字节写入系统剪贴板。
 *
 * 桌面端使用 Tauri clipboard-manager 的 writeImage；浏览器环境退回 ClipboardItem。
 * 只写图片格式，不附带 HTML 或纯文本，避免 Word、钉钉在粘贴时优先取走文本。
 */
export async function writePngToClipboard(bytes: Uint8Array): Promise<boolean> {
  try {
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeImage(bytes);
    return true;
  } catch {
    try {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([buffer], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }
}
