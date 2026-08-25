import { SCROLL_H, SCROLL_W } from './camera'

let previewImg: HTMLImageElement | null = null

/** 预载全览档（同源，无 taint 风险） */
export function getPreviewImg(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (previewImg) return resolve(previewImg)
    const img = new Image()
    img.onload = () => {
      previewImg = img
      resolve(img)
    }
    img.onerror = reject
    img.src = '/media/scroll/roll-preview.webp'
  })
}

/**
 * 从全览档裁出画布区域 → dataURL（cover 适配）
 * @param cx 画布坐标中心 x（原图 4206 系）
 */
export async function cropRegion(
  cx: number,
  cy: number,
  cropW: number,
  cropH: number,
  outW: number,
  outH: number,
): Promise<string | null> {
  try {
    const img = await getPreviewImg()
    const k = img.naturalWidth / SCROLL_W
    const sx = Math.max(0, (cx - cropW / 2) * k)
    const sy = Math.max(0, (cy - cropH / 2) * k)
    const sw = Math.min(cropW * k, img.naturalWidth - sx)
    const sh = Math.min(cropH * k, img.naturalHeight - sy)
    if (sw <= 0 || sh <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const r = Math.max(outW / sw, outH / sh)
    const dw = sw * r
    const dh = sh * r
    ctx.drawImage(img, sx, sy, sw, sh, (outW - dw) / 2, (outH - dh) / 2, dw, dh)
    return canvas.toDataURL('image/webp', 0.78)
  } catch {
    return null
  }
}
