const storage = require('../../utils/storage')
const nutrition = require('../utils/nutrition')

function getPackageUnit(label) {
  if (label.includes('瓶')) return '瓶'
  if (label.includes('盒')) return '盒'
  if (label.includes('杯')) return '杯'
  if (label.includes('罐')) return '罐'
  if (label.includes('袋')) return '袋'
  if (label.includes('块')) return '块'
  return '份'
}

Page({
  data: {
    selectedDate: '',
    maxDate: '',
    weekDays: [],
    activeTab: 'plan',
    planRecipes: [],
    shoppingList: [],
    checkedCount: 0,
    pendingShoppingCount: 0
  },

  onLoad(options) {
    const selectedDate = options.date || storage.getDateKey()
    this.setData({
      selectedDate,
      maxDate: storage.getDateKey(new Date(Date.now() + 6 * 86400000)),
      activeTab: options.tab === 'shopping' ? 'shopping' : 'plan',
      weekDays: this.buildWeekDays(selectedDate)
    })
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const shoppingList = storage.getShoppingList().map(item => {
      const estimate = nutrition.estimateShoppingItem(item)
      return Object.assign({}, item, {
        purchaseHint: estimate.grams === null || estimate.grams === undefined
          ? '请按实际需要购买'
          : estimate.packageCount
            ? `需${estimate.grams}克 · 建议买${estimate.packageCount}${getPackageUnit(estimate.packageLabel)}（${estimate.packageLabel}）${estimate.leftoverGrams ? ` · 预计余${estimate.leftoverGrams}克` : ''}`
            : estimate.packageLabel
      })
    })
    const today = storage.getDateKey()
    const cookedRecipeIds = this.data.selectedDate === today ? storage.getCookedRecipeIds(today) : new Set()
    const planRecipes = storage.getMealPlan(this.data.selectedDate).map(recipe => Object.assign({}, recipe, {
      isCooked: cookedRecipeIds.has(recipe.id)
    }))
    this.setData({
      planRecipes,
      shoppingList,
      checkedCount: shoppingList.filter(item => item.checked).length,
      pendingShoppingCount: shoppingList.filter(item => !item.checked).length
    })
  },

  changeDate(event) {
    const selectedDate = event.detail.value
    this.setData({ selectedDate, weekDays: this.buildWeekDays(selectedDate) }, () => this.loadData())
  },

  buildWeekDays(selectedDate) {
    const today = new Date()
    const todayKey = storage.getDateKey(today)
    const dayNames = ['日', '一', '二', '三', '四', '五', '六']
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index)
      const value = storage.getDateKey(date)
      return {
        value,
        day: String(date.getDate()),
        label: value === todayKey ? '今天' : `周${dayNames[date.getDay()]}`,
        active: value === selectedDate
      }
    })
  },

  chooseDay(event) {
    const selectedDate = event.currentTarget.dataset.date
    if (!selectedDate || selectedDate === this.data.selectedDate) return
    this.setData({ selectedDate, weekDays: this.buildWeekDays(selectedDate) }, () => this.loadData())
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab
    if (activeTab && activeTab !== this.data.activeTab) this.setData({ activeTab })
  },

  openRecipe(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/features/detail/detail?id=${id}` })
  },

  removePlanRecipe(event) {
    storage.removeRecipeFromMealPlan(event.currentTarget.dataset.id, this.data.selectedDate)
    this.loadData()
  },

  toggleShoppingItem(event) {
    storage.toggleShoppingItem(event.currentTarget.dataset.id)
    this.loadData()
  },

  removeShoppingItem(event) {
    storage.removeShoppingItem(event.currentTarget.dataset.id)
    this.loadData()
  },

  clearChecked() {
    if (!this.data.checkedCount) return
    storage.clearCheckedShoppingItems()
    this.loadData()
    wx.showToast({ title: '已清除已购项', icon: 'success' })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
