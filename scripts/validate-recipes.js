const {
  BUILTIN_RECIPES,
  MEAL_TYPES,
  CUISINES,
  HEALTH_TAGS,
  DRAW_POOLS,
  ALLERGENS,
  getBuiltinRecipe
} = require('../data/recipes')
const fs = require('fs')
const path = require('path')
const { getBuiltinCartoonCover } = require('../utils/image-service')
const stepImageManifest = require('./step-image-manifest.json')
const sourceCoverManifest = require('./source-cover-manifest.json')

const errors = []
const ids = new Set()
const names = new Set()
const stepImagePaths = new Set()
const sourceCoverPaths = new Set()
const recipesToValidate = BUILTIN_RECIPES.map(recipe => getBuiltinRecipe(recipe.id) || recipe)

recipesToValidate.forEach((recipe) => {
  if (ids.has(recipe.id)) errors.push(`${recipe.id}: ID 重复`)
  ids.add(recipe.id)
  if (names.has(recipe.name)) errors.push(`${recipe.id}: 菜名重复 ${recipe.name}`)
  names.add(recipe.name)
  if (!recipe.name) errors.push(`${recipe.id}: 缺少菜名`)
  if (!MEAL_TYPES.includes(recipe.mealType)) errors.push(`${recipe.id}: 菜品类型无效`)
  if (!CUISINES.includes(recipe.cuisine)) errors.push(`${recipe.id}: 菜系无效`)
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length) errors.push(`${recipe.id}: 缺少食材`)
  if (!Array.isArray(recipe.steps) || !recipe.steps.length) errors.push(`${recipe.id}: 缺少步骤`)
  if (recipe.steps.length < 2) errors.push(`${recipe.id}: 做法步骤少于 2 步，无法构成完整流程`)
  if (!['low', 'medium', 'high', 'unknown'].includes(recipe.energyLevel)) errors.push(`${recipe.id}: 能量等级无效`)
  if (!recipe.referenceName) errors.push(`${recipe.id}: 缺少内容来源说明`)
  const sourceRules = {
    Unlicense: /^https:\/\/github\.com\/Anduin2017\/HowToCook\/blob\//,
    'CC BY-SA 4.0': /^https:\/\/en\.wikibooks\.org\/wiki\/Cookbook:/,
    'CC0-1.0': /^https:\/\/recipecommons\.org\//
  }
  if (!recipe.referenceUrl || !sourceRules[recipe.sourceLicense] || !sourceRules[recipe.sourceLicense].test(recipe.referenceUrl)) {
    errors.push(`${recipe.id}: 缺少与许可匹配的可核验原始做法链接`)
  }
  if (recipe.methodVerified !== true) errors.push(`${recipe.id}: 做法未标记为已核对`)
  const coverPath = getBuiltinCartoonCover(recipe)
  if (!coverPath) errors.push(`${recipe.id}: 缺少卡通封面映射`)
  else if (!fs.existsSync(path.resolve(__dirname, '..', `.${coverPath}`))) errors.push(`${recipe.id}: 封面资源不存在 ${coverPath}`)
  if (recipe.sourceCoverCloudPath) {
    if (recipe.sourceCoverCloudPath !== `recipe-source-covers/${recipe.id}.jpg`) errors.push(`${recipe.id}: 来源封面路径与菜谱不匹配`)
    if (sourceCoverPaths.has(recipe.sourceCoverCloudPath)) errors.push(`${recipe.id}: 来源封面路径重复`)
    sourceCoverPaths.add(recipe.sourceCoverCloudPath)
  }

  recipe.healthTags.forEach((tag) => {
    if (!HEALTH_TAGS.includes(tag)) errors.push(`${recipe.id}: 健康标签无效 ${tag}`)
  })
  recipe.drawPools.forEach((pool) => {
    if (!DRAW_POOLS.includes(pool)) errors.push(`${recipe.id}: 抽取分类无效 ${pool}`)
  })
  recipe.allergens.forEach((allergen) => {
    if (!ALLERGENS.includes(allergen)) errors.push(`${recipe.id}: 过敏原无效 ${allergen}`)
  })
  recipe.steps.forEach((step, index) => {
    if (step.order !== index + 1 || !step.text) errors.push(`${recipe.id}: 步骤 ${index + 1} 无效`)
    if (/按菜品特性|蒸、煮、煎或炒|快速完成|根据食材熟度|原创整理/.test(step.text)) errors.push(`${recipe.id}: 步骤 ${index + 1} 仍包含万能模板话术`)
    ;(step.imageCloudPaths || []).forEach(cloudPath => {
      if (!cloudPath.startsWith(`recipe-steps/${recipe.id}/`)) errors.push(`${recipe.id}: 步骤图路径与菜谱不匹配 ${cloudPath}`)
      if (stepImagePaths.has(cloudPath)) errors.push(`${recipe.id}: 步骤图路径重复 ${cloudPath}`)
      stepImagePaths.add(cloudPath)
    })
  })
  ;(recipe.processImageCloudPaths || []).forEach(cloudPath => {
    if (!cloudPath.startsWith(`recipe-steps/${recipe.id}/`)) errors.push(`${recipe.id}: 参考图路径与菜谱不匹配 ${cloudPath}`)
    if (stepImagePaths.has(cloudPath)) errors.push(`${recipe.id}: 步骤图路径重复 ${cloudPath}`)
    stepImagePaths.add(cloudPath)
  })
  recipe.ingredients.forEach((ingredient) => {
    if (!ingredient.name || !ingredient.amount) errors.push(`${recipe.id}: 食材明细不完整`)
    if (/按来源配方准备|按来源配方量取|与即食食材分开处理，并按步骤彻底加热/.test(ingredient.note || '')) errors.push(`${recipe.id}: 食材仍使用通用处理提示`)
  })
})

if (BUILTIN_RECIPES.length < 300) {
  errors.push(`有来源的内置菜谱不应少于 300 道，实际为 ${BUILTIN_RECIPES.length}`)
}
if (stepImagePaths.size !== stepImageManifest.length) {
  errors.push(`步骤图数据与上传清单数量不一致：数据 ${stepImagePaths.size}，清单 ${stepImageManifest.length}`)
}
stepImageManifest.forEach(item => {
  if (!stepImagePaths.has(item.cloudPath)) errors.push(`步骤图清单存在未引用文件：${item.cloudPath}`)
})
if (sourceCoverPaths.size !== sourceCoverManifest.length) {
  errors.push(`来源封面数据与上传清单数量不一致：数据 ${sourceCoverPaths.size}，清单 ${sourceCoverManifest.length}`)
}
sourceCoverManifest.forEach(item => {
  if (!sourceCoverPaths.has(item.cloudPath)) errors.push(`来源封面清单存在未引用文件：${item.cloudPath}`)
  if (!item.sourceUrl.startsWith('https://media.githubusercontent.com/media/Anduin2017/HowToCook/')) errors.push(`来源封面地址无效：${item.recipeName}`)
})
if (sourceCoverPaths.size < 140) errors.push(`可靠来源成品封面数量过少：${sourceCoverPaths.size}`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}

console.log(`菜谱校验通过：${BUILTIN_RECIPES.length} 道均含来源、许可与具体步骤，${sourceCoverPaths.size} 张成品封面、${stepImagePaths.size} 张步骤图映射有效`)
