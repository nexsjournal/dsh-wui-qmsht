import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { characters, relations } from '@/data'
import type { Character, Relation, SceneId } from '@/data'

export interface GNode extends SimulationNodeDatum {
  id: string
  char: Character
  deg: number
  r: number
  /** 最终坐标（布局完成后冻结） */
  fx2?: number
  fy2?: number
}

export interface GLink extends SimulationLinkDatum<GNode> {
  rel: Relation
}

/** 图谱逻辑画布尺寸 */
export const GRAPH_W = 2400
export const GRAPH_H = 1400

/** 四大场景簇心（图谱空间） */
export const SCENE_CENTERS: Record<SceneId, { x: number; y: number }> = {
  bianhe: { x: 520, y: 380 },
  hongqiao: { x: 1420, y: 400 },
  qiaotou: { x: 560, y: 1040 },
  nanan: { x: 1650, y: 1000 },
}

export interface GraphLayout {
  nodes: GNode[]
  links: GLink[]
  /** 冻结布局；对某节点局部松弛（拖拽后调用） */
  relax(node: GNode, ticks?: number): void
  sim: Simulation<GNode, GLink>
}

/**
 * 力导向布局：160 tick 后冻结（零运行时开销）。
 * 场景簇力保证可读性：桥头/市井/城门/郊野四象限。
 */
export function layoutGraph(): GraphLayout {
  const degree = new Map<string, number>()
  for (const r of relations) {
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1)
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1)
  }
  const nodes: GNode[] = characters.map((c) => {
    const deg = degree.get(c.id) ?? 0
    return {
      id: c.id,
      char: c,
      deg,
      r: Math.min(44, 26 + deg * 3),
      x: SCENE_CENTERS[c.scene].x + (Math.random() - 0.5) * 300,
      y: SCENE_CENTERS[c.scene].y + (Math.random() - 0.5) * 300,
    }
  })
  const links: GLink[] = relations.map((rel) => ({ source: rel.from, target: rel.to, rel }))

  const sim = forceSimulation<GNode>(nodes)
    .force(
      'link',
      forceLink<GNode, GLink>(links)
        .id((d) => d.id)
        .distance((l) => (l.rel.type === 'kinship' || l.rel.type === 'hire' ? 95 : 150))
        .strength(0.5),
    )
    .force('charge', forceManyBody().strength(-340))
    .force('center', forceCenter(GRAPH_W / 2, GRAPH_H / 2).strength(0.02))
    .force('sx', forceX<GNode>((d) => SCENE_CENTERS[d.char.scene].x).strength(0.055))
    .force('sy', forceY<GNode>((d) => SCENE_CENTERS[d.char.scene].y).strength(0.055))
    .force('collide', forceCollide<GNode>((d) => d.r + 14).strength(0.9))
    .stop()

  for (let i = 0; i < 160; i++) sim.tick()

  // 冻结
  for (const n of nodes) {
    n.fx2 = n.x
    n.fy2 = n.y
  }

  function relax(node: GNode, ticks = 30) {
    node.fx = node.x
    node.fy = node.y
    sim.alpha(0.4)
    for (let i = 0; i < ticks; i++) sim.tick()
    node.fx = undefined
    node.fy = undefined
    for (const n of nodes) {
      n.x = n.fx2 = n.x
      n.y = n.fy2 = n.y
    }
  }

  return { nodes, links, relax, sim }
}
