// 主包仅保留搜索与推荐需要的摘要；完整步骤和食材用量留在 features 分包。
const fs = require('fs')
const path = require('path')
const { BUILTIN_RECIPES, getBuiltinRecipe } = require('../features/data/recipe-details')
const { getRecipeMealRoles } = require('../utils/recipe-roles')

const rows = BUILTIN_RECIPES.map(summary => {
  const recipe = getBuiltinRecipe(summary.id)
  return [
    recipe.id, recipe.name, recipe.mealType, recipe.cuisine,
    recipe.healthTags, recipe.drawPools, recipe.healthEligible ? 1 : 0,
    recipe.energyLevel, recipe.estimatedKcalPerServing, recipe.servings,
    recipe.durationMinutes, recipe.difficulty, recipe.allergens,
    recipe.ingredientKeywords, getRecipeMealRoles(recipe), recipe.sourceCoverCloudPath || '',
    recipe.coverEmoji, recipe.createdAt, recipe.updatedAt,
    recipe.referenceName.startsWith('HowToCook') ? '' : recipe.description
  ]
})
const target = path.resolve(__dirname, '../data/recipe-index.js')
const content = '// 自动生成：node scripts/build-recipe-index.js；不要手工编辑。\nmodule.exports = [\n' + rows.map(row => JSON.stringify(row)).join(',\n') + '\n]\n'
const cloudIndexPath = path.resolve(__dirname, '../cloudfunctions/recipeCommunity/builtin-category-index.js')
const cloudIndex = '// 自动生成的内置菜谱归类索引，不包含步骤或个人资料。\nmodule.exports = ' + JSON.stringify(rows.map(row => [row[0], row[1]])) + '\n'
const sharedCatalogPath = path.resolve(__dirname, '../cloudfunctions/recipeCommunity/recipe-catalog.js')
const sharedCatalog = fs.readFileSync(path.resolve(__dirname, '../utils/recipe-catalog.js'), 'utf8')
const outputs = [[target, content], [cloudIndexPath, cloudIndex], [sharedCatalogPath, sharedCatalog]]
if (process.argv.includes('--check')) {
  if (outputs.some(([filename, expected]) => !fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== expected)) {
    console.error('菜谱摘要已过期，请运行 node scripts/build-recipe-index.js')
    process.exitCode = 1
  } else console.log(`菜谱摘要检查通过：${rows.length} 道，${Buffer.byteLength(content)} 字节`)
} else {
  outputs.forEach(([filename, value]) => fs.writeFileSync(filename, value))
  console.log(`已生成 ${rows.length} 道菜谱摘要：${Buffer.byteLength(content)} 字节`)
}
