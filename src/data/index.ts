import type { Character, Faction, Landmark, Poem, Relation } from './types'
import charactersJson from './characters.json'
import relationsJson from './relations.json'
import worldJson from './world.json'

export * from './types'

export const characters = charactersJson as unknown as Character[]
export const relations = relationsJson as unknown as Relation[]

/** 剧情任务线（「一船之故」）单章 */
export interface QuestStage {
  id: string
  title: string
  /** 开场白 */
  intro: string
  /** 本章要找的角色 */
  target: string
  /** 完成后解锁的关系边 */
  edge: [string, string]
  /** 揭晓文案 */
  reveal: string
}
/** 导览停点（「汴京一日」自动巡览脚本） */
export interface TourStop {
  time: string
  title: string
  scene: string
  text: string
  target: { x: number; y: number }
  /** 相对 scaleBase 的 z */
  zoom: number
  /** 停留秒数 */
  dwell: number
}
export interface WorldData {
  factions: Faction[]
  /** xRange：场景在长卷 x 轴的分区（0~1），供进度条分段/环境音交叉淡化 */
  scenes: { id: string; name: string; range: string; desc: string; xRange: [number, number] }[]
  landmarks: Landmark[]
  timeline: { time: string; event: string; scene: string }[]
  glossary: { term: string; def: string }[]
  chapters: { title: string; paras: string[]; timeline?: boolean; glossary?: boolean }[]
  tour: TourStop[]
  /** 灯笼位（昼夜系统，归一化坐标） */
  lanterns: { x: number; y: number }[]
  /** 剧情任务线（「一船之故」） */
  quest: QuestStage[]
  /** 清明诗韵：诗词与画中人的呼应 */
  poems: Poem[]
}
export const world = worldJson as unknown as WorldData

/** id → 角色 */
export const charById = new Map<string, Character>(characters.map((c) => [c.id, c]))

/** 角色 id → 关系（含双向） */
export const relationsOf = (id: string) =>
  relations
    .filter((r) => r.from === id || r.to === id)
    .map((r) => {
      const otherId = r.from === id ? r.to : r.from
      const outbound = r.from === id
      return { relation: r, outbound, other: charById.get(otherId)! }
    })
    .filter((x) => x.other)

export const factionById = new Map<string, Faction>(world.factions.map((f) => [f.id, f]))
