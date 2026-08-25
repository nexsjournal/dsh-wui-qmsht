/** 五大阵营 */
export type FactionId = 'cangang' | 'shijin' | 'guanhuan' | 'chengmen' | 'jiaoye'

/** 图谱四大场景簇（按实图四区：汴河水路/虹桥/桥头市集/南岸巷陌） */
export type SceneId = 'bianhe' | 'hongqiao' | 'qiaotou' | 'nanan'

export type RelationType = 'kinship' | 'trade' | 'companion' | 'hire' | 'crowd' | 'conflict'

export interface Faction {
  id: FactionId
  name: string
  color: string
  desc: string
}

export interface Character {
  id: string
  /** 名号 */
  name: string
  /** 职衔 */
  title: string
  faction: FactionId
  scene: SceneId
  /** 归一化坐标（相对 4206×1733，x 自左→右、y 自上→下） */
  pos: { x: number; y: number }
  /** 小传（3~5 行） */
  shortBio: string
  /** 背景故事段落（2~4 段） */
  story: string[]
  /** 设定键值 */
  settings: [string, string][]
  /** 立绘（WebP），缺省则用原图局部放大兜底 */
  portrait?: string
  /** 背景裁剪范围（相对 pos，原图像素） */
  crop: { w: number; h: number }
}

export interface Relation {
  from: string
  to: string
  type: RelationType
  /** 关系标签，如「同船」「雇佣」 */
  label: string
  /** 推演依据（图谱 hover 与详情共用） */
  note: string
}

export interface Landmark {
  id: string
  name: string
  pos: { x: number; y: number }
  hint: string
}

export const RELATION_TYPE_META: Record<RelationType, { name: string; color: string }> = {
  kinship: { name: '亲眷', color: '#B03A2E' },
  trade: { name: '交易', color: '#8C5B3F' },
  companion: { name: '同行', color: '#3E5C63' },
  hire: { name: '雇佣', color: '#5C6B4F' },
  crowd: { name: '围观', color: '#6B6257' },
  conflict: { name: '对抗', color: '#7A2E24' },
}
