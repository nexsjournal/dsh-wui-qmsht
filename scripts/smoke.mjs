/** 冒烟测试：headless Chromium 走查核心链路（展卷→锚点→详情→图谱→世界书→移动端） */
import { chromium } from 'playwright-core'
import { homedir } from 'node:os'
import { join } from 'node:path'

const EXE = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
)
const BASE = process.env.BASE || 'http://localhost:5173'
const OUT = '/tmp/smoke'

const errors = []
const browser = await chromium.launch({ executablePath: EXE, args: ['--disable-gpu'] })

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('  📸', name)
}

async function newPage(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push('http ' + r.status() + ': ' + r.url())
  })
  return { ctx, page }
}

console.log('== 桌面 1280x860')
{
  const { ctx, page } = await newPage(1280, 860)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200) // 开场动画
  await shot(page, '01-roll')

  // 名牌应在 z=1 时隐藏
  const namedState = await page.evaluate(() => ({
    stageClass: document.querySelector('.stage')?.className,
    plates: document.querySelectorAll('.anchor .plate').length,
    visiblePlates: [...document.querySelectorAll('.anchor .plate')].filter(
      (el) => getComputedStyle(el).opacity === '1',
    ).length,
    anchors: document.querySelectorAll('.anchor').length,
    landmarks: document.querySelectorAll('.landmark').length,
    preview: document.querySelector('.tile[data-tier="low"]')?.style.opacity,
  }))
  console.log('  state@z1:', JSON.stringify(namedState))

  // 双击放大到虹桥 → z≈2 → 名牌应出现
  await page.mouse.dblclick(640, 300)
  await page.waitForTimeout(800)
  await shot(page, '02-zoomed')
  const zState = await page.evaluate(() => ({
    z: document.querySelector('.stage')?.dataset?.z,
    visiblePlates: [...document.querySelectorAll('.anchor .plate')].filter(
      (el) => getComputedStyle(el).opacity === '1',
    ).length,
  }))
  console.log('  state@z2:', JSON.stringify(zState))

  // 点击某个锚点 → 详情
  const anchorBox = await page.evaluate(() => {
    const a = [...document.querySelectorAll('.anchor')].find((el) => {
      const r = el.getBoundingClientRect()
      return r.x > 100 && r.x < 1180 && r.y > 100 && r.y < 760
    })
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: a.dataset.id }
  })
  console.log('  点击锚点:', anchorBox?.id)
  if (anchorBox) {
    await page.mouse.click(anchorBox.x, anchorBox.y)
    await page.waitForTimeout(900)
    await shot(page, '03-detail')
    const detail = await page.evaluate(() => ({
      open: !!document.querySelector('.detail'),
      name: document.querySelector('.d-name')?.textContent,
      hasBg: !!document.querySelector('.d-bg'),
      rels: document.querySelectorAll('.d-rel').length,
    }))
    console.log('  详情:', JSON.stringify(detail))

    // 关系跳转（如有）
    const rel = await page.$('.d-rel')
    if (rel) {
      await rel.click()
      await page.waitForTimeout(800)
      await shot(page, '04-detail-rel')
      console.log('  跳转后:', await page.evaluate(() => document.querySelector('.d-name')?.textContent))
    }

    // 「在画卷中查看」
    const btn = await page.$('text=在画卷中查看')
    if (btn) {
      await btn.click()
      await page.waitForTimeout(1200)
      await shot(page, '05-flyback')
      console.log('  飞回画卷 OK')
    }
  }

  // 切图谱
  await page.click('text=图谱')
  await page.waitForTimeout(1500)
  await shot(page, '06-graph')
  const graph = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.gv-node').length,
    edges: document.querySelectorAll('.gv-edge').length,
  }))
  console.log('  图谱:', JSON.stringify(graph))

  // 图谱点节点
  const node = await page.$('.gv-node')
  if (node) {
    const b = await node.boundingBox()
    if (b) {
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2)
      await page.waitForTimeout(900)
      await shot(page, '07-graph-detail')
      console.log('  图谱详情:', await page.evaluate(() => document.querySelector('.d-name')?.textContent))
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  }

  // 世界书
  const worldBtn = await page.$('text=世界')
  if (worldBtn) {
    await worldBtn.click()
    await page.waitForTimeout(700)
    await shot(page, '08-world')
    await page.click('.w-close')
    await page.waitForTimeout(400)
  }

  // 音乐按钮
  const music = await page.$('.music-btn')
  if (music) {
    await music.click()
    await page.waitForTimeout(400)
    await shot(page, '09-music-toast')
  }

  await ctx.close()
}

console.log('== 移动 390x844')
{
  const { ctx, page } = await newPage(390, 844)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3200)
  await shot(page, '10-mobile')
  // 单指拖拽（touch 模拟用 mouse 也可，pointer 统一）
  await page.mouse.move(195, 400)
  await page.mouse.down()
  await page.mouse.move(300, 380, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  await shot(page, '11-mobile-pan')
  // 双指捏合
  const cdp = await ctx.newCDPSession(page)
  const pinch = async () => {
    await cdp.send('Input.synthesizePinchGesture', { x: 195, y: 400, scaleFactor: 1.6, relativeSpeed: 600 })
  }
  try {
    await pinch()
    await page.waitForTimeout(700)
    await shot(page, '12-mobile-pinch')
  } catch (e) {
    console.log('  pinch 跳过:', e.message.slice(0, 80))
  }
  await ctx.close()
}

console.log('\n== 错误汇总')
if (errors.length) {
  for (const e of errors.slice(0, 20)) console.log('  ✗', e)
} else {
  console.log('  ✓ 无 console/page 错误')
}

await browser.close()
