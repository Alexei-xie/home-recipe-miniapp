const community = require('../../utils/community')
const storage = require('../../utils/storage')
const { BUILTIN_RECIPES } = require('../../data/recipes')
const { applyRecipeCategories, resolveCategory } = require('../../utils/recipe-catalog')
const PAGE_SIZE = 20

Page({
  data: {
    loading: true, isAdmin: false, busy: false, errorText: '',
    activeTab: 'cuisines', revision: 0, categoryRows: [], newName: '',
    cuisines: [], mealTypes: [], recipes: [], recipeTotal: 0,
    searchQuery: '', filterCuisine: '', filterMealType: '',
    mergeVisible: false, mergeName: '', mergeOptions: [], mergeTargetIndex: 0,
    mergeOperation: 'merge', mergeRecipeCount: 0, mergePickerOptions: []
  },

  onShow() { this.loadData() },

  onPullDownRefresh() { this.loadData().finally(() => wx.stopPullDownRefresh()) },

  onUnload() { this.unloaded = true },

  loadData() {
    if (this.loadingTask) return this.loadingTask
    this.setData({ loading: true, errorText: '' })
    this.loadingTask = community.getStatus(storage.getCommunitySync().noticeSeenAt).then(status => {
      if (!status.isAdmin) {
        this.setData({ isAdmin: false, loading: false, errorText: '当前账号没有分类管理权限。' })
        return
      }
      this.setData({ isAdmin: true })
      return Promise.all([community.syncPublicRecipes(), community.getRecipeCatalog()]).then(() => {
        if (this.unloaded) return
        this.catalog = storage.getRecipeCatalog()
        this.drafts = {}
        this.refreshView()
        this.setData({ loading: false })
      })
    }).catch(error => {
      if (!this.unloaded) this.setData({ loading: false, errorText: error.code === 'UNKNOWN_ACTION' ? '分类服务尚未更新，请先部署新版云函数。' : error.message || '加载失败，请下拉重试。' })
    }).finally(() => { this.loadingTask = null })
    return this.loadingTask
  },

  refreshView() {
    const catalog = this.catalog
    this.publicRecipes = BUILTIN_RECIPES.concat(storage.getCommunityRecipes())
      .map(recipe => applyRecipeCategories(recipe, catalog))
    const field = this.data.activeTab === 'mealTypes' ? 'mealTypes' : 'cuisines'
    const recipeField = field === 'mealTypes' ? 'mealType' : 'cuisine'
    const counts = new Map()
    this.publicRecipes.forEach(recipe => counts.set(recipe[recipeField], (counts.get(recipe[recipeField]) || 0) + 1))
    this.setData({
      revision: catalog.revision, cuisines: catalog.cuisines, mealTypes: catalog.mealTypes,
      categoryRows: catalog[field].map((name, index) => ({ name, index, count: counts.get(name) || 0 })),
      filterCuisine: this.data.filterCuisine ? resolveCategory(this.data.filterCuisine, 'cuisines', catalog) : '',
      filterMealType: this.data.filterMealType ? resolveCategory(this.data.filterMealType, 'mealTypes', catalog) : ''
    }, () => this.renderRecipes())
  },

  chooseTab(event) {
    if (this.data.busy) return
    const activeTab = event.currentTarget.dataset.tab
    this.setData({ activeTab, newName: '' }, () => this.refreshView())
  },

  onNewNameInput(event) { this.setData({ newName: event.detail.value }) },

  addCategory() {
    const name = this.data.newName.trim()
    if (!name) return wx.showToast({ title: '请填写分类名称', icon: 'none' })
    this.performChange({ operation: 'add', field: this.data.activeTab, name })
  },

  renameCategory(event) {
    if (this.data.busy) return
    const name = event.currentTarget.dataset.name
    wx.showModal({
      title: '修改分类名称', editable: true, content: name, placeholderText: '填写 1–12 个字', confirmText: '保存名称',
      success: result => {
        if (result.confirm && String(result.content || '').trim() !== name) this.performChange({ operation: 'rename', field: this.data.activeTab, name, target: String(result.content || '').trim() })
      }
    })
  },

  moveCategory(event) {
    this.performChange({ operation: 'move', field: this.data.activeTab, name: event.currentTarget.dataset.name, direction: Number(event.currentTarget.dataset.direction) })
  },

  openMerge(event) {
    if (this.data.busy) return
    const name = event.currentTarget.dataset.name
    const options = this.catalog[this.data.activeTab].filter(item => item !== name)
    if (!options.length) return wx.showToast({ title: '至少保留一个分类', icon: 'none' })
    this.setData({ mergeVisible: true, mergeName: name, mergeOptions: options, mergePickerOptions: options, mergeTargetIndex: 0, mergeOperation: 'merge', mergeRecipeCount: 0 })
  },

  openDelete(event) {
    if (this.data.busy || !this.catalog) return
    const name = event.currentTarget.dataset.name
    const row = this.data.categoryRows.find(item => item.name === name)
    if (!row) return
    const options = this.catalog[this.data.activeTab].filter(item => item !== name)
    if (!options.length) return wx.showToast({ title: '至少保留一个分类', icon: 'none' })
    if (row.count > 0) {
      this.setData({
        mergeVisible: true, mergeName: name, mergeOptions: options, mergeTargetIndex: -1,
        mergeOperation: 'delete', mergeRecipeCount: row.count,
        mergePickerOptions: ['请选择接收分类'].concat(options)
      })
      return
    }
    const target = options[0]
    wx.showModal({
      title: `删除「${name}」？`,
      content: `当前没有公共菜谱。删除后不再显示此分类；后续同步到的旧分类引用会归入「${target}」。`,
      confirmText: '确认删除', confirmColor: '#b44335',
      success: result => {
        if (result.confirm) this.performChange({ operation: 'delete', field: this.data.activeTab, name, target })
      }
    })
  },

  closeMerge() { if (!this.data.busy) this.setData({ mergeVisible: false }) },
  stopTap() {},
  chooseMergeTarget(event) {
    const index = Number(event.detail.value)
    this.setData({ mergeTargetIndex: this.data.mergeOperation === 'delete' ? index - 1 : index })
  },

  confirmMerge() {
    const target = this.data.mergeOptions[this.data.mergeTargetIndex]
    if (!target) return wx.showToast({ title: '请先选择接收分类', icon: 'none' })
    this.performChange({ operation: this.data.mergeOperation, field: this.data.activeTab, name: this.data.mergeName, target })
  },

  performChange(change) {
    if (this.data.busy || !this.catalog) return Promise.resolve()
    this.setData({ busy: true })
    return community.updateRecipeCatalog(Object.assign({ expectedRevision: this.catalog.revision }, change)).then(catalog => {
      if (this.unloaded) return
      this.catalog = catalog
      if (change.recipeId && this.drafts) delete this.drafts[change.recipeId]
      this.setData({ newName: '', mergeVisible: false })
      this.refreshView()
      wx.showToast({ title: change.operation === 'delete' ? '分类已删除，用户同步后生效' : '已保存，用户同步后生效', icon: 'none' })
    }).catch(error => {
      wx.showModal({ title: error.code === 'CATALOG_CACHE_WRITE_FAILED' ? '云端已保存' : '调整未保存', content: error.message || '请稍后重试', showCancel: false })
      if (error.code === 'CATALOG_CONFLICT') this.loadData()
    }).finally(() => { if (!this.unloaded) this.setData({ busy: false }) })
  },

  onSearchInput(event) {
    this.setData({ searchQuery: event.detail.value }, () => { this.visibleLimit = PAGE_SIZE; this.renderRecipes() })
  },

  filterCuisine(event) {
    const filterCuisine = this.data.cuisines[Number(event.detail.value) - 1] || ''
    this.setData({ filterCuisine }, () => { this.visibleLimit = PAGE_SIZE; this.renderRecipes() })
  },

  filterMealType(event) {
    const filterMealType = this.data.mealTypes[Number(event.detail.value) - 1] || ''
    this.setData({ filterMealType }, () => { this.visibleLimit = PAGE_SIZE; this.renderRecipes() })
  },

  renderRecipes() {
    const query = this.data.searchQuery.trim().toLowerCase()
    this.filteredRecipes = (this.publicRecipes || []).filter(recipe =>
      (!query || `${recipe.name} ${recipe.id}`.toLowerCase().includes(query)) &&
      (!this.data.filterCuisine || recipe.cuisine === this.data.filterCuisine) &&
      (!this.data.filterMealType || recipe.mealType === this.data.filterMealType))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    this.visibleLimit = this.visibleLimit || PAGE_SIZE
    this.setData({
      recipes: this.filteredRecipes.slice(0, this.visibleLimit).map(recipe => this.toRow(recipe)),
      recipeTotal: this.filteredRecipes.length,
      cuisineFilterOptions: ['全部菜系'].concat(this.catalog.cuisines),
      mealFilterOptions: ['全部餐食'].concat(this.catalog.mealTypes)
    })
  },

  toRow(recipe) {
    const draft = (this.drafts || {})[recipe.id]
    const cuisine = resolveCategory(draft ? draft.cuisine : recipe.cuisine, 'cuisines', this.catalog)
    const mealType = resolveCategory(draft ? draft.mealType : recipe.mealType, 'mealTypes', this.catalog)
    return {
      id: recipe.id, name: recipe.name, sourceLabel: recipe.source === 'community' ? '公共投稿' : '内置菜谱',
      cuisine, mealType, cuisineIndex: this.catalog.cuisines.indexOf(cuisine), mealTypeIndex: this.catalog.mealTypes.indexOf(mealType),
      dirty: cuisine !== recipe.cuisine || mealType !== recipe.mealType
    }
  },

  loadMore() {
    const start = this.data.recipes.length
    this.visibleLimit = start + PAGE_SIZE
    const patch = {}
    this.filteredRecipes.slice(start, this.visibleLimit).forEach((recipe, offset) => { patch[`recipes[${start + offset}]`] = this.toRow(recipe) })
    if (Object.keys(patch).length) this.setData(patch)
  },

  changeRecipeCategory(event) {
    if (this.data.busy) return
    const index = Number(event.currentTarget.dataset.index)
    const row = this.data.recipes[index]
    if (!row) return
    const field = event.currentTarget.dataset.field
    const names = field === 'cuisine' ? this.catalog.cuisines : this.catalog.mealTypes
    const value = names[Number(event.detail.value)]
    if (!value) return
    this.drafts = this.drafts || {}
    this.drafts[row.id] = Object.assign({ cuisine: row.cuisine, mealType: row.mealType }, this.drafts[row.id], { [field]: value })
    const recipe = this.publicRecipes.find(item => item.id === row.id)
    this.setData({ [`recipes[${index}]`]: this.toRow(recipe) })
  },

  saveRecipeCategory(event) {
    const row = this.data.recipes[Number(event.currentTarget.dataset.index)]
    if (row && row.dirty) this.performChange({ operation: 'assign', recipeId: row.id, cuisine: row.cuisine, mealType: row.mealType })
  }
})
