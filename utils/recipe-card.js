const imageService = require('./image-service')

function toRecipeCard(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    mealType: recipe.mealType,
    cuisine: recipe.cuisine || '家常菜',
    durationMinutes: recipe.durationMinutes,
    coverEmoji: recipe.coverEmoji || '🍽️',
    coverImage: imageService.getRecipeInitialImage(recipe),
    sourceLabel: recipe.source === 'custom' ? '我的菜谱' : recipe.source === 'community' ? '社区菜谱' : ''
  }
}

module.exports = { toRecipeCard }
