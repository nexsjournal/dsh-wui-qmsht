import { CameraRig } from './camera'
import { startInertia, type InertiaHandle } from './inertia'

export interface PanZoomOptions {
  /** 点击（位移<8px 且 <300ms），坐标为容器内屏幕坐标 */
  onTap?: (x: number, y: number) => void
  onDoubleTap?: (x: number, y: number) => void
  onGestureStart?: () => void
  onSettle?: () => void
  onEscape?: () => void
}

interface Ptr {
  x: number
  y: number
}

/**
 * 统一手势层：pointer events 覆盖触摸 + 鼠标 + 触控板。
 * 单指拖拽平移 / 双指捏合缩放 / 双击 / 滚轮 / 键盘 / 惯性。
 */
export class PanZoom {
  private pointers = new Map<number, Ptr>()
  private downT = 0
  private downX = 0
  private downY = 0
  private lastTap = { t: 0, x: 0, y: 0 }
  private samples: { t: number; x: number; y: number }[] = []
  private inertia: InertiaHandle | null = null
  private pinchPrevDist = 0
  private pinchPrevMid = { x: 0, y: 0 }

  constructor(private container: HTMLElement, private rig: CameraRig, private opts: PanZoomOptions = {}) {
    container.style.touchAction = 'none'
    container.addEventListener('pointerdown', this.onDown)
    container.addEventListener('pointermove', this.onMove)
    container.addEventListener('pointerup', this.onUp)
    container.addEventListener('pointercancel', this.onUp)
    container.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('keydown', this.onKey)
  }

  dispose() {
    this.inertia?.stop()
    this.rig.killFly()
    this.container.removeEventListener('pointerdown', this.onDown)
    this.container.removeEventListener('pointermove', this.onMove)
    this.container.removeEventListener('pointerup', this.onUp)
    this.container.removeEventListener('pointercancel', this.onUp)
    this.container.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKey)
  }

  /** 手势开始时打断飞行/惯性 */
  interrupt() {
    this.inertia?.stop()
    this.rig.killFly()
  }

  private pos(e: PointerEvent) {
    const r = this.container.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onDown = (e: PointerEvent) => {
    // 交互控件（按钮/输入等）不接管指针：
    // setPointerCapture 会把后续 click 重定向到容器，控件将永远收不到点击
    const t = e.target as HTMLElement | null
    if (t && t.closest('button, input, a, textarea, select, label, [data-no-pan]')) return
    this.interrupt()
    this.opts.onGestureStart?.()
    try {
      this.container.setPointerCapture(e.pointerId)
    } catch {
      /* 部分 WebView 对合成指针不支持 capture，忽略 */
    }
    const p = this.pos(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size === 1) {
      this.downT = performance.now()
      this.downX = p.x
      this.downY = p.y
      this.samples = [{ t: this.downT, x: p.x, y: p.y }]
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinchPrevDist = Math.hypot(a.x - b.x, a.y - b.y)
      this.pinchPrevMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      this.samples = []
    }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const prev = this.pointers.get(e.pointerId)!
    const p = this.pos(e)
    this.pointers.set(e.pointerId, p)

    if (this.pointers.size === 1) {
      this.rig.stepPan(p.x - prev.x, p.y - prev.y)
      const now = performance.now()
      this.samples.push({ t: now, x: p.x, y: p.y })
      while (this.samples.length > 2 && now - this.samples[0].t > 100) this.samples.shift()
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (this.pinchPrevDist > 0 && dist > 0) {
        this.rig.zoomAt(mid.x, mid.y, dist / this.pinchPrevDist)
      }
      this.rig.cam.x += mid.x - this.pinchPrevMid.x
      this.rig.cam.y += mid.y - this.pinchPrevMid.y
      this.rig.clamp()
      this.rig.apply()
      this.pinchPrevDist = dist
      this.pinchPrevMid = mid
    }
  }

  private onUp = (e: PointerEvent) => {
    const released = this.pointers.get(e.pointerId)
    if (!released) return
    this.pointers.delete(e.pointerId)
    const now = performance.now()

    if (this.pointers.size === 1) {
      // 捏合剩一指：以该指为基准重设，避免跳变
      const [a] = [...this.pointers.values()]
      this.downT = now
      this.downX = a.x
      this.downY = a.y
      this.samples = [{ t: now, x: a.x, y: a.y }]
      return
    }
    if (this.pointers.size > 0) return

    const moved = Math.hypot(released.x - this.downX, released.y - this.downY)
    const dt = now - this.downT
    if (dt < 300 && moved < 8) {
      const isDouble =
        now - this.lastTap.t < 300 && Math.hypot(released.x - this.lastTap.x, released.y - this.lastTap.y) < 32
      this.lastTap = { t: now, x: released.x, y: released.y }
      if (isDouble) this.opts.onDoubleTap?.(released.x, released.y)
      else this.opts.onTap?.(released.x, released.y)
    } else {
      this.lastTap.t = 0
      const v = this.sampleVelocity()
      if (Math.hypot(v.x, v.y) > 80) {
        this.inertia?.stop()
        this.inertia = startInertia(v.x, v.y, { step: (dx, dy) => this.rig.stepPan(dx, dy) })
      }
      this.opts.onSettle?.()
    }
  }

  /** 最近 100ms 的平均速度 (px/s) */
  private sampleVelocity() {
    const s = this.samples
    if (s.length < 2) return { x: 0, y: 0 }
    const a = s[0]
    const b = s[s.length - 1]
    const dt = (b.t - a.t) / 1000
    if (dt <= 0) return { x: 0, y: 0 }
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.interrupt()
    const r = this.container.getBoundingClientRect()
    // 触控板捏合（ctrlKey）用更灵敏的系数
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.008 : 0.0016))
    this.rig.zoomAt(e.clientX - r.left, e.clientY - r.top, factor)
  }

  private onKey = (e: KeyboardEvent) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea') return
    const s = 90
    switch (e.key) {
      case 'ArrowLeft':
        this.rig.stepPan(s, 0)
        e.preventDefault()
        break
      case 'ArrowRight':
        this.rig.stepPan(-s, 0)
        e.preventDefault()
        break
      case 'ArrowUp':
        this.rig.stepPan(0, s)
        e.preventDefault()
        break
      case 'ArrowDown':
        this.rig.stepPan(0, -s)
        e.preventDefault()
        break
      case '+':
      case '=':
        this.rig.zoomAt(this.rig.vw / 2, this.rig.vh / 2, 1.25)
        break
      case '-':
      case '_':
        this.rig.zoomAt(this.rig.vw / 2, this.rig.vh / 2, 1 / 1.25)
        break
      case 'Escape':
        this.opts.onEscape?.()
        break
    }
  }
}
