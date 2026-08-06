const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const manifest = require('./step-image-manifest.json')
const outputRoot = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'today-eat-step-images'))
const concurrency = Math.max(1, Math.min(12, Number(process.argv[3]) || 6))

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

async function download(item, index) {
  const outputPath = path.join(outputRoot, item.cloudPath)
  const sourcePath = `${outputPath}.source`
  ensureDirectory(outputPath)
  const response = await fetch(item.sourceUrl, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${item.recipeName}: HTTP ${response.status}`)
  fs.writeFileSync(sourcePath, Buffer.from(await response.arrayBuffer()))
  try {
    execFileSync('/usr/bin/sips', [
      '-Z', '1200',
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '75',
      sourcePath,
      '--out', outputPath
    ], { stdio: 'ignore' })
  } finally {
    if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath)
  }
  const size = fs.statSync(outputPath).size
  if (size < 1000) throw new Error(`${item.recipeName}: 转换后的图片异常 ${size} bytes`)
  process.stdout.write(`\r步骤图 ${index + 1}/${manifest.length}`)
}

async function main() {
  let cursor = 0
  async function worker() {
    while (cursor < manifest.length) {
      const index = cursor
      cursor += 1
      await download(manifest[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, manifest.length) }, worker))
  process.stdout.write('\n')
  const files = manifest.map(item => path.join(outputRoot, item.cloudPath))
  const bytes = files.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0)
  console.log(`下载并压缩完成：${files.length} 张，${(bytes / 1024 / 1024).toFixed(1)} MB，目录 ${outputRoot}`)
}

main().catch(error => {
  console.error(`\n步骤图处理失败：${error.message}`)
  process.exit(1)
})
