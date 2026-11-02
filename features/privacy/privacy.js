const storage = require('../../utils/storage')
const health = require('../../utils/health')
const backup = require('../utils/local-backup')
const files = require('../utils/local-files')

Page({
  data: {
    summary: null,
    busy: false,
    imageUsageText: '正在统计…',
    unusedImageCount: 0,
    spaceWarning: ''
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
    this.refreshSpace()
  },

  async refreshSpace() {
    try {
      const usage = await files.getImageUsage()
      this.setData({ imageUsageText: `${usage.files.length}张 · ${files.formatBytes(usage.bytes)}`,
        unusedImageCount: usage.unused.length,
        spaceWarning: usage.bytes >= 50 * 1024 * 1024 ? '本地图片已超过50MB，建议备份并清理不用的内容。' : '' })
    } catch (error) { this.setData({ imageUsageText: '暂时无法统计', spaceWarning: error.message }) }
  },

  exportBackup() {
    if (this.data.busy) return
    if (!wx.shareFileMessage) return this.showError('请更新微信后使用文件导出功能')
    wx.showModal({ title: '导出个人备份',
      content: '备份含昵称、健康记录、偏好、收藏、个人菜谱和图片，为未加密文件（最多12MB），不含社区缓存和编辑草稿。请仅发送给自己或可信位置妥善保管；本程序不会上传备份至云端。',
      confirmText: '生成备份', success: async result => {
        if (!result.confirm || this.data.busy) return
        this.setData({ busy: true })
        wx.showLoading({ title: '正在整理备份', mask: true })
        try {
          const filePath = await backup.createBackup()
          wx.hideLoading()
          await files.invoke(wx, 'shareFileMessage', { filePath, fileName: '今日食签-个人备份.json' })
        } catch (error) { if (!/cancel/i.test(error.errMsg || '')) this.showError(error.message || '备份未导出，请重试') }
        finally { wx.hideLoading(); this.setData({ busy: false }) }
      }
    })
  },

  async importBackup() {
    if (this.data.busy) return
    if (!wx.chooseMessageFile) return this.showError('请更新微信后使用文件导入功能')
    this.setData({ busy: true })
    try {
      const result = await files.invoke(wx, 'chooseMessageFile', { count: 1, type: 'file', extension: ['json'] })
      const file = result.tempFiles && result.tempFiles[0]
      if (!file || file.size > backup.MAX_BACKUP_BYTES) throw new Error('请选择不超过12MB的个人备份JSON文件')
      const text = await files.invoke(wx.getFileSystemManager(), 'readFile', { filePath: file.path, encoding: 'utf8' })
      const parsed = backup.validateBackup(text.data)
      const choice = await files.invoke(wx, 'showModal', {
        title: '确认恢复备份？',
        content: `备份内有${parsed.data.customRecipes.length}道个人菜谱、${parsed.data.weightRecords.length}条体重记录。将替换本机资料、记录、收藏及个人菜谱，并清除编辑草稿；公共菜谱不变。建议先导出当前数据，替换后无法撤销。`,
        confirmText: '确认替换', confirmColor: '#b44335'
      })
      if (!choice.confirm) return
      wx.showLoading({ title: '正在恢复', mask: true })
      await backup.restoreBackup(parsed)
      wx.hideLoading()
      wx.showModal({ title: '恢复完成', content: '个人资料、记录和菜谱已恢复到本机。', showCancel: false,
        success: () => wx.reLaunch({ url: '/pages/index/index' }) })
    } catch (error) { if (!/cancel/i.test(error.errMsg || '')) this.showError(error.message || '无法导入该备份') }
    finally { wx.hideLoading(); this.setData({ busy: false }) }
  },

  cleanImages() {
    if (this.data.busy) return
    wx.showModal({ title: '清理无引用旧图片？',
      content: '只清理没有被菜谱或草稿引用、且已超过24小时的菜谱图片，不删除现用封面、步骤图和头像。清理的文件无法恢复。',
      confirmText: '确认清理', success: async result => {
        if (!result.confirm || this.data.busy) return
        this.setData({ busy: true })
        try {
          const count = await files.cleanUnusedImages()
          wx.showToast({ title: count ? `已清理${count}张` : '没有可清理图片', icon: 'none' })
          await this.refreshSpace()
        } catch (error) { this.showError('部分图片清理失败，请刷新统计后重试') }
        finally { this.setData({ busy: false }) }
      }
    })
  },

  showError(message) {
    wx.showModal({ title: '操作未完成', content: message, showCancel: false })
  }
})
