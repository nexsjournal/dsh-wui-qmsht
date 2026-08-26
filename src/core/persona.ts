import { relationsOf, type Character, type FactionId } from '@/data'

/**
 * 角色对话引擎：
 * - 本地模式：基于角色数据（小传/设定/故事/关系）生成第一人称回答，零依赖、离线可用
 * - AI 模式：buildSystemPrompt 供 LLM 扮演角色（用户自带 OpenAI 兼容 endpoint）
 */

export const PERSONA_QUESTIONS: string[] = [
  '今日做了些什么？',
  '说说你的营生',
  '你与谁交好？',
  '河上那条大船，你瞧见没？',
  '今日心里惦记什么？',
  '送我一句话',
]

const SCENE_LINES: Record<string, string> = {
  bianhe: '头一声橹号响了，船候缆，正待离泊。',
  hongqiao: '桥面上挤得满满，牛车占着道中，人车都在挪。',
  qiaotou: '郊外的骡队牛车都进了城，街市上早挤开了。',
  nanan: '轿子过了巷子，茶肆开了门，说书人正说到紧要处。',
}

const SCENE_BOAT: Record<string, string> = {
  bianhe: '瞧见了。桅放倒了，顺流走，离虹桥不到一里，橹声越催越急。',
  hongqiao: '我就在桥上。船还没到，桥面先挤了——人车奔逃，骂声一片。',
  qiaotou: '船没瞧见，橹声先听见了。橹声催得急，桥头的人早站起来了。',
  nanan: '船没瞧见，桥头酒肆先嚷起来了。酒洒了一地，都在看河。',
}

function kv(c: Character, key: string): string {
  const hit = c.settings.find(([k]) => k === key)
  return hit ? hit[1] : ''
}

function pick<T>(arr: T[], variant: number): T {
  return arr[Math.abs(variant) % arr.length]
}

/** 开场白（本地模式） */
export function localGreeting(c: Character, variant = 0): string {
  const opener = pick(
    [
      '你要问话？坐，慢慢说。',
      '别急，今日不赶时辰。',
      '来，先坐。',
    ],
    variant,
  )
  const skill = kv(c, '擅长')
  const quirk = kv(c, '口癖')
  return `${opener}我是${c.name}，${c.title}，${kv(c, '籍贯')}人，靠${kv(c, '营生')}过日子。${
    skill ? `别的不会，${skill}。` : ''
  }${quirk ? `要说什么，先记着——${quirk}` : ''}`
}

/** 本地模式：按问题生成回答 */
export function localAnswer(c: Character, q: string, variant: number): string {
  const quirk = kv(c, '口癖')
  const rels = relationsOf(c.id)
  const conflict = rels.find((r) => r.relation.type === 'conflict')

  if (q.includes('做了些') || q.includes('今日')) {
    const a = `这一日啊，${SCENE_LINES[c.scene] ?? ''}我这营生，${kv(c, '营生')}，做了这些年。`
    const b = `${c.shortBio}——你问今日？也就这些。`
    return pick([a, b], variant)
  }
  if (q.includes('营生') || q.includes('做营生')) {
    const a = `${kv(c, '籍贯')}人，靠${kv(c, '营生')}吃饭，手里最熟的是${kv(c, '擅长')}。${c.story[0]}`
    const b = `营生？${kv(c, '营生')}。${c.story[0] ?? ''}${quirk ? `老话讲，${quirk}` : ''}`
    return pick([a, b], variant)
  }
  if (q.includes('交好') || q.includes('熟人') || q.includes('谁')) {
    if (rels.length < 2) return '生人，别问这些。'
    const a = `${rels[0].other.name}和${rels[1].other.name}我最熟。${rels[0].relation.label}——${rels[0].relation.note}`
    const b = `打交道的人嘛，${rels
      .slice(0, 3)
      .map((r) => `${r.other.name}（${r.relation.label}）`)
      .join('、')}。要说最要紧的，${rels[0].relation.note}`
    return pick([a, b], variant)
  }
  if (q.includes('大船') || q.includes('桥')) {
    const a = `${SCENE_BOAT[c.scene] ?? ''}${
      conflict ? `心里发怵的是${conflict.other.name}——${conflict.relation.note}` : ''
    }`
    const b = `${SCENE_BOAT[c.scene] ?? ''}${quirk ? `所以我说，${quirk}` : ''}`
    return pick([a, b], variant)
  }
  if (q.includes('惦记') || q.includes('怕') || q.includes('愁')) {
    const a = conflict
      ? `惦记？${conflict.other.name}那档子事——${conflict.relation.note}`
      : `惦记？我生性「${kv(c, '性格')}」。${c.story[1] ?? c.story[0]}`
    const b = `${quirk ? `${quirk}。` : ''}今日的水，今日的船，今日的事今日了。`
    return pick([a, b], variant)
  }
  if (q.includes('送我')) {
    const a = quirk ? `记住这句：${quirk}` : `记住，${kv(c, '擅长')}不是做得快，是做得稳。`
    const b = `${c.story[c.story.length - 1]}——带走吧。`
    return pick([a, b], variant)
  }
  // 兜底：自由输入
  const a = `你这话新。${c.shortBio}${quirk ? `一句话送你——${quirk}` : ''}`
  const b = `嗯，你说。${SCENE_LINES[c.scene] ?? ''}我这边的事，也就这样。`
  return pick([a, b], variant)
}

const FACTION_NAMES: Record<FactionId, string> = {
  cangang: '汴河水手',
  shijin: '桥头市井',
  guanhuan: '官宦士人',
  chengmen: '城尉司察',
  jiaoye: '官道往来',
}

/** AI 模式：角色扮演 system prompt */
export function buildSystemPrompt(c: Character): string {
  const rels = relationsOf(c.id)
  const lines = [
    `你是北宋都城汴京里的人，也是《清明上河图》长卷中的一个人物。`,
    `姓名：${c.name}；职衔：${c.title}；所属：${FACTION_NAMES[c.faction]}。`,
    `人物设定：`,
    ...c.settings.map(([k, v]) => `${k}：${v}`),
    `小传：${c.shortBio}`,
    `背景故事：`,
    ...c.story,
    `与他人的关系：`,
    ...rels.map((r) => `${r.other.name}（${r.other.title}）— ${r.relation.label}：${r.relation.note}`),
    ``,
    `世界观：北宋仁宗后期，清明当日。虹桥横跨汴河，一条大粮船放倒桅杆顺流而来、眼看要撞桥；桥上人车奔逃，桥头市集慌乱，南岸巷陌如常。`,
    `要求：`,
    `1. 始终以第一人称回答，扮演本角色，绝不承认自己是 AI 或语言模型。`,
    `2. 用宋代市井口吻，平实晓畅；不用现代词汇，不谈宋代以后的史事。`,
    `3. 回答不超过 80 字；问到他人，只说设定中已知的事，不知道的就说不知道。`,
    `4. 若设定中有口癖，回答中自然地带出来。`,
  ]
  return lines.join('\n')
}

