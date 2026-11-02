const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const assert = require('assert')
const root = path.resolve(__dirname, '..')

function dependencyGraph(historical) {
  const tracked = historical ? new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n')) : null
  const exists = filename => historical ? tracked.has(filename) : fs.existsSync(path.join(root, filename))
  const read = filename => historical
    ? execFileSync('git', ['show', `HEAD:${filename}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    : fs.readFileSync(path.join(root, filename), 'utf8')
  const app = JSON.parse(read('app.json'))
  const pending = ['app.js'].concat(app.pages.map(page => `${page}.js`))
  const files = new Map()
  while (pending.length) {
    const filename = pending.pop()
    if (files.has(filename)) continue
    const content = read(filename)
    files.set(filename, Buffer.byteLength(content))
    if (filename.endsWith('.json')) continue
    for (const match of content.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!match[1].startsWith('.')) continue
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(filename), match[1]))
      const resolved = [target, `${target}.js`, `${target}.json`, `${target}/index.js`].find(exists)
      assert(resolved, `${filename}: 找不到依赖 ${match[1]}`)
      pending.push(resolved)
    }
  }
  return files
}

const current = dependencyGraph(false)
assert(!Array.from(current.keys()).some(filename => filename.startsWith('features/')), '主包不能同步引用详情分包')
const currentBytes = Array.from(current.values()).reduce((sum, bytes) => sum + bytes, 0)
console.log(`主包 JS 依赖检查通过：${current.size} 个文件，${currentBytes} 字节；未引用详情步骤和营养分包`)
if (process.argv.includes('--compare-head')) {
  const before = Array.from(dependencyGraph(true).values()).reduce((sum, bytes) => sum + bytes, 0)
  console.log(`相对 HEAD：${before} → ${currentBytes} 字节，减少 ${((before - currentBytes) / before * 100).toFixed(1)}%（源码统计，实际包体积以开发者工具为准）`)
}
