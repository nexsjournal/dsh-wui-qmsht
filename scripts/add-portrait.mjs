/** 立绘接入：node scripts/add-portrait.mjs "luo-fu=imagegen/xxx.png" ... */
import sharp from 'sharp'
import { mkdirSync, statSync } from 'node:fs'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'public/media/portraits'), { recursive: true })

const dataPath = join(root, 'src/data/characters.json')
const chars = JSON.parse(readFileSync(dataPath, 'utf8'))

let wired = 0
for (const arg of process.argv.slice(2)) {
  const [id, src] = arg.split('=')
  if (!id || !src) {
    console.error('格式: id=imagegen/xxx.png', arg)
    continue
  }
  const from = join(root, src)
  const to = join(root, `public/media/portraits/${id}.webp`)
  await sharp(from).resize(768, 1024, { fit: 'cover' }).webp({ quality: 80 }).toFile(to)
  const c = chars.find((x) => x.id === id)
  if (!c) {
    console.error('未找到角色:', id)
    continue
  }
  c.portrait = `/media/portraits/${id}.webp`
  console.log(id, (statSync(to).size / 1024).toFixed(0) + 'KB')
  wired++
}
writeFileSync(dataPath, JSON.stringify(chars, null, 2) + '\n')
console.log(`wired ${wired}`)
