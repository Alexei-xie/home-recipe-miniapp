const storage = require('../../utils/storage')
const { getBuiltinRecipe } = require('../data/recipe-details')

function getRecipe(id) {
  const recipe = storage.getRecipe(id)
  if (!recipe || recipe.source !== 'builtin') return recipe
  const full = getBuiltinRecipe(id)
  if (recipe.isLocalOverride && full) {
    const restored = Object.assign({}, recipe)
    // 旧版本的本地修改曾丢弃来源等字段。只恢复可确定属于该内置ID的信息。
    ;['referenceName', 'referenceUrl', 'referenceRevisionUrl', 'sourceLicense', 'sourceLicenseUrl'].forEach(key => {
      if (!restored[key]) restored[key] = full[key] || ''
    })
    if (!restored.sourceCoverCloudPath) restored.sourceCoverCloudPath = full.sourceCoverCloudPath || ''
    restored.steps = (recipe.steps || []).map(step => {
      const original = full.steps.find(item => item.id === step.id && item.text === step.text)
      return original && !(step.imageCloudPaths || []).length
        ? Object.assign({}, step, { imageCloudPaths: original.imageCloudPaths || [] }) : step
    })
    restored.ingredients = (recipe.ingredients || []).map(item => {
      const original = full.ingredients.find(source => source.name === item.name && source.amount === item.amount)
      return original && !item.note ? Object.assign({}, original, item, { note: original.note, noteKind: original.noteKind }) : item
    })
    return restored
  }
  return full ? Object.assign({}, full, {
    cuisine: recipe.cuisine, mealType: recipe.mealType,
    canonicalMealType: recipe.canonicalMealType || recipe.mealType, updatedAt: recipe.updatedAt
  }) : recipe
}

module.exports = { getRecipe }
