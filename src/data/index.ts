import type { Character, Faction, Landmark, Relation } from './types'
import charactersJson from './characters.json'
import relationsJson from './relations.json'
import worldJson from './world.json'

export * from './types'

export const characters = charactersJson as unknown as Character[]
export const relations = relationsJson as unknown as Relation[]

export interface WorldData {
  factions: Faction[]
  scenes: { id: string; name: string; range: string; desc: string }[]
  landmarks: Landmark[]
  timeline: { time: string; event: string; scene: string }[]
  glossary: { term: string; def: string }[]
  chapters: { title: string; paras: string[]; timeline?: boolean; glossary?: boolean }[]
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
