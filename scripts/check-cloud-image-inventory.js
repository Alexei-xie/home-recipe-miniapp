/*
 * 校验当前代码实际引用的 CloudBase 图片路径。
 *
 * 仅校验代码与上传清单：
 *   node scripts/check-cloud-image-inventory.js
 *
 * 同时核对从 CloudBase 控制台或 CLI 导出的文件清单：
 *   node scripts/check-cloud-image-inventory.js --inventory /path/to/storage-files.json
 *
 * inventory 支持字符串数组、{ files: [] }、包含 Key/cloudPath/fileID 的对象数组，
 * 以及每行一个云端路径的纯文本文件。
 */
const fs = require('fs')
const path = require('path')
const { BUILTIN_RECIPES } = require('../data/recipes')
const sourceCoverManifest = require('./source-cover-manifest.json')
const stepImageManifest = require('./step-image-manifest.json')

function normalizeCloudPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withoutFileId = raw.startsWith('cloud://')
    ? raw.slice(raw.indexOf('/', 'cloud://'.length) + 1)
    : raw
  return withoutFileId.replace(/^\/+/, '')
}

function getExpectedReferences() {
  const references = []
  BUILTIN_RECIPES.forEach(recipe => {
    if (recipe.sourceCoverCloudPath) {
      references.push({ recipeId: recipe.id, type: 'cover', cloudPath: recipe.sourceCoverCloudPath })
    } else if (/^r\d{3}$/.test(recipe.id)) {
      references.push({ recipeId: recipe.id, type: 'cover', cloudPath: `recipe-covers/${recipe.id}.png` })
    }
    ;(recipe.steps || []).forEach(step => {
      ;(step.imageCloudPaths || []).forEach(cloudPath => {
        references.push({ recipeId: recipe.id, type: 'step', cloudPath })
      })
    })
    ;(recipe.processImageCloudPaths || []).forEach(cloudPath => {
      references.push({ recipeId: recipe.id, type: 'step', cloudPath })
    })
  })
  return references
}

function parseInventory(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (error) {
    return content.split(/\r?\n/).map(normalizeCloudPath).filter(Boolean)
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed.files || parsed.data || [])
  return rows.map(item => {
    if (typeof item === 'string') return normalizeCloudPath(item)
    return normalizeCloudPath(item.Key || item.key || item.cloudPath || item.fileID || item.fileId)
  }).filter(Boolean)
}

function fail(messages) {
  console.error(messages.join('\n'))
  process.exit(1)
}

const errors = []
const expected = getExpectedReferences()
const expectedPaths = new Set()
expected.forEach(item => {
  if (!/^(recipe-covers\/[^/]+\.png|recipe-source-covers\/[^/]+\.jpg|recipe-steps\/[^/]+\/[^/]+\.jpg)$/.test(item.cloudPath)) {
    errors.push(`${item.recipeId}: 云端图片路径格式无效 ${item.cloudPath}`)
  }
  if (expectedPaths.has(item.cloudPath)) errors.push(`${item.recipeId}: 云端图片路径重复 ${item.cloudPath}`)
  expectedPaths.add(item.cloudPath)
})

const sourceManifestPaths = new Set(sourceCoverManifest.map(item => item.cloudPath))
const stepManifestPaths = new Set(stepImageManifest.map(item => item.cloudPath))
BUILTIN_RECIPES.forEach(recipe => {
  if (recipe.sourceCoverCloudPath && !sourceManifestPaths.has(recipe.sourceCoverCloudPath)) {
    errors.push(`${recipe.id}: 来源封面未进入上传清单 ${recipe.sourceCoverCloudPath}`)
  }
  ;(recipe.steps || []).forEach(step => {
    ;(step.imageCloudPaths || []).forEach(cloudPath => {
      if (!stepManifestPaths.has(cloudPath)) errors.push(`${recipe.id}: 步骤图未进入上传清单 ${cloudPath}`)
    })
  })
  ;(recipe.processImageCloudPaths || []).forEach(cloudPath => {
    if (!stepManifestPaths.has(cloudPath)) errors.push(`${recipe.id}: 过程图未进入上传清单 ${cloudPath}`)
  })
})

if (errors.length) fail(errors)

const inventoryFlagIndex = process.argv.indexOf('--inventory')
if (inventoryFlagIndex >= 0) {
  const inventoryArg = process.argv[inventoryFlagIndex + 1]
  if (!inventoryArg) fail(['--inventory 后必须提供文件路径'])
  const inventoryPath = path.resolve(inventoryArg)
  if (!fs.existsSync(inventoryPath)) fail([`云存储清单不存在：${inventoryPath}`])
  const actualPaths = new Set(parseInventory(inventoryPath))
  const missing = expected.filter(item => !actualPaths.has(item.cloudPath))
  if (missing.length) {
    fail([
      `云存储缺少 ${missing.length} 个当前代码引用的图片：`,
      ...missing.map(item => `${item.recipeId}\t${item.type}\t${item.cloudPath}`)
    ])
  }
  console.log(`云存储图片核对通过：${expectedPaths.size} 个引用均存在`)
} else {
  console.log(`图片引用校验通过：共 ${expectedPaths.size} 个云端文件引用；使用 --inventory 可继续核对云存储实物`)
}
