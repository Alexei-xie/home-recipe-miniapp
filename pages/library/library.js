const storage = require('../../utils/storage')
const share = require('../../utils/share')
const { toRecipeCard } = require('../../utils/recipe-card')
const { normalizeIngredient } = require('../../utils/ingredient-matching')
const PAGE_SIZE = 20

Page({
  data: {
    favoriteRecipes: [],
    customRecipes: [],
    favoriteTotal: 0,
    customTotal: 0,
    searchQuery: '',
    cuisineIndex: 0,
    mealTypeIndex: 0,
    cuisineOptions: ['全部菜系'],
    mealTypeOptions: ['全部餐食'],
    hasFilters: false
  },

  onShow() {
    share.enableShareMenu()
    this.loadRecipes()
  },

  onShareAppMessage() {
    return share.appMessage({ title: '来「今日食签」收藏你喜欢的家常菜谱' })
  },

  onShareTimeline() {
    return share.timeline({ title: '今日食签｜收藏家常菜谱，解决今天吃什么' })
  },

  loadRecipes() {
    const key = `${storage.getRecipeRevision()}|${JSON.stringify(storage.getFavorites())}`
    if (key === this.listKey) {
      if (this.filtersDirty) { this.filtersDirty = false; this.applyLibraryFilters() }
      return
    }
    this.listKey = key
    this.favoriteSource = storage.getFavoriteRecipes()
    this.customSource = storage.getCustomRecipes().slice().sort((a, b) => b.updatedAt - a.updatedAt)
    const catalog = storage.getRecipeCatalog()
    const selectedCuisine = this.data.cuisineOptions[this.data.cuisineIndex]
    const selectedMealType = this.data.mealTypeOptions[this.data.mealTypeIndex]
    const cuisineOptions = ['全部菜系'].concat(catalog.cuisines)
    const mealTypeOptions = ['全部餐食'].concat(catalog.mealTypes)
    this.setData({
      cuisineOptions, mealTypeOptions,
      cuisineIndex: Math.max(0, cuisineOptions.indexOf(selectedCuisine)),
      mealTypeIndex: Math.max(0, mealTypeOptions.indexOf(selectedMealType))
    }, () => this.applyLibraryFilters())
  },

  applyLibraryFilters() {
    const query = normalizeIngredient(this.data.searchQuery)
    const cuisine = this.data.cuisineIndex ? this.data.cuisineOptions[this.data.cuisineIndex] : ''
    const mealType = this.data.mealTypeIndex ? this.data.mealTypeOptions[this.data.mealTypeIndex] : ''
    const matches = recipe => (!cuisine || recipe.cuisine === cuisine) && (!mealType || recipe.mealType === mealType) &&
      (!query || normalizeIngredient([recipe.name, recipe.description, ...(recipe.ingredientKeywords || [])].join(' ')).includes(query))
    this.favoriteList = (this.favoriteSource || []).filter(matches)
    this.customList = (this.customSource || []).filter(matches)
    this.setData({
      hasFilters: Boolean(query || cuisine || mealType),
      favoriteRecipes: this.favoriteList.slice(0, PAGE_SIZE).map(toRecipeCard),
      customRecipes: this.customList.slice(0, PAGE_SIZE).map(toRecipeCard),
      favoriteTotal: this.favoriteList.length,
      customTotal: this.customList.length
    })
  },

  onSearchInput(event) {
    this.setData({ searchQuery: event.detail.value })
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.filtersDirty = true
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.filtersDirty = false; this.applyLibraryFilters() }, 250)
  },

  chooseCategory(event) {
    const field = event.currentTarget.dataset.field
    if (field !== 'cuisineIndex' && field !== 'mealTypeIndex') return
    this.setData({ [field]: Number(event.detail.value) }, () => this.applyLibraryFilters())
  },

  clearFilters() {
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.filtersDirty = false
    this.setData({ searchQuery: '', cuisineIndex: 0, mealTypeIndex: 0 }, () => this.applyLibraryFilters())
  },

  onHide() { if (this.searchTimer) clearTimeout(this.searchTimer) },
  onUnload() { if (this.searchTimer) clearTimeout(this.searchTimer) },

  loadMoreFavorites() { this.appendCards('favoriteRecipes', this.favoriteList) },

  loadMoreCustom() { this.appendCards('customRecipes', this.customList) },

  appendCards(field, recipes) {
    const start = this.data[field].length
    const cards = (recipes || []).slice(start, start + PAGE_SIZE).map(toRecipeCard)
    const patch = {}
    cards.forEach((card, index) => { patch[`${field}[${start + index}]`] = card })
    if (cards.length) this.setData(patch)
  },

  openRecipe(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/features/detail/detail?id=${id}` })
  },

  addRecipe() {
    wx.navigateTo({ url: '/features/editor/editor' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  editRecipe(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/features/editor/editor?id=${id}` })
  },

  deleteRecipe(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除自定义菜谱？',
      content: '删除后无法恢复，内置菜谱不会受到影响。',
      confirmColor: '#b44335',
      success: result => {
        if (!result.confirm) return
        try { storage.deleteCustomRecipe(id) } catch (error) {
          return wx.showToast({ title: error.message, icon: 'none' })
        }
        this.loadRecipes()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
