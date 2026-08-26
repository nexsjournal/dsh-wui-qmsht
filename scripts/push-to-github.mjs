/**
 * 通过 GitHub API 推送当前提交（绕过 github.com 主域阻断，走 api.github.com）
 * 用法: node scripts/push-to-github.mjs [commit 消息]
 * 要求: gh 已登录；工作区已 git commit；远程仓库已存在
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const token = execSync('gh auth token').toString().trim()
const repo = 'nexsjournal/dsh-wui-qmsht'
const commitMessage = process.argv[2] || '清明上河图·众生图鉴 H5 更新（API 推送）'
const BASE = `https://api.github.com/repos/${repo}`
const HEADERS = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github+json',
  'User-Agent': 'qmsht-push',
}

async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS, ...opts })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// 当前提交
const head = execSync('git rev-parse HEAD').toString().trim()
const files = execSync('git ls-tree -r --name-only -z HEAD').toString().split('\0').filter(Boolean)
console.log(`推送 ${files.length} 个文件 (commit ${head.slice(0, 8)})`)

// 1) 逐文件建 blob（POST JSON base64；本仓库单文件均 <5MB，安全）
const blobSha = {}
let done = 0
for (const f of files) {
  const buf = readFileSync(f)
  const body = JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' })
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${BASE}/git/blobs`, { method: 'POST', headers: HEADERS, body })
    if (res.ok) {
      blobSha[f] = (await res.json()).sha
      break
    }
    lastErr = `${res.status} ${(await res.text()).slice(0, 120)}`
    if (res.status >= 500 || res.status === 429) await new Promise((r) => setTimeout(r, 2000 * attempt))
    else break // 4xx 不重试
  }
  if (!blobSha[f]) throw new Error(`blob 失败 ${f}: ${lastErr}`)
  if (++done % 10 === 0) console.log(`  blobs ${done}/${files.length}`)
}
console.log('blobs 全部创建完成')

// 2) 自底向上建 tree
function group(paths) {
  const dirs = new Map()
  const blobs = []
  for (const p of paths) {
    const i = p.indexOf('/')
    if (i === -1) blobs.push(p)
    else {
      const d = p.slice(0, i)
      if (!dirs.has(d)) dirs.set(d, [])
      dirs.get(d).push(p.slice(i + 1))
    }
  }
  return { blobs, dirs }
}
async function createTree(paths, prefix = '') {
  const { blobs, dirs } = group(paths)
  const entries = blobs.map((f) => ({ path: f, type: 'blob', mode: '100644', sha: blobSha[prefix + f] }))
  for (const [d, sub] of dirs) {
    entries.push({ path: d, type: 'tree', mode: '040000', sha: await createTree(sub, prefix + d + '/') })
  }
  const missing = entries
    .filter((e) => e.type === 'blob' && !e.sha)
    .map((e) => prefix + e.path)
  if (missing.length) throw new Error('blob 缺失: ' + missing.join(', '))
  const body = JSON.stringify({ tree: entries })
  try {
    const t = await api('/git/trees', { method: 'POST', body })
    return t.sha
  } catch (e) {
    console.error('TREE FAIL payload:', body.slice(0, 400))
    throw e
  }
}
const treeSha = await createTree(files)
console.log('tree 完成:', treeSha.slice(0, 8))

// 3) 建 commit + 写 ref（main 已存在则带 parent 更新）
const refRes = await fetch(`${BASE}/git/ref/heads/main`, { headers: HEADERS })
const parent = refRes.ok ? (await refRes.json()).object.sha : null
const commit = await api('/git/commits', {
  method: 'POST',
  body: JSON.stringify({
    message: commitMessage,
    tree: treeSha,
    ...(parent ? { parents: [parent] } : {}),
  }),
})
const refPath = '/git/refs/heads/main'
let refOk = false
for (const method of ['POST', 'PATCH']) {
  const res = await fetch(`${BASE}${refPath}`, {
    method,
    headers: HEADERS,
    body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha, force: true }),
  })
  if (res.ok) {
    refOk = true
    break
  }
}
if (!refOk) throw new Error('ref 更新失败')
console.log('✅ main 已推送:', commit.sha.slice(0, 8))
