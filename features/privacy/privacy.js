const storage = require('../../utils/storage')
const health = require('../../utils/health')

Page({
  data: {
    summary: null
  },

  onShow() {
    const state = storage.getState()
    this.setData({
      summary: {
        hasNickname: Boolean(state.profile.nickname),
        hasAvatar: Boolean(state.profile.avatarPath),
        heightCm: state.profile.heightCm,
        populationLabel: health.getPopulationLabel(state.profile.populationType),
        conditionCount: (state.profile.healthConditions || []).length,
        weightCount: state.weightRecords.length,
        allergyCount: state.profile.allergies.length,
        avoidedCount: state.profile.avoidedIngredients.length,
        customRecipeCount: state.customRecipes.length,
        overrideRecipeCount: Object.keys(state.recipeOverrides || {}).length,
        favoriteCount: (state.favorites || []).length,
        drawCount: state.drawHistory.length
      }
    })
  }
})
