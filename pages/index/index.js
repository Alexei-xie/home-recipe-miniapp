const storage = require('../../utils/storage')
const health = require('../../utils/health')
const imageService = require('../../utils/image-service')
const community = require('../../utils/community')
const { MEAL_TYPES, CUISINES } = require('../../data/recipes')

function getRecipeCoverImage(recipe) {
  return imageService.getRecipeInitialImage(recipe)
}

function getRecipeSearchText(recipe) {
  return [
    recipe.name,
    recipe.description,
    recipe.mealType,
    recipe.cuisine,
    ...(recipe.healthTags || []),
    ...(recipe.ingredientKeywords || [])
  ].filter(Boolean).join(' ').toLowerCase()
}

Page({
  data: {
    introVisible: false,
    searchQuery: '',
    activeMealType: '',
    activeCuisine: '',
    activeSort: 'name_asc',
    sortOptions: [
      { value: 'updated_desc', label: '最近修改' },
      { value: 'created_desc', label: '最近添加' },
      { value: 'name_asc', label: '菜名排序' }
    ],
    mealTypes: MEAL_TYPES,
    cuisines: CUISINES,
    visibleRecipes: [],
    totalRecipeCount: 0,
    loadedRecipeCount: 0,
    hasActiveFilters: false,
    filterSummary: '',
    isLoading: true,
    recommendation: null,
    hasHealthRecommendation: false,
    todayPlanCount: 0,
    shoppingListCount: 0,
    pantryVisible: false,
    pantryInput: '',
    pantryIngredients: [],
    communityRecipeCount: 0
  },

  onShow() {
    // 首屏只渲染 16 张卡片，滚动到底再增量加载，降低千级菜谱的首屏布局与图片请求压力。
    this.pageSize = 16
    this.loadPage()
  },

  onReachBottom() {
    this.renderNextPage()
  },

  onPullDownRefresh() {
    if (this.communitySyncing) return
    this.communitySyncing = true
    wx.showNavigationBarLoading()
    community.syncPublicRecipes().then(result => {
      this.loadPage()
      wx.showToast({
        title: result.unchanged ? '已是最新菜谱' : `已同步 ${result.count} 道公共菜谱`,
        icon: 'none'
      })
    }).catch(error => {
      wx.showToast({ title: error.message || '同步失败，请稍后重试', icon: 'none', duration: 2500 })
    }).finally(() => {
      this.communitySyncing = false
      wx.hideNavigationBarLoading()
      wx.stopPullDownRefresh()
    })
  },

  onHide() {
    this.clearSearchTimer()
  },

  onUnload() {
    this.clearSearchTimer()
  },

  loadPage() {
    this.imageRetryCounts = Object.create(null)
    const loadToken = (this.loadToken || 0) + 1
    this.loadToken = loadToken
    const state = storage.getState()
    const allRecipes = storage.getAllRecipes()
    const safeRecipes = health.filterRecipesByDietaryRestrictions(allRecipes, state.profile)
    const latestWeight = health.getLatestWeight(state.weightRecords)
    const recommendation = health.buildHealthRecommendation(allRecipes, state.profile, latestWeight)
    // 首页与健康记录页共用相同的“当前时段 + 当前 BMI”套餐算法，默认推荐保持一致。
    const timeRecommendation = health.buildTimeBasedRecommendation(
      allRecipes,
      state.profile,
      latestWeight,
      new Date(),
      0
    )
    const hasHealthRecommendation = Boolean(
      recommendation.category &&
      state.profile.adultConfirmed &&
      state.profile.healthRecommendationEnabled
    )
    const populationType = state.profile.populationType || 'adult'
    const healthEmptyCopy = populationType === 'child'
      ? { title: '查看儿童青少年 BMI 筛查', text: '按年龄和性别查看 6–17 岁超重与肥胖筛查界值。' }
      : populationType === 'pregnant'
        ? { title: '查看孕期增重参考', text: '按孕前 BMI 和当前孕周查看单胎妊娠增重范围。' }
        : populationType === 'postpartum'
          ? { title: '记录产后体重变化', text: '保留趋势记录，不根据普通成人 BMI 自动生成减重套餐。' }
          : (state.profile.healthConditions || []).length
            ? { title: '已暂停自动健康配餐', text: '当前健康状况需要结合检查结果和专业意见制定饮食方案。' }
            : { title: '想获得更适合你的选择？', text: '记录身高体重后可查看 BMI 饮食方向，也可以继续直接浏览。' }
    // 完整食谱只保留在页面逻辑层；视图层仅接收当前分页的轻量卡片数据。
    // 搜索文本在此预生成一次，避免输入时为 1000+ 道菜反复拼接字段。
    this.recipeIndex = safeRecipes.map(recipe => ({ recipe, searchText: getRecipeSearchText(recipe) }))
    const mealCombination = timeRecommendation.items.map(item => Object.assign({}, item, {
      recipe: Object.assign({}, item.recipe, {
        coverImage: getRecipeCoverImage(item.recipe),
        coverEmoji: item.recipe.coverEmoji || '🍽️'
      })
    }))
    this.setData({
      introVisible: !state.introSeen,
      pantryIngredients: storage.getPantryIngredients(),
      todayPlanCount: storage.getMealPlan().length,
      shoppingListCount: storage.getShoppingList().filter(item => !item.checked).length,
      communityRecipeCount: storage.getCommunityRecipes().length,
      recommendation: recommendation.category ? {
        bmiText: recommendation.bmi.toFixed(1),
        categoryLabel: recommendation.category.label,
        direction: recommendation.category.direction,
        mealCombination
      } : null,
      hasHealthRecommendation,
      healthEmptyTitle: healthEmptyCopy.title,
      healthEmptyText: healthEmptyCopy.text,
      isLoading: false
    }, () => {
      if (this.data.recommendation) {
        imageService.hydrateRecipes(timeRecommendation.items.map(item => item.recipe), null, 3).then(hydratedRecipes => {
          if (loadToken !== this.loadToken || !this.data.recommendation) return
          const patch = {}
          hydratedRecipes.forEach((hydrated, index) => {
            const current = this.data.recommendation.mealCombination[index]
            if (current && current.recipe.id === hydrated.id) {
              patch[`recommendation.mealCombination[${index}].recipe.coverImage`] = hydrated.coverImage
            }
          })
          if (Object.keys(patch).length) this.setData(patch)
        })
      }
      this.applyFilters()
    })
  },

  applyFilters() {
    const query = this.data.searchQuery.trim().toLowerCase()
    let list = this.recipeIndex || []
    if (this.data.activeMealType) {
      list = list.filter(item => item.recipe.mealType === this.data.activeMealType)
    }
    if (this.data.activeCuisine) {
      list = list.filter(item => item.recipe.cuisine === this.data.activeCuisine)
    }
    if (query) {
      list = list.filter(item => item.searchText.includes(query))
    }
    const pantryIngredients = this.data.pantryIngredients || []
    if (pantryIngredients.length) {
      list = list.filter(item => pantryIngredients.every(ingredient => item.searchText.includes(ingredient.toLowerCase())))
    }
    list = this.sortRecipes(list.map(item => item.recipe))
    this.filteredRecipes = list
    this.renderedRecipeCount = 0
    this.renderToken = (this.renderToken || 0) + 1
    const filterSummary = [
      this.data.activeMealType,
      this.data.activeCuisine,
      query ? `“${this.data.searchQuery.trim()}”` : '',
      pantryIngredients.length ? `现有 ${pantryIngredients.join('、')}` : ''
    ].filter(Boolean).join(' · ')
    this.setData({
      visibleRecipes: [],
      totalRecipeCount: list.length,
      loadedRecipeCount: 0,
      hasActiveFilters: Boolean(filterSummary),
      filterSummary
    }, () => this.renderNextPage())
  },

  toRecipeCard(recipe) {
    const coverImage = getRecipeCoverImage(recipe)
    const sourceLabel = recipe.source === 'custom'
      ? '我的菜谱'
      : (recipe.source === 'community' ? '社区菜谱' : '')
    return {
      id: recipe.id,
      name: recipe.name,
      mealType: recipe.mealType,
      cuisine: recipe.cuisine || '家常菜',
      durationMinutes: recipe.durationMinutes,
      coverEmoji: recipe.coverEmoji || '🍽️',
      coverImage,
      sourceLabel
    }
  },

  renderNextPage() {
    const list = this.filteredRecipes || []
    const start = this.renderedRecipeCount || 0
    if (start >= list.length) return
    const end = Math.min(start + (this.pageSize || 24), list.length)
    const nextRecipes = list.slice(start, end)
    const nextCards = nextRecipes.map(recipe => this.toRecipeCard(recipe))
    const renderToken = this.renderToken
    this.renderedRecipeCount = end
    this.setData({
      visibleRecipes: this.data.visibleRecipes.concat(nextCards),
      loadedRecipeCount: end,
      totalRecipeCount: list.length
    }, () => {
      // 云端封面只对当前分页按需换取临时地址；未配置云开发时保持本地兜底图。
      imageService.hydrateRecipes(nextRecipes, null, this.pageSize).then(hydratedRecipes => {
        if (renderToken !== this.renderToken) return
        const patch = {}
        hydratedRecipes.forEach((hydrated, offset) => {
          const index = start + offset
          const current = this.data.visibleRecipes[index]
          if (current && current.id === hydrated.id) {
            patch[`visibleRecipes[${index}].coverImage`] = hydrated.coverImage
          }
        })
        if (Object.keys(patch).length) this.setData(patch)
      })
    })
  },

  sortRecipes(recipes) {
    const sort = this.data.activeSort
    return recipes.slice().sort((a, b) => {
      if (sort === 'name_asc') return a.name.localeCompare(b.name, 'zh-CN')
      const field = sort === 'created_desc' ? 'createdAt' : 'updatedAt'
      const timeDifference = Number(b[field] || 0) - Number(a[field] || 0)
      if (timeDifference) return timeDifference
      const secondaryDifference = Number(b.createdAt || 0) - Number(a.createdAt || 0)
      if (secondaryDifference) return secondaryDifference
      const numericId = value => Number(String(value || '').replace(/^r/, ''))
      const numericDifference = numericId(b.id) - numericId(a.id)
      return Number.isFinite(numericDifference) && numericDifference ? numericDifference : b.id.localeCompare(a.id)
    })
  },

  closeIntro() {
    storage.markIntroSeen()
    this.setData({ introVisible: false })
  },

  goHealthFromIntro() {
    storage.markIntroSeen()
    this.setData({ introVisible: false })
    wx.switchTab({ url: '/pages/health/health' })
  },

  onSearchInput(event) {
    this.setData({ searchQuery: event.detail.value })
    this.clearSearchTimer()
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      this.applyFilters()
    }, 280)
  },

  clearSearchTimer() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.searchTimer = null
  },

  chooseMealType(event) {
    this.clearSearchTimer()
    const value = event.currentTarget.dataset.value
    this.setData({
      activeMealType: this.data.activeMealType === value ? '' : value
    }, () => this.applyFilters())
  },

  chooseCuisine(event) {
    this.clearSearchTimer()
    const value = event.currentTarget.dataset.value
    this.setData({
      activeCuisine: this.data.activeCuisine === value ? '' : value
    }, () => this.applyFilters())
  },

  chooseSort(event) {
    this.clearSearchTimer()
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.activeSort) return
    this.setData({ activeSort: value }, () => this.applyFilters())
  },

  clearFilters() {
    this.clearSearchTimer()
    storage.savePantryIngredients([])
    this.setData({
      searchQuery: '',
      activeMealType: '',
      activeCuisine: '',
      pantryInput: '',
      pantryIngredients: []
    }, () => this.applyFilters())
  },

  openRecipe(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` })
  },

  onRecipeImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    const recipeId = event.currentTarget.dataset.id
    if (!Number.isInteger(index) || !recipeId || !this.data.visibleRecipes[index]) return
    this.recoverCoverImage(
      `list:${recipeId}`,
      recipeId,
      event.currentTarget.dataset.src,
      `visibleRecipes[${index}].coverImage`,
      () => this.data.visibleRecipes[index] && this.data.visibleRecipes[index].id === recipeId
    )
  },

  onComboImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.recommendation || !this.data.recommendation.mealCombination[index]) return
    const recipeId = event.currentTarget.dataset.id
    this.recoverCoverImage(
      `combo:${recipeId}`,
      recipeId,
      event.currentTarget.dataset.src,
      `recommendation.mealCombination[${index}].recipe.coverImage`,
      () => this.data.recommendation && this.data.recommendation.mealCombination[index] &&
        this.data.recommendation.mealCombination[index].recipe.id === recipeId
    )
  },

  recoverCoverImage(retryKey, recipeId, failedUrl, dataPath, isCurrent) {
    const recipe = storage.getRecipe(recipeId)
    if (!recipe) return this.setData({ [dataPath]: '' })
    this.imageRetryCounts = this.imageRetryCounts || Object.create(null)
    const fallback = imageService.getRecipeImageFallback(recipe)
    if (this.imageRetryCounts[retryKey]) {
      this.setData({ [dataPath]: fallback && fallback !== failedUrl ? fallback : '' })
      return
    }
    this.imageRetryCounts[retryKey] = 1
    this.setData({ [dataPath]: '' }, () => {
      imageService.recoverRecipeImage(recipe, failedUrl).then(url => {
        if (isCurrent() && url) this.setData({ [dataPath]: url })
      })
    })
  },

  openComboRecipe(event) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${event.currentTarget.dataset.id}` })
  },

  goDraw() {
    wx.switchTab({ url: '/pages/draw/draw' })
  },

  goHealth() {
    wx.switchTab({ url: '/pages/health/health' })
  },

  goPlanner(event) {
    const tab = event && event.currentTarget.dataset.tab
    wx.navigateTo({ url: `/pages/planner/planner${tab ? `?tab=${tab}` : ''}` })
  },

  togglePantry() {
    this.setData({ pantryVisible: !this.data.pantryVisible })
  },

  onPantryInput(event) {
    this.setData({ pantryInput: event.detail.value })
  },

  applyPantry() {
    const items = this.data.pantryInput.split(/[、，,\s]+/).map(item => item.trim()).filter(Boolean)
    const pantryIngredients = storage.savePantryIngredients(items)
    this.setData({ pantryIngredients, pantryInput: pantryIngredients.join('、') }, () => this.applyFilters())
  },

  addRecommendedMealToPlan() {
    const combination = this.data.recommendation && this.data.recommendation.mealCombination || []
    if (!combination.length) return
    combination.forEach(item => storage.addRecipeToMealPlan(item.recipe.id))
    wx.showToast({ title: '套餐已加入今日菜单', icon: 'success' })
  }
})
