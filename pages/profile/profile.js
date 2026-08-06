const storage = require('../../utils/storage')
const community = require('../../utils/community')
const { ALLERGENS } = require('../../data/recipes')

Page({
  data: {
    profile: null,
    nicknameInput: '',
    avoidedInput: '',
    allergens: ALLERGENS,
    noticeCount: 0,
    isCommunityAdmin: false
  },

  onShow() {
    this.loadProfile()
    this.loadCommunityStatus()
  },

  loadCommunityStatus() {
    if (!community.isAvailable()) return
    const sync = storage.getCommunitySync()
    community.getStatus(sync.noticeSeenAt).then(status => {
      const noticeCount = Number(status.pendingCount || 0) + Number(status.myResolvedCount || 0)
      this.setData({ noticeCount: Math.min(99, noticeCount), isCommunityAdmin: Boolean(status.isAdmin) })
      if (noticeCount > 0) wx.setTabBarBadge({ index: 4, text: noticeCount > 99 ? '99+' : String(noticeCount) })
      else wx.removeTabBarBadge({ index: 4 })
    }).catch(() => {
      this.setData({ noticeCount: 0, isCommunityAdmin: false })
      wx.removeTabBarBadge({ index: 4 })
    })
  },

  loadProfile() {
    const profile = storage.getProfile()
    this.setData({
      profile,
      allergenOptions: ALLERGENS.map(name => ({
        name,
        selected: (profile.allergies || []).includes(name)
      })),
      nicknameInput: profile.nickname,
      avoidedInput: (profile.avoidedIngredients || []).join('、')
    })
  },

  onChooseAvatar(event) {
    const savedPath = storage.saveAvatarFile(event.detail.avatarUrl)
    storage.saveProfile({ avatarPath: savedPath })
    this.loadProfile()
  },

  onNicknameInput(event) {
    this.setData({ nicknameInput: String(event.detail.value || '').slice(0, 24) })
  },

  onNicknameBlur(event) {
    // 部分真机选择“使用微信昵称”时只在失焦后返回最终值。
    // 空值不在这里覆盖已有资料；用户仍可通过保存按钮主动清空。
    const value = event && event.detail ? String(event.detail.value || '') : ''
    if (value) {
      this.setData({ nicknameInput: value.slice(0, 24) })
    }
  },

  persistNickname(value, showToast) {
    const nickname = String(value || '').trim().slice(0, 24)
    const profile = storage.saveProfile({ nickname })
    this.setData({ nicknameInput: nickname, profile })
    if (showToast) {
      wx.showToast({ title: '资料已保存', icon: 'success' })
    }
  },

  saveNickname(event) {
    const detailValue = event && event.detail ? event.detail.value : undefined
    let submittedValue
    if (typeof detailValue === 'string') {
      submittedValue = detailValue
    } else if (detailValue && detailValue.nickname !== undefined) {
      submittedValue = detailValue.nickname
    }
    const value = submittedValue !== undefined ? submittedValue : this.data.nicknameInput
    this.persistNickname(value, true)
  },

  toggleAllergy(event) {
    const value = event.currentTarget.dataset.value
    const selected = (this.data.profile.allergies || []).slice()
    const index = selected.indexOf(value)
    if (index >= 0) selected.splice(index, 1)
    else selected.push(value)
    const profile = storage.saveProfile({ allergies: selected })
    this.setData({
      profile,
      allergenOptions: ALLERGENS.map(name => ({ name, selected: selected.includes(name) }))
    })
  },

  onAvoidedInput(event) {
    this.setData({ avoidedInput: event.detail.value })
  },

  saveAvoided() {
    const words = this.data.avoidedInput
      .split(/[、,，\s]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 20)
    const profile = storage.saveProfile({ avoidedIngredients: words })
    this.setData({ profile, avoidedInput: words.join('、') })
    wx.showToast({ title: '忌口已保存', icon: 'success' })
  },

  toggleHealthRecommendation(event) {
    const profile = storage.saveProfile({ healthRecommendationEnabled: event.detail.value })
    this.setData({ profile })
  },

  openPrivacy() {
    wx.navigateTo({ url: '/features/privacy/privacy' })
  },

  openSpecialHealth() {
    wx.navigateTo({ url: '/features/special-health/special-health' })
  },

  openNotifications() {
    wx.navigateTo({ url: '/features/notifications/notifications' })
  },

  clearHealth() {
    wx.showModal({
      title: '清除健康记录？',
      content: '身高、体重历史、人群信息、孕期信息和健康状况将被删除，其他资料和菜谱不受影响。',
      confirmColor: '#b44335',
      success: result => {
        if (result.confirm) {
          storage.clearHealthData()
          this.loadProfile()
          wx.showToast({ title: '健康记录已清除', icon: 'success' })
        }
      }
    })
  },

  clearDraws() {
    wx.showModal({
      title: '清除抽取历史？',
      content: '最近抽到的记录将被删除。',
      confirmColor: '#b44335',
      success: result => {
        if (result.confirm) {
          storage.clearDrawHistory()
          wx.showToast({ title: '抽取历史已清除', icon: 'success' })
        }
      }
    })
  },

  clearAll() {
    wx.showModal({
      title: '清除全部个人数据？',
      content: '头像昵称、健康记录、偏好、收藏、自定义菜谱、内置菜谱修改和抽取历史都会删除，且无法恢复。',
      confirmText: '彻底清除',
      confirmColor: '#b44335',
      success: result => {
        if (result.confirm) {
          storage.clearAllPersonalData()
          wx.reLaunch({ url: '/pages/index/index' })
        }
      }
    })
  }
})
