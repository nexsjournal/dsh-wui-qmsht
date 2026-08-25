/** 把数据 JSON 复制到 public/data/，供 public/calibrate.html 标定页使用 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public', 'data')
mkdirSync(dest, { recursive: true })
for (const f of ['characters.json', 'relations.json', 'world.json']) {
  copyFileSync(join(root, 'src', 'data', f), join(dest, f))
}
console.log('[sync-calibrate] public/data/ 已同步')
