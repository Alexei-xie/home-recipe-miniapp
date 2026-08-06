const storage = require('../../utils/storage')
const health = require('../../utils/health')
const { DRAW_POOLS } = require('../../data/recipes')
const imageService = require('../../utils/image-service')

function toRollingRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    coverEmoji: recipe.coverEmoji || '🍽️'
  }
}

function toResultRecipe(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    description: recipe.description,
    mealType: recipe.mealType,
    durationMinutes: recipe.durationMinutes,
    coverEmoji: recipe.coverEmoji || '🍽️',
    coverImage: imageService.getRecipeInitialImage(recipe)
  }
}

Page({
  data: {
    pools: ['全部食谱'].concat(DRAW_POOLS).concat(['我的菜谱']),
    activePool: '全部食谱',
    candidateCount: 0,
    rolling: false,
    rollingRecipe: null,
    result: null,
    history: []
  },

  onShow() {
    this.refresh()
  },

  onHide() {
    this.stopRollingTimer()
    if (this.data.rolling) this.setData({ rolling: false, rollingRecipe: null })
  },

  onUnload() {
    this.stopRollingTimer()
  },

  getCandidates(recipes = this.allRecipes, profile = this.profile) {
    const currentProfile = profile || storage.getProfile()
    let availableRecipes = recipes || storage.getAllRecipes()
    let filteredRecipes = health.filterRecipesByDietaryRestrictions(availableRecipes, currentProfile)
    if (this.data.activePool === '我的菜谱') return filteredRecipes.filter(item => item.source === 'custom')
    if (this.data.activePool !== '全部食谱') {
      filteredRecipes = filteredRecipes.filter(item => (item.drawPools || []).includes(this.data.activePool))
    }
    return filteredRecipes
  },

  refresh() {
    // 每次显示只读取一次完整食谱库；历史记录通过 Map 查找，避免重复构建 10 次 1000+ 食谱列表。
    this.profile = storage.getProfile()
    this.allRecipes = storage.getAllRecipes()
    this.recipeById = new Map(this.allRecipes.map(recipe => [recipe.id, recipe]))
    const history = storage.getDrawHistory()
      .map(item => {
        const recipe = this.recipeById.get(item.recipeId)
        return recipe ? Object.assign({}, item, { recipe: toRollingRecipe(recipe) }) : null
      })
      .filter(Boolean)
    this.setData({
      candidateCount: this.getCandidates(this.allRecipes, this.profile).length,
      history
    })
  },

  choosePool(event) {
    if (this.data.rolling) return
    this.setData({
      activePool: event.currentTarget.dataset.pool,
      result: null
    }, () => this.refresh())
  },

  startDraw() {
    if (this.data.rolling) return
    const candidates = this.getCandidates(this.allRecipes, this.profile)
    if (!candidates.length) {
      wx.showModal({
        title: '没有可抽取的菜谱',
        content: '当前分类可能被过敏原或忌口条件过滤。请到“我的”调整设置，或选择其他分类。',
        confirmText: '去调整',
        success: result => {
          if (result.confirm) wx.switchTab({ url: '/pages/profile/profile' })
        }
      })
      return
    }

    this.setData({ rolling: true, result: null })
    let index = 0
    this.rollTimer = setInterval(() => {
      this.setData({ rollingRecipe: toRollingRecipe(candidates[index % candidates.length]) })
      index += 1
    }, 110)
    this.finishTimer = setTimeout(() => {
      this.stopRollingTimer()
      const chosen = health.drawRandomRecipe(
        this.allRecipes,
        this.data.activePool,
        this.profile,
        storage.getDrawHistory()
      )
      if (!chosen) {
        this.setData({ rolling: false, rollingRecipe: null })
        return
      }
      storage.addDrawHistory(chosen.id, this.data.activePool)
      this.resultImageRetried = false
      this.setData({
        rolling: false,
        rollingRecipe: null,
        result: toResultRecipe(chosen)
      })
      imageService.hydrateRecipe(chosen).then((hydrated) => {
        if (this.data.result && this.data.result.id === hydrated.id) {
          this.setData({ 'result.coverImage': hydrated.coverImage || '' })
        }
      })
      this.refresh()
      wx.vibrateShort({ type: 'light' })
    }, 1500)
  },

  stopRollingTimer() {
    if (this.rollTimer) clearInterval(this.rollTimer)
    if (this.finishTimer) clearTimeout(this.finishTimer)
    this.rollTimer = null
    this.finishTimer = null
  },

  openRecipe(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  clearHistory() {
    if (!this.data.history.length) return
    wx.showModal({
      title: '清空最近抽取记录？',
      content: '此操作只会删除本机最近抽到的记录，不会删除任何菜谱。',
      confirmText: '清空',
      confirmColor: '#b44335',
      success: result => {
        if (!result.confirm) return
        storage.clearDrawHistory()
        this.setData({ history: [] })
        wx.showToast({ title: '已清空', icon: 'success' })
      }
    })
  },

  onResultImageError() {
    const result = this.data.result
    if (!result) return
    const recipe = storage.getRecipe(result.id)
    const failedUrl = result.coverImage
    if (!recipe) return this.setData({ 'result.coverImage': '' })
    const fallback = imageService.getRecipeImageFallback(recipe)
    if (this.resultImageRetried) {
      this.setData({ 'result.coverImage': fallback && fallback !== failedUrl ? fallback : '' })
      return
    }
    this.resultImageRetried = true
    this.setData({ 'result.coverImage': '' }, () => {
      imageService.recoverRecipeImage(recipe, failedUrl).then(url => {
        if (this.data.result && this.data.result.id === recipe.id && url) {
          this.setData({ 'result.coverImage': url })
        }
      })
    })
  }
})
