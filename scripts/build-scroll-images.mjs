/**
 * 长卷三档切图脚本（构建期，sharp）
 * 源图: assets/清明上河图.jpg (4206×1733)
 * 输出: public/media/scroll/roll-preview.webp  全览档 宽2100
 *       public/media/scroll/mid/{0..3}.webp   中档 4 片(原生裁切)
 *       public/media/scroll/hi/{0..7}.webp    高清档 8 片(原生裁切)
 *       public/media/thumb/roll-map.webp      迷你导航缩略 宽800
 * 档位参数与 src/core/scroll-image.ts 保持一致: LOW=1片, MID=4片, HI=8片
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'assets', '清明上河图.jpg')

const W = 4206
const H = 1733
// 低档=全览档，是 LCP 元素：需控制体积让 4G 下 ~2.5s 内下完（预算 ≤500KB）。
// 放大即切原生中/高档，故低档只保留「看清全卷」的锐度即可。
const PREVIEW_W = 1250
const PREVIEW_Q = 72
const MID_N = 4
const HI_N = 8

const out = (p) => join(root, 'public', p)

function tileRange(n) {
  const bounds = []
  for (let i = 0; i < n; i++) {
    const left = Math.round((i * W) / n)
    const right = Math.round(((i + 1) * W) / n)
    bounds.push({ left, width: right - left })
  }
  return bounds
}

async function main() {
  const meta = await sharp(SRC).metadata()
  if (meta.width !== W || meta.height !== H) {
    console.warn(`[build:images] 源图尺寸 ${meta.width}×${meta.height} 与预期 ${W}×${H} 不符，按实际尺寸处理`)
  }
  const w = meta.width ?? W
  const h = meta.height ?? H

  await mkdirSync(out('media/scroll/mid'), { recursive: true })
  await mkdirSync(out('media/scroll/hi'), { recursive: true })
  await mkdirSync(out('media/thumb'), { recursive: true })

  const t0 = Date.now()

  // 全览档
  await sharp(SRC).resize(PREVIEW_W).webp({ quality: 82 }).toFile(out('media/scroll/roll-preview.webp'))
  console.log('[build:images] roll-preview.webp', (await import('node:fs')).statSync(out('media/scroll/roll-preview.webp')).size / 1024 / 1024, 'MB')



  // 中档 4 片（原生分辨率裁切，不插值放大）
  for (const [i, { left, width }] of tileRange(MID_N).entries()) {
    await sharp(SRC).extract({ left, top: 0, width, height: h }).webp({ quality: 85 }).toFile(out(`media/scroll/mid/${i}.webp`))
  }
  console.log(`[build:images] mid/ 4 片`)

  // 高清档 8 片
  for (const [i, { left, width }] of tileRange(HI_N).entries()) {
    await sharp(SRC).extract({ left, top: 0, width, height: h }).webp({ quality: 88 }).toFile(out(`media/scroll/hi/${i}.webp`))
  }
  console.log(`[build:images] hi/ 8 片`)

  // 迷你导航缩略
  await sharp(SRC).resize(800).webp({ quality: 70 }).toFile(out('media/thumb/roll-map.webp'))
  console.log('[build:images] thumb/roll-map.webp')

  console.log(`[build:images] done in ${Date.now() - t0}ms`)
}

main().catch((e) => {
  console.error('[build:images] failed:', e)
  process.exit(1)
})
