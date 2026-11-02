const storage = require('../../utils/storage')
const { invoke } = require('./local-files')
const BUILTIN_IDS = new Set(require('../../data/recipes').BUILTIN_RECIPES.map(recipe => recipe.id))
const MAX_BACKUP_BYTES = 12 * 1024 * 1024
const FORMAT = 'today-eat-personal-backup'
const KEYS = ['schemaVersion', 'introSeen', 'profile', 'weightRecords', 'customRecipes', 'recipeOverrides',
  'favorites', 'pantryIngredients', 'mealPlan', 'shoppingList', 'cookedHistory', 'drawHistory']

function imageFields(state, visit) {
  state.profile.avatarPath = visit(state.profile.avatarPath || '')
  const recipes = state.customRecipes.concat(Object.values(state.recipeOverrides || {}))
  recipes.forEach(recipe => {
    recipe.coverImage = visit(recipe.coverImage || '')
    ;(recipe.steps || []).forEach(step => { step.image = visit(step.image || '') })
  })
}

function utf8Size(text) {
  return unescape(encodeURIComponent(text)).length
}

async function createBackup() {
  if (!storage.flushStateSync()) throw new Error('尚有数据未保存，不能创建备份')
  const state = storage.getState()
  const data = JSON.parse(JSON.stringify(KEYS.reduce((result, key) => { result[key] = state[key]; return result }, {})))
  const files = new Map()
  imageFields(data, file => {
    if (storage.isUserFile(file)) {
      if (!files.has(file)) files.set(file, `img_${files.size}`)
      return 'backup://' + files.get(file)
    }
    return /^(https:\/\/|cloud:\/\/|\/assets\/)/.test(file) ? file : ''
  })
  const images = {}
  let bytes = utf8Size(JSON.stringify(data))
  const fs = wx.getFileSystemManager()
  for (const [filePath, id] of files) {
    const info = await invoke(fs, 'getFileInfo', { filePath })
    if (info.size > 4 * 1024 * 1024 || bytes + Math.ceil(info.size * 4 / 3) > MAX_BACKUP_BYTES - 1024) {
      throw new Error('备份图片过多或过大，超过12MB上限；请先减少本地图片')
    }
    const result = await invoke(fs, 'readFile', { filePath, encoding: 'base64' })
    const match = filePath.match(/\.(jpg|jpeg|png|webp)$/i)
    images[id] = { extension: match ? match[1].toLowerCase() : 'jpg', base64: result.data }
    bytes += result.data.length
  }
  const content = JSON.stringify({ format: FORMAT, version: 1, exportedAt: Date.now(), data, images })
  if (utf8Size(content) > MAX_BACKUP_BYTES) throw new Error('备份超过12MB上限')
  const directory = `${wx.env.USER_DATA_PATH}/recipe_backups`
  try { await invoke(fs, 'mkdir', { dirPath: directory, recursive: true }) } catch (error) {
    try { fs.accessSync(directory) } catch (accessError) { throw new Error('无法创建本地备份目录') }
  }
  const filePath = `${directory}/今日食签-个人备份.json`
  await invoke(fs, 'writeFile', { filePath, data: content, encoding: 'utf8' })
  return filePath
}

function validateBackup(text) {
  if (typeof text !== 'string' || utf8Size(text) > MAX_BACKUP_BYTES) throw new Error('备份为空或超过12MB')
  let backup
  try { backup = JSON.parse(text, (key, value) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('invalid key')
    return value
  }) } catch (error) { throw new Error('不是有效的备份JSON文件') }
  if (!backup || backup.format !== FORMAT || backup.version !== 1) throw new Error('不支持此备份格式或版本')
  const data = backup.data
  const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.length <= 500)
  if (!object(data) || !object(data.profile) || !object(data.recipeOverrides) || !object(data.mealPlan) || !object(backup.images)) throw new Error('备份结构不完整')
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion > storage.SCHEMA_VERSION) throw new Error('请升级小程序后再导入此备份')
  if (!strings(data.profile.allergies) || !strings(data.profile.avoidedIngredients) || !strings(data.profile.healthConditions)) throw new Error('备份偏好字段异常')
  for (const key of ['nickname', 'avatarPath', 'populationType', 'birthDate', 'biologicalSex']) {
    if (typeof data.profile[key] !== 'string' || data.profile[key].length > 1000) throw new Error('备份资料字段异常')
  }
  if (data.profile.heightCm !== null && (!Number.isFinite(data.profile.heightCm) || data.profile.heightCm < 80 || data.profile.heightCm > 250)) throw new Error('备份身高异常')
  for (const key of ['weightRecords', 'customRecipes', 'favorites', 'pantryIngredients', 'shoppingList', 'cookedHistory', 'drawHistory']) {
    if (!Array.isArray(data[key]) || data[key].length > 5000) throw new Error(`备份字段异常：${key}`)
  }
  if (!strings(data.pantryIngredients)) throw new Error('备份食材字段异常')
  if (data.shoppingList.some(item => !object(item) || typeof item.name !== 'string' || typeof item.amount !== 'string') ||
    data.cookedHistory.concat(data.drawHistory).some(item => !object(item) || typeof item.recipeId !== 'string') ||
    data.favorites.some(item => typeof item !== 'string' && (!object(item) || typeof item.recipeId !== 'string'))) throw new Error('备份记录字段异常')
  if (Object.values(data.mealPlan).some(items => !Array.isArray(items) || !items.every(item => typeof item === 'string'))) throw new Error('备份菜单异常')
  if (data.weightRecords.some(item => !object(item) || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
    !Number.isFinite(item.weightKg) || item.weightKg <= 0 || item.weightKg > 300 ||
    Number.isNaN(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date)) throw new Error('备份体重记录异常')
  if (data.customRecipes.some(recipe => !object(recipe) || BUILTIN_IDS.has(recipe.id))) throw new Error('备份个人菜谱与内置ID冲突')
  if (Object.entries(data.recipeOverrides).some(([id, recipe]) => !object(recipe) || recipe.id !== id || !BUILTIN_IDS.has(id))) throw new Error('部分内置修改不属于当前版本，请先更新小程序')
  const ids = new Set()
  data.customRecipes.concat(Object.values(data.recipeOverrides)).forEach(recipe => {
    if (!object(recipe) || typeof recipe.id !== 'string' || !recipe.id || ids.has(recipe.id) ||
      typeof recipe.name !== 'string' || !recipe.name.trim()) throw new Error('备份菜谱名称或ID异常')
    ids.add(recipe.id)
    for (const key of ['ingredients', 'seasonings']) {
      if (!Array.isArray(recipe[key]) || recipe[key].length > 500 || recipe[key].some(item => !object(item) || typeof item.name !== 'string' || typeof item.amount !== 'string')) throw new Error('备份食材异常')
    }
    if (!Array.isArray(recipe.steps) || recipe.steps.length > 500 || recipe.steps.some(step => !object(step) || typeof step.text !== 'string')) throw new Error('备份步骤异常')
    if (!strings(recipe.allergens) || !strings(recipe.healthTags) || !strings(recipe.drawPools)) throw new Error('备份标签异常')
  })
  if (Object.keys(backup.images).length > 512) throw new Error('单个备份的图片不能超过512张')
  for (const [id, image] of Object.entries(backup.images)) {
    if (!/^img_\d+$/.test(id) || !object(image) || !/^(jpg|jpeg|png|webp)$/.test(image.extension) ||
      typeof image.base64 !== 'string' || image.base64.length > 6 * 1024 * 1024 ||
      !image.base64.length || image.base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) throw new Error('备份图片格式异常')
  }
  imageFields(data, value => {
    if (typeof value !== 'string') throw new Error('备份图片路径异常')
    if (value.startsWith('backup://')) {
      if (!backup.images[value.slice(9)]) throw new Error('备份缺少所引用的图片')
    } else if (value && !/^(https:\/\/|cloud:\/\/|\/assets\/)/.test(value)) throw new Error('备份含不可恢复的本地路径')
    return value
  })
  return backup
}

async function restoreBackup(backup) {
  // 即使调用者绕开预览，也重新完整校验，且在写任何图片之前校验完毕。
  backup = validateBackup(JSON.stringify(backup))
  const fs = wx.getFileSystemManager()
  const written = []
  const replacements = {}
  const oldFiles = storage.getReferencedUserFiles()
  try {
    for (const [id, image] of Object.entries(backup.images)) {
      const directory = `${wx.env.USER_DATA_PATH}/recipe_images`
      try { fs.accessSync(directory) } catch (error) { fs.mkdirSync(directory, true) }
      const filePath = `${directory}/${storage.generateId('recipe')}.${image.extension}`
      await invoke(fs, 'writeFile', { filePath, data: image.base64, encoding: 'base64' })
      written.push(filePath)
      replacements[id] = filePath
    }
    imageFields(backup.data, value => value.startsWith('backup://') ? replacements[value.slice(9)] : value)
    const candidate = storage.migrateLocalData(backup.data, { skipLegacy: true })
    storage.commitPersonalChange(current => {
      KEYS.forEach(key => { current[key] = candidate[key] })
      current.editorDrafts = {}
      return current
    }, { recipesChanged: true, cookedChanged: true })
  } catch (error) {
    written.forEach(storage.deleteUnreferencedUserFile)
    throw error
  }
  oldFiles.forEach(storage.deleteUnreferencedUserFile)
}

module.exports = { createBackup, validateBackup, restoreBackup, MAX_BACKUP_BYTES, utf8Size }
