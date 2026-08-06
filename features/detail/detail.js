const storage = require('../../utils/storage')
const health = require('../../utils/health')
const imageService = require('../../utils/image-service')
const nutrition = require('../../utils/nutrition')
const community = require('../../utils/community')
const share = require('../../utils/share')

function scaledAmount(amount, ratio) {
  const raw = String(amount || '适量')
  if (ratio === 1) return raw
  return raw.replace(/\d+(?:\.\d+)?/g, value => {
    const scaled = Number(value) * ratio
    return String(Math.round(scaled * 10) / 10)
  })
}

function scaleIngredients(items, ratio) {
  return (items || []).map(item => Object.assign({}, item, {
    amount: scaledAmount(item.amount, ratio)
  }))
}

Page({
  data: {
    recipe: null,
    restrictionReasons: [],
    videoFailed: false,
    isFavorite: false,
    servingCount: 2,
    scaledIngredients: [],
    scaledSeasonings: [],
    missingIngredients: [],
    isInTodayPlan: false,
    isCookedToday: false,
    nutritionAnalysis: null,
    nutritionUsable: false,
    nutritionMicroUsable: false,
    nutritionUnmatchedText: ''
  },

  onLoad(options) {
    this.recipeId = options.id
    share.enableShareMenu()
  },

  onShow() {
    const recipe = storage.getRecipe(this.recipeId)
    if (!recipe) {
      if (/^community_/.test(String(this.recipeId || '')) && !this.communityLookupAttempted) {
        this.communityLookupAttempted = true
        community.syncPublicRecipes().then(() => this.onShow()).catch(() => this.setData({ recipe: null }))
        return
      }
      this.setData({ recipe: null })
      return
    }
    const reasons = health.getRestrictionReasons(recipe, storage.getProfile())
    const sourceLabel = recipe.source === 'custom'
      ? '我的菜谱'
      : recipe.source === 'community'
        ? `社区菜谱 · ${recipe.publisherName || '社区用户'}投稿`
        : recipe.isLocalOverride ? '内置菜谱（已本地修改）' : '内置精选'
    const displayRecipe = Object.assign({}, recipe, { sourceLabel })
    const initialDisplayRecipe = Object.assign({}, displayRecipe, {
      coverImage: imageService.getRecipeInitialImage(displayRecipe)
    })
    this.coverImageRetried = false
    this.stepImageRetryCounts = Object.create(null)
    const servingCount = Math.max(1, Number(recipe.servings) || 2)
    const pantryIngredients = storage.getPantryIngredients().map(item => item.toLowerCase())
    const missingIngredients = pantryIngredients.length
      ? (recipe.ingredients || []).filter(item => !pantryIngredients.some(pantry => String(item.name || '').toLowerCase().includes(pantry) || pantry.includes(String(item.name || '').toLowerCase())))
      : []
    const nutritionAnalysis = nutrition.analyzeRecipe(recipe)
    this.setData({
      recipe: initialDisplayRecipe,
      restrictionReasons: reasons,
      restrictionText: reasons.join('、'),
      allergensText: (recipe.allergens || []).join('、'),
      videoFailed: false,
      isFavorite: storage.isFavorite(recipe.id),
      servingCount,
      scaledIngredients: scaleIngredients(recipe.ingredients, 1),
      scaledSeasonings: scaleIngredients(recipe.seasonings, 1),
      missingIngredients,
      isInTodayPlan: storage.getMealPlan().some(item => item.id === recipe.id),
      isCookedToday: storage.isRecipeCookedToday(recipe.id),
      nutritionAnalysis,
      nutritionUsable: nutritionAnalysis.coverage >= 70,
      nutritionMicroUsable: nutritionAnalysis.microCoverage >= 70,
      nutritionUnmatchedText: nutritionAnalysis.unmatched.join('、')
    })
    wx.setNavigationBarTitle({ title: recipe.name })
    imageService.hydrateRecipe(displayRecipe).then((hydrated) => {
      if (this.recipeId === hydrated.id) {
        this.setData({ recipe: hydrated })
      }
    })
  },

  previewImage(event) {
    const current = event.currentTarget.dataset.src
    const urls = [this.data.recipe.coverImage].filter(Boolean)
    if (current && urls.length) wx.previewImage({ current, urls })
  },

  previewStepImage(event) {
    const current = event.currentTarget.dataset.src
    const recipe = this.data.recipe || {}
    const urls = (recipe.steps || []).reduce((all, step) => all.concat(step.images || []), [])
      .concat(recipe.processImages || [])
      .filter(Boolean)
    if (current && urls.length) wx.previewImage({ current, urls })
  },

  onStepImageError(event) {
    const failedUrl = event.currentTarget.dataset.src
    const recipe = this.data.recipe
    if (!failedUrl || !recipe) return
    const invalidatedPaths = imageService.invalidateStepImageByUrl(failedUrl)
    const retryKey = invalidatedPaths.join('|') || failedUrl
    this.stepImageRetryCounts = this.stepImageRetryCounts || Object.create(null)
    const strippedRecipe = Object.assign({}, recipe, {
      steps: (recipe.steps || []).map(step => Object.assign({}, step, {
        images: (step.images || []).filter(item => item !== failedUrl)
      })),
      processImages: (recipe.processImages || []).filter(item => item !== failedUrl)
    })
    this.setData({ recipe: strippedRecipe })
    if (!invalidatedPaths.length || this.stepImageRetryCounts[retryKey]) return
    this.stepImageRetryCounts[retryKey] = 1
    imageService.hydrateRecipeStepImages(strippedRecipe).then(hydrated => {
      if (this.data.recipe && this.data.recipe.id === hydrated.id) this.setData({ recipe: hydrated })
    })
  },

  onVideoError() {
    this.setData({ videoFailed: true })
  },

  toggleFavorite() {
    const recipe = this.data.recipe
    if (!recipe) return
    const result = storage.toggleFavorite(recipe.id)
    this.setData({ isFavorite: result.favorite })
    wx.showToast({ title: result.favorite ? '已收藏' : '已取消收藏', icon: 'success' })
  },

  changeServings(event) {
    const recipe = this.data.recipe
    if (!recipe) return
    const servingCount = Math.max(1, Math.min(12, this.data.servingCount + Number(event.currentTarget.dataset.delta || 0)))
    const ratio = servingCount / (Number(recipe.servings) || 2)
    const scaledIngredients = scaleIngredients(recipe.ingredients, ratio)
    const scaledSeasonings = scaleIngredients(recipe.seasonings, ratio)
    const nutritionAnalysis = nutrition.analyzeRecipe(Object.assign({}, recipe, {
      servings: servingCount,
      ingredients: scaledIngredients,
      seasonings: scaledSeasonings
    }))
    this.setData({
      servingCount,
      scaledIngredients,
      scaledSeasonings,
      nutritionAnalysis,
      nutritionUsable: nutritionAnalysis.coverage >= 70,
      nutritionMicroUsable: nutritionAnalysis.microCoverage >= 70,
      nutritionUnmatchedText: nutritionAnalysis.unmatched.join('、')
    })
  },

  addToMealPlan() {
    const recipe = this.data.recipe
    if (!recipe) return
    storage.addRecipeToMealPlan(recipe.id)
    this.setData({ isInTodayPlan: true })
    wx.showToast({ title: '已加入今日菜单', icon: 'success' })
  },

  addToShoppingList() {
    const recipe = this.data.recipe
    if (!recipe) return
    storage.addRecipeToShoppingList(Object.assign({}, recipe, {
      ingredients: this.data.scaledIngredients,
      seasonings: this.data.scaledSeasonings
    }))
    wx.showToast({ title: '已加入采购清单', icon: 'success' })
  },

  startCooking() {
    if (!this.data.recipe) return
    wx.navigateTo({ url: `/features/cook/cook?id=${this.data.recipe.id}` })
  },

  toggleCookedToday() {
    const recipe = this.data.recipe
    if (!recipe) return
    const history = storage.markRecipeCooked(recipe.id)
    const today = storage.getDateKey()
    const isCookedToday = history.some(item => item.recipeId === recipe.id && item.date === today)
    this.setData({ isCookedToday })
    wx.showToast({ title: isCookedToday ? '已记录今天做过' : '已取消完成记录', icon: 'success' })
  },

  onShareAppMessage() {
    const recipe = this.data.recipe
    if (!recipe || recipe.source === 'custom') return share.appMessage()
    return {
      title: `菜谱｜${recipe.name}`,
      path: `/features/detail/detail?id=${encodeURIComponent(recipe.id)}`
    }
  },

  onShareTimeline() {
    const recipe = this.data.recipe
    if (!recipe || recipe.source === 'custom') return share.timeline()
    return {
      title: `菜谱｜${recipe.name}`,
      query: `id=${encodeURIComponent(recipe.id)}`
    }
  },

  onCoverError(event) {
    const recipe = this.data.recipe
    if (!recipe) return
    const failedUrl = event.currentTarget.dataset.src || recipe.coverImage
    const fallback = imageService.getRecipeImageFallback(recipe)
    if (this.coverImageRetried) {
      this.setData({ 'recipe.coverImage': fallback && fallback !== failedUrl ? fallback : '' })
      return
    }
    this.coverImageRetried = true
    this.setData({ 'recipe.coverImage': '' }, () => {
      imageService.recoverRecipeImage(recipe, failedUrl).then(url => {
        if (this.data.recipe && this.data.recipe.id === recipe.id && url) {
          this.setData({ 'recipe.coverImage': url })
        }
      })
    })
  },

  copyRecipeReference() {
    if (!this.data.recipe.referenceUrl) return
    wx.setClipboardData({ data: this.data.recipe.referenceUrl })
  },

  copyTutorialLink(event) {
    const url = event.currentTarget.dataset.url
    const title = event.currentTarget.dataset.title || '外部教程'
    if (!url) return
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '教程链接已复制',
          content: `已复制「${title}」的公开链接。请在浏览器或对应平台 App 中粘贴打开。`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  copyRecipe() {
    wx.navigateTo({ url: `/features/editor/editor?copy=${this.data.recipe.id}` })
  },

  editBuiltinRecipe() {
    wx.navigateTo({ url: `/features/editor/editor?id=${this.data.recipe.id}&direct=1` })
  },

  resetBuiltinRecipe() {
    wx.showModal({
      title: '恢复内置原版？',
      content: '你修改的封面、食材、步骤和其他本地内容都会被清除，无法恢复。',
      confirmText: '恢复原版',
      confirmColor: '#b44335',
      success: result => {
        if (!result.confirm) return
        storage.clearBuiltinRecipeOverride(this.data.recipe.id)
        wx.showToast({ title: '已恢复原版', icon: 'success' })
        this.onShow()
      }
    })
  },

  editRecipe() {
    wx.navigateTo({ url: `/features/editor/editor?id=${this.data.recipe.id}` })
  },

  copyCommunityRecipe() {
    wx.navigateTo({ url: `/features/editor/editor?copy=${this.data.recipe.id}` })
  },

  drawAgain() {
    wx.switchTab({ url: '/pages/draw/draw' })
  }
})
