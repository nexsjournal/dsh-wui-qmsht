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
  const zState = await page.evaluate(() => {
    const named = [...document.querySelectorAll('.anchor')].find((el) => {
      const p = el.querySelector('.plate')
      return p && getComputedStyle(p).opacity === '1'
    })
    let gap = null
    if (named) {
      const dot = named.querySelector('.dot').getBoundingClientRect()
      const plate = named.querySelector('.plate').getBoundingClientRect()
      gap = Math.round(dot.top - plate.bottom)
    }
    return {
      z: document.querySelector('.stage')?.dataset?.z,
      visiblePlates: [...document.querySelectorAll('.anchor .plate')].filter(
        (el) => getComputedStyle(el).opacity === '1',
      ).length,
      plateDotGap: gap,
    }
  })
  console.log('  state@z2:', JSON.stringify(zState))

  // A1：迷你导航场景分段
  const mn = await page.evaluate(() => ({
    scenes: document.querySelectorAll('.mn-scene').length,
    active: document.querySelector('.mn-scene.active')?.textContent,
  }))
  console.log('  场景分段:', JSON.stringify(mn))

  // A2：自动巡览
  await page.click('text=导览')
  await page.waitForTimeout(1400)
  await shot(page, '02a-tour')
  const tour = await page.evaluate(() => ({
    card: document.querySelector('.tour-card')?.textContent?.slice(0, 30),
    btn: document.querySelector('.title-corner .guide-btn:last-child')?.textContent?.trim(),
  }))
  console.log('  巡览中:', JSON.stringify(tour))
  await page.click('text=暂停')
  await page.waitForTimeout(300)
  console.log('  暂停后按钮:', await page.evaluate(() => document.querySelector('.title-corner .guide-btn:last-child')?.textContent?.trim()))
  await page.click('text=继续')
  await page.waitForTimeout(300)
  // 手势打断巡览（拖拽一下）
  await page.mouse.move(640, 300)
  await page.mouse.down()
  await page.mouse.move(500, 300, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  console.log('  手势打断后按钮:', await page.evaluate(() => document.querySelector('.title-corner .guide-btn:last-child')?.textContent?.trim()))

  // 清明诗韵 tab（底部导航）
  await page.click('.tabbar .tab:has-text("诗韵")')
  await page.waitForTimeout(500)
  const poemState = await page.evaluate(() => ({
    view: !!document.querySelector('.poem-view'),
    cards: document.querySelectorAll('.pv-card').length,
    open: !!document.querySelector('.pv-card.open'),
    links: document.querySelectorAll('.pv-link').length,
  }))
  await shot(page, '02a-poem')
  console.log('  诗韵:', JSON.stringify(poemState))
  const pvLink = await page.$('.pv-link')
  if (pvLink) {
    await pvLink.click()
    await page.waitForTimeout(1200)
    console.log(
      '  诗中人跳转选中:',
      await page.evaluate(() => document.querySelector('.anchor.selected .plate')?.textContent),
    )
    console.log(
      '  寻到字幕:',
      await page.evaluate(() => document.querySelector('.found-cap')?.textContent?.replace(/\s+/g, ' ').trim()),
    )
    console.log(
      '  寻到闪示:',
      await page.evaluate(() => !!document.querySelector('.anchor.flash')),
    )
    await shot(page, '02a-poem-jump')
  }
  // 回归：诗韵（RollView 隐藏中）→ 直接点寻人，相机不得被 0 尺寸污染
  await page.click('.tabbar .tab:has-text("诗韵")')
  await page.waitForTimeout(300)
  await page.click('.tabbar .tab:has-text("寻人")')
  await page.waitForTimeout(1200)
  const findScale = await page.evaluate(() => {
    const m = document.querySelector('.stage')?.style.transform?.match(/scale\(([\d.]+)\)/)
    return m ? parseFloat(m[1]) : null
  })
  console.log('  诗韵→寻人 画面 scale（应≈baseScale，非 0）:', findScale)
  if (!findScale || findScale < 0.2) throw new Error('寻人画面缩放异常: ' + findScale)
  await page.click('text=退出')
  await page.waitForTimeout(500)

  // 昼夜时辰
  const phaseBtn = await page.$('button[aria-label="切换时辰"]')
  if (phaseBtn) {
    await phaseBtn.click()
    await page.waitForTimeout(400)
    const dusk = await page.evaluate(() => document.querySelector('.stage')?.className.includes('dusk'))
    await phaseBtn.click()
    await page.waitForTimeout(1800)
    const night = await page.evaluate(() => document.querySelector('.stage')?.className.includes('night'))
    await shot(page, '02b-night')
    console.log('  昼夜:', JSON.stringify({ dusk, night }))
    await phaseBtn.click() // 回白昼
    await page.waitForTimeout(400)
  }

  // 地标信息卡（取视口内第一个可见地标）
  const lm = await page.evaluateHandle(() =>
    [...document.querySelectorAll('.landmark')].find((el) => {
      const r = el.getBoundingClientRect()
      return r.x >= 0 && r.y >= 0 && r.x < innerWidth && r.y < innerHeight
    }) ?? null,
  )
  if (lm && lm.asElement()) {
    await lm.asElement().click()
    await page.waitForTimeout(900)
    const card = await page.evaluate(() => ({
      name: document.querySelector('.mark-card .mark-name')?.textContent,
      chips: document.querySelectorAll('.mark-chip').length,
    }))
    await shot(page, '02c-mark')
    console.log('  地标卡:', JSON.stringify(card))
    const close = await page.$('.mark-close')
    if (close) await close.click()
    await page.waitForTimeout(300)
  }

  // 寻人玩法
  await page.click('text=寻人')
  await page.waitForTimeout(1000)
  await shot(page, '03-find-hud')
  const findState = await page.evaluate(() => ({
    hud: !!document.querySelector('.find-hud'),
    finding: document.querySelector('.stage')?.className.includes('seeking'),
    lowOn: document.querySelector('.layer-low')?.classList.contains('on'),
    platesHidden: [...document.querySelectorAll('.stage .anchor .plate')].every(
      (el) => getComputedStyle(el).opacity === '0',
    ),
    clue: document.querySelector('.find-clue p')?.textContent?.slice(0, 12),
  }))
  console.log('  寻人:', JSON.stringify(findState))
  await page.click('text=退出')
  await page.waitForTimeout(500)
  console.log(
    '  寻人退出后仍 seeking?:',
    await page.evaluate(() => document.querySelector('.stage')?.className.includes('seeking')),
  )

  // 案情：读案 → 找人 → 揭晓 → 图谱点亮
  await page.click('text=案情')
  await page.waitForTimeout(900)
  await shot(page, '04-story-intro')
  const storyState = await page.evaluate(() => {
    const el = document.querySelector('.story-card .fw-name')
    if (!el) return { hud: false }
    const title = el.querySelector('i')?.textContent ?? ''
    const name = el.textContent.replace(title, '').replace(/^寻\s*/, '').trim()
    return { hud: !!document.querySelector('.story-hud'), name, title }
  })
  console.log('  案情读案:', JSON.stringify(storyState))
  await page.click('text=出发找人')
  await page.waitForTimeout(900)
  // 目标名来自 intro 卡：按名牌文本匹配锚点
  const targetName = storyState.name || ''
  const box = await page.evaluate((name) => {
    const a = [...document.querySelectorAll('.anchor')].find((el) => el.querySelector('.plate')?.textContent === name)
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, targetName.trim())
  console.log('  案情目标:', targetName.trim(), JSON.stringify(box))
  if (box) {
    await page.mouse.click(box.x, box.y)
    await page.waitForTimeout(1000)
    const reveal = await page.evaluate(() => ({
      card: document.querySelector('.story-card .fw-head')?.textContent,
      pair: document.querySelector('.story-card .fw-pair')?.textContent,
    }))
    await shot(page, '04-story-reveal')
    console.log('  案情揭晓:', JSON.stringify(reveal))
    await page.click('text=图谱中看')
    await page.waitForTimeout(1200)
    const unlocked = await page.evaluate(() => document.querySelectorAll('.gv-edge.unlocked').length)
    await shot(page, '04-story-graph')
    console.log('  图谱点亮边数:', unlocked)
    await page.locator('.tabbar .tab', { hasText: '展卷' }).click()
    await page.waitForTimeout(600)
  }

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

    // AI 角色对谈（本地模式）
    const chatBtn = await page.$('text=与他谈')
    if (chatBtn) {
      await chatBtn.click()
      await page.waitForTimeout(500)
      const chatState = await page.evaluate(() => ({
        panel: !!document.querySelector('.chat-panel'),
        ai: document.querySelectorAll('.chat-bubble.ai').length,
        chips: document.querySelectorAll('.chat-chip').length,
      }))
      await shot(page, '04b-chat')
      console.log('  对话:', JSON.stringify(chatState))
      const chip = await page.$('text=你与谁交好？')
      if (chip) {
        await chip.click()
        await page.waitForTimeout(1100)
        const ai2 = await page.evaluate(() => document.querySelectorAll('.chat-bubble.ai').length)
        await shot(page, '04b-chat2')
        console.log('  追问后 ai 气泡数:', ai2)
      }
      const closeChat = await page.$('.chat-close')
      if (closeChat) {
        await closeChat.click()
        await page.waitForTimeout(400)
      }
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
