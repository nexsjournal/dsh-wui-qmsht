/** 低端机探测：禁用高清档 + 惯性缩短 */
export function detectLowEnd(): boolean {
  const nav = navigator as unknown as { deviceMemory?: number }
  const mem = nav.deviceMemory
  const cpu = navigator.hardwareConcurrency ?? 8
  return (mem !== undefined && mem < 4) || cpu <= 4
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
