import gsap from 'gsap'

/** 长卷逻辑尺寸（归一化坐标以此为 100%） */
export const SCROLL_W = 4206
export const SCROLL_H = 1733

export interface CameraState {
  x: number
  y: number
  scale: number
}

/**
 * 镜头：管理 {x, y, scale}，只写 transform，永不触发布局。
 * x/y 为画布左上角的屏幕坐标；scale 为绝对像素缩放。
 * z = scale / scaleBase，scaleBase 使 z=1 时画面高度铺满视口。
 * 长卷与图谱共用（传入各自逻辑尺寸）。
 */
export class CameraRig {
  cam: CameraState = { x: 0, y: 0, scale: 1 }
  vw = 0
  vh = 0
  rubber = 40
  minZ = 1
  maxZ = 4
  readonly W: number
  readonly H: number
  private scaleBase = 1
  private flyTween: gsap.core.Tween | null = null

  constructor(private el: HTMLElement | SVGElement, w = SCROLL_W, h = SCROLL_H) {
    this.W = w
    this.H = h
    el.style.transformOrigin = '0 0'
    el.style.willChange = 'transform'
  }

  get z() {
    return this.cam.scale / this.scaleBase
  }

  get baseScale() {
    return this.scaleBase
  }

  resize(vw: number, vh: number) {
    // 视图被 v-show 隐藏（诗韵/图谱页）时 RO 会报 0 尺寸，忽略以免污染 scaleBase
    // （污染后回展卷/寻人时全览飞行目标 scale≈0，画面缩成一条线）
    if (vw <= 0 || vh <= 0) return
    this.vw = vw
    this.vh = vh
    this.scaleBase = Math.max(vh, 1) / this.H
    this.clamp()
    this.apply()
  }

  /** 初始视角：指定归一化点居中（长卷=虹桥 0.6） */
  initView(centerN = 0.6) {
    this.cam.scale = this.scaleBase
    this.cam.x = this.vw / 2 - this.W * centerN * this.scaleBase
    this.cam.y = 0
    this.clamp()
    this.apply()
  }

  /** 全览适配（图谱用）：整个画布放进视口 */
  fitView(padding = 0.88) {
    const s = Math.min(this.vw / this.W, this.vh / this.H) * padding
    this.cam.scale = s
    this.cam.x = (this.vw - this.W * s) / 2
    this.cam.y = (this.vh - this.H * s) / 2
    this.apply()
  }

  apply() {
    const { x, y, scale } = this.cam
    this.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
  }

  /** 带橡皮筋边界的钳制 */
  clamp() {
    const s = this.cam.scale
    const W = this.W * s
    const H = this.H * s
    const r = this.rubber
    if (W <= this.vw) this.cam.x = (this.vw - W) / 2
    else this.cam.x = Math.min(r, Math.max(this.vw - W - r, this.cam.x))
    if (H <= this.vh) this.cam.y = (this.vh - H) / 2
    else this.cam.y = Math.min(r, Math.max(this.vh - H - r, this.cam.y))
  }

  inBounds() {
    const s = this.cam.scale
    const W = this.W * s
    const H = this.H * s
    return (
      this.cam.x <= 0.5 &&
      this.cam.x >= this.vw - W - 0.5 &&
      this.cam.y <= 0.5 &&
      this.cam.y >= this.vh - H - 0.5
    )
  }

  /** 以屏幕点 (px,py) 为锚点缩放 factor 倍 */
  zoomAt(px: number, py: number, factor: number) {
    const s = Math.min(
      this.scaleBase * this.maxZ,
      Math.max(this.scaleBase * this.minZ, this.cam.scale * factor),
    )
    const f = s / this.cam.scale
    if (Math.abs(f - 1) < 1e-4) return
    this.cam.x = px - (px - this.cam.x) * f
    this.cam.y = py - (py - this.cam.y) * f
    this.cam.scale = s
    this.clamp()
    this.apply()
  }

  /** 平移到目标 z（相对 scaleBase），锚点默认视口中心，带缓动 */
  zoomTo(z: number, anchor?: { x: number; y: number }, ms = 450) {
    const scale = this.scaleBase * z
    const ax = anchor?.x ?? this.vw / 2
    const ay = anchor?.y ?? this.vh / 2
    const f = scale / this.cam.scale
    this.flyTo({ x: ax - (ax - this.cam.x) * f, y: ay - (ay - this.cam.y) * f, scale }, ms)
  }

  /** 步进平移（含橡皮筋钳制），返回实际移动量（惯性用于判定撞墙） */
  stepPan(dx: number, dy: number): [number, number] {
    const bx = this.cam.x
    const by = this.cam.y
    this.cam.x += dx
    this.cam.y += dy
    this.clamp()
    this.apply()
    return [this.cam.x - bx, this.cam.y - by]
  }

  /** 镜头飞行（可被手势打断） */
  flyTo(target: { x: number; y: number; scale: number }, ms = 600) {
    this.killFly()
    const from = { ...this.cam }
    const t = { k: 0 }
    this.flyTween = gsap.to(t, {
      k: 1,
      duration: ms / 1000,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.cam.x = from.x + (target.x - from.x) * t.k
        this.cam.y = from.y + (target.y - from.y) * t.k
        this.cam.scale = from.scale + (target.scale - from.scale) * t.k
        this.clamp()
        this.apply()
      },
      onComplete: () => {
        this.flyTween = null
      },
    })
  }

  killFly() {
    this.flyTween?.kill()
    this.flyTween = null
  }

  /** 让归一化坐标 (n.x, n.y) 居中，可选目标 zoom */
  centerOn(n: { x: number; y: number }, zoom = this.z, ms = 600) {
    const scale = this.scaleBase * zoom
    this.flyTo({ x: this.vw / 2 - n.x * this.W * scale, y: this.vh / 2 - n.y * this.H * scale, scale }, ms)
  }

  /** 让画布坐标点 (px,py) 居中，指定绝对 scale */
  centerCanvas(px: number, py: number, scale: number, ms = 600) {
    this.flyTo({ x: this.vw / 2 - px * scale, y: this.vh / 2 - py * scale, scale }, ms)
  }

  /** 视口覆盖的画布 x 范围（画布坐标） */
  visibleXRange(): [number, number] {
    return [-this.cam.x / this.cam.scale, (this.vw - this.cam.x) / this.cam.scale]
  }
}
