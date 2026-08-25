export interface InertiaHandle {
  stop(): void
}

export interface InertiaOptions {
  /** 施加一步位移，返回实际位移（用于撞墙时归零对应轴速度） */
  step: (dx: number, dy: number) => [number, number]
  /** 衰减系数，越大停得越快（“滑绢”质感取较小值） */
  friction?: number
  /** 低于该速度(px/s)停止 */
  minV?: number
}

/**
 * 自研惯性引擎：指数衰减积分，零依赖。
 * 接口与 GSAP InertiaPlugin 使用姿势对齐，后续可无缝替换。
 */
export function startInertia(vx: number, vy: number, opts: InertiaOptions): InertiaHandle {
  const k = opts.friction ?? 2.4
  const minV = opts.minV ?? 24
  let x = vx
  let y = vy
  let raf = 0
  let stopped = false
  let last = performance.now()

  const frame = (now: number) => {
    if (stopped) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const decay = Math.exp(-k * dt)
    x *= decay
    y *= decay
    if (Math.hypot(x, y) < minV) return
    const [mx, my] = opts.step(x * dt, y * dt)
    if (mx === 0) x = 0
    if (my === 0) y = 0
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  return {
    stop() {
      if (!stopped) {
        stopped = true
        cancelAnimationFrame(raf)
      }
    },
  }
}
