/**
 * 四区环境音引擎：Web Audio 实时合成，零音频资产。
 * - 汴河水路：低频水声（棕色噪声 + 慢速 LFO 波浪起伏）
 * - 桥头市集：远处市声（带通噪声 + 慢幅值波动）
 * - 虹桥：橹声节奏（周期噪声脉冲）+ 水声底
 * - 南岸巷陌：极轻风声（高通噪声）
 * 按相机中心 x 对四区增益交叉淡化；BGM 播放时整体 duck 0.45。
 * 注意：AudioContext 必须在用户手势后创建（浏览器自动播放策略）。
 */

const FADE = 0.35
const MASTER_VOL = 0.16
const DUCK = 0.45

interface Zone {
  gain: GainNode
  /** 同区叠加的其他增益（如虹桥水声底） */
  mix?: GainNode[]
  /** 区域增益基线（合成响度，交叉淡化前） */
  base: number
  range: [number, number]
}

export class AmbientEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private zones: Zone[] = []
  private started = false
  private enabled = false
  private duck = false
  private lastX = -1
  private lastT = 0

  constructor(private ranges: [number, number][]) {}

  /** 用户手势后调用（幂等）：建 AudioContext 与合成图 */
  start() {
    if (this.started) return
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = this.enabled ? MASTER_VOL : 0
      master.connect(ctx.destination)
      this.ctx = ctx
      this.master = master

      const brown = makeNoiseBuffer(ctx, 3, true)
      const white = makeNoiseBuffer(ctx, 2, false)

      // 汴河水路：水声
      const water = zoneOf(ctx, master, brown, { type: 'lowpass', freq: 260, q: 0.7 }, 0.5)
      lfo(ctx, water.mod, 0.11, 0.22)
      // 桥头市集：人声嘈杂
      const crowd = zoneOf(ctx, master, white, { type: 'bandpass', freq: 520, q: 0.9 }, 0.14)
      lfo(ctx, crowd.mod, 0.23, 0.06)
      // 虹桥：橹声脉冲（周期噪声）+ 水声底
      const oar = zoneOf(ctx, master, white, { type: 'lowpass', freq: 110, q: 1.2 }, 0.1)
      lfo(ctx, oar.mod, 0.72, 0.09)
      // 南岸巷陌：风声
      const wind = zoneOf(ctx, master, white, { type: 'highpass', freq: 1400, q: 0.5 }, 0.05)
      lfo(ctx, wind.mod, 0.07, 0.03)

      this.zones = [
        { gain: water.gain, base: water.modBase, range: this.ranges[0] ?? [0, 0.25] },
        { gain: crowd.gain, base: crowd.modBase, range: this.ranges[1] ?? [0.25, 0.5] },
        { gain: oar.gain, base: oar.modBase, range: this.ranges[2] ?? [0.5, 0.75] },
        { gain: wind.gain, base: wind.modBase, range: this.ranges[3] ?? [0.75, 1] },
      ]
      // 水声底与橹声同区（共享虹桥权重）：两路增益相加
      const bridgeWater = zoneOf(ctx, master, brown, { type: 'lowpass', freq: 200, q: 0.7 }, 0.26)
      lfo(ctx, bridgeWater.mod, 0.13, 0.1)
      this.zones[2].mix = [this.zones[2].gain, bridgeWater.gain]

      this.started = true
      if (ctx.state === 'suspended') void ctx.resume()
      this.applyX(this.lastX, true)
    } catch {
      /* Web Audio 不可用时静默降级 */
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? MASTER_VOL : 0, this.ctx.currentTime, 0.2)
      if (on && this.ctx.state === 'suspended') void this.ctx.resume()
    }
  }

  /** 由渲染循环节流调用：centerX 归一化相机中心，duck=BGM 是否播放 */
  update(centerX: number, duck: boolean, now: number) {
    if (!this.started || !this.enabled) return
    if (now - this.lastT < 150 && centerX === this.lastX && duck === this.duck) return
    this.lastT = now
    this.applyX(centerX, duck !== this.duck)
    this.duck = duck
    this.lastX = centerX
  }

  private applyX(centerX: number, force = false) {
    if (!this.ctx) return
    if (!force && Math.abs(centerX - this.lastX) < 0.004) return
    const ducked = this.duck ? DUCK : 1
    for (const z of this.zones) {
      const w = weightOf(centerX, z.range) * z.base * ducked
      for (const g of [z.gain, ...(z.mix ?? [])]) {
        g.gain.setTargetAtTime(w, this.ctx.currentTime, FADE)
      }
    }
  }

  dispose() {
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.started = false
  }
}

/** 区域权重：区内为 1，向两侧 8% 画布宽线性衰减 */
function weightOf(x: number, [a, b]: [number, number]): number {
  if (x >= a && x <= b) return 1
  const d = x < a ? a - x : x - b
  return Math.max(0, 1 - d / 0.08)
}

interface FilterOpts {
  type: BiquadFilterType
  freq: number
  q: number
}

/** 噪声源 → 滤波 → 增益（挂 master），返回可调增益节点 */
function zoneOf(
  ctx: AudioContext,
  master: GainNode,
  buf: AudioBuffer,
  f: FilterOpts,
  modBase: number,
): { gain: GainNode; mod: GainNode; modBase: number } {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = f.type
  filter.frequency.value = f.freq
  filter.Q.value = f.q
  const mod = ctx.createGain()
  mod.gain.value = modBase
  const out = ctx.createGain()
  out.gain.value = 0
  src.connect(filter).connect(mod).connect(out).connect(master)
  src.start()
  return { gain: out, mod, modBase }
}

/** 正弦 LFO 调制增益（depth 为 ±幅度） */
function lfo(ctx: AudioContext, target: GainNode, hz: number, depth: number) {
  const osc = ctx.createOscillator()
  osc.frequency.value = hz
  const g = ctx.createGain()
  g.gain.value = depth
  osc.connect(g).connect(target.gain)
  osc.start()
}

/** 循环噪声 buffer：brown（水声感）/ white */
function makeNoiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let lastOut = 0
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1
    if (brown) {
      lastOut = (lastOut + 0.02 * white) / 1.02
      d[i] = lastOut * 3.5
    } else {
      d[i] = white * 0.6
    }
  }
  return buf
}
