/**
 * 数据校验脚本（prebuild 必跑）
 * 1. 所有 relation 的 from/to 存在
 * 2. 无自环、无重复边
 * 3. 每个角色 ≥2 条关系（防孤岛）
 * 4. pos 在 [0,1] 内，且无两点重合 <0.5%
 * 5. 文案长度上限
 * 6. faction/scene 枚举合法
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const J = (p) => JSON.parse(readFileSync(join(root, 'src/data', p), 'utf8'))

const characters = J('characters.json')
const relations = J('relations.json')
const world = J('world.json')

const FACTIONS = new Set(world.factions.map((f) => f.id))
const SCENES = new Set(world.scenes.map((s) => s.id))
const RTYPES = new Set(['kinship', 'trade', 'companion', 'hire', 'crowd', 'conflict'])

let errors = 0
const fail = (msg) => {
  errors++
  console.error(`  ✗ ${msg}`)
}

console.log(`[check-data] ${characters.length} 角色, ${relations.length} 关系边`)

// 角色基础字段
const ids = new Set()
for (const c of characters) {
  if (ids.has(c.id)) fail(`重复 id: ${c.id}`)
  ids.add(c.id)
  for (const f of ['id', 'name', 'title', 'faction', 'scene', 'pos', 'shortBio', 'story', 'settings', 'crop']) {
    if (c[f] === undefined) fail(`${c.id}: 缺字段 ${f}`)
  }
  if (c.pos.x < 0 || c.pos.x > 1 || c.pos.y < 0 || c.pos.y > 1) fail(`${c.id}: pos 越界`)
  if (!FACTIONS.has(c.faction)) fail(`${c.id}: 未知阵营 ${c.faction}`)
  if (!SCENES.has(c.scene)) fail(`${c.id}: 未知场景 ${c.scene}`)
  if (c.shortBio.length > 100) fail(`${c.id}: shortBio 超长 (${c.shortBio.length})`)
  for (const p of c.story) if (p.length > 240) fail(`${c.id}: story 段落超长`)
  if (c.settings.length < 3) fail(`${c.id}: settings 过少`)
}

// 坐标重合（<0.5% 画布宽）
for (let i = 0; i < characters.length; i++) {
  for (let j = i + 1; j < characters.length; j++) {
    const a = characters[i]
    const b = characters[j]
    const dx = Math.abs(a.pos.x - b.pos.x)
    const dy = Math.abs(a.pos.y - b.pos.y)
    if (dx < 0.005 && dy < 0.015) fail(`坐标过近: ${a.id} ≈ ${b.id}`)
  }
}

// 关系边
const seen = new Set()
const degree = new Map()
for (const r of relations) {
  if (!ids.has(r.from) || !ids.has(r.to)) fail(`关系端点不存在: ${r.from} ↔ ${r.to}`)
  if (r.from === r.to) fail(`自环: ${r.from}`)
  const key = [r.from, r.to].sort().join('|') + r.type
  if (seen.has(key)) fail(`重复边: ${key}`)
  seen.add(key)
  if (!RTYPES.has(r.type)) fail(`未知关系类型: ${r.type} (${r.from}↔${r.to})`)
  if (!r.label || !r.note) fail(`关系缺 label/note: ${r.from}↔${r.to}`)
  degree.set(r.from, (degree.get(r.from) ?? 0) + 1)
  degree.set(r.to, (degree.get(r.to) ?? 0) + 1)
}

// 孤岛
for (const id of ids) {
  if ((degree.get(id) ?? 0) < 2) fail(`孤岛/弱连接角色: ${id} (度数 ${degree.get(id) ?? 0})`)
}

if (errors) {
  console.error(`[check-data] FAIL: ${errors} 个问题`)
  process.exit(1)
}
console.log('[check-data] OK')
