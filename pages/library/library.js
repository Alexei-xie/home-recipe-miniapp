const storage = require('../../utils/storage')
const share = require('../../utils/share')

Page({
  data: {
    favoriteRecipes: [],
    customRecipes: []
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
    this.setData({
      favoriteRecipes: storage.getFavoriteRecipes(),
      customRecipes: storage.getCustomRecipes().slice().sort((a, b) => b.updatedAt - a.updatedAt)
    })
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
        storage.deleteCustomRecipe(id)
        this.loadRecipes()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
