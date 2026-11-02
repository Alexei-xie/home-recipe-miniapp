const rows = require('./recipe-index')
const constants = require('./recipe-constants')

const BUILTIN_RECIPES = rows.map(row => {
  const [id, name, mealType, cuisine, healthTags, drawPools, eligible, energyLevel,
    estimatedKcalPerServing, servings, durationMinutes, difficulty, allergens,
    ingredientKeywords, mealRoles, sourceCoverCloudPath, coverEmoji, createdAt, updatedAt, description] = row
  return {
    id, source: 'builtin', name, mealType, cuisine, healthTags, drawPools,
    healthEligible: Boolean(eligible), energyLevel, estimatedKcalPerServing,
    servings, durationMinutes, difficulty, allergens, ingredientKeywords, mealRoles,
    sourceCoverCloudPath, coverEmoji, createdAt, updatedAt,
    description: description || `${name}的做法来自公开社区菜谱，食材、火候与操作顺序均按原始方法整理。`,
    coverImage: '', ingredients: [], seasonings: [], steps: [], tips: []
  }
})

module.exports = Object.assign({ BUILTIN_RECIPES }, constants)
