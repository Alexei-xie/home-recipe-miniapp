const community = require('../../utils/community')
const storage = require('../../utils/storage')

const STATUS_COPY = {
  pending: { label: '等待审核', className: 'pending' },
  approved: { label: '审核通过', className: 'approved' },
  rejected: { label: '未通过', className: 'rejected' }
}

function formatTime(timestamp) {
  const date = new Date(Number(timestamp) || 0)
  if (!date.getTime()) return ''
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function decorateSubmission(item) {
  const status = STATUS_COPY[item.status] || STATUS_COPY.pending
  return Object.assign({}, item, {
    statusLabel: status.label,
    statusClass: status.className,
    timeText: formatTime(item.updatedAt || item.createdAt)
  })
}

function decorateReview(item) {
  const recipe = item.recipe || {}
  return Object.assign({}, item, {
    timeText: formatTime(item.createdAt),
    ingredientText: (recipe.ingredients || []).map(ingredient => `${ingredient.name} ${ingredient.amount}`).join('、'),
    allergenText: recipe.allergensReviewed
      ? ((recipe.allergens || []).join('、') || '投稿者已核对：无')
      : '投稿者尚未核对',
    expanded: false
  })
}

Page({
  data: {
    loading: true,
    errorText: '',
    isAdmin: false,
    mySubmissions: [],
    reviewQueue: [],
    pendingCount: 0
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  loadData() {
    if (!community.isAvailable()) {
      this.setData({ loading: false, errorText: '当前微信版本不支持云端菜谱服务。' })
      return Promise.resolve()
    }
    const sync = storage.getCommunitySync()
    this.setData({ loading: true, errorText: '' })
    return community.getStatus(sync.noticeSeenAt).then(status => {
      const tasks = [community.getMySubmissions()]
      if (status.isAdmin) tasks.push(community.getReviewQueue())
      return Promise.all(tasks).then(results => {
        const own = results[0] || {}
        const queue = results[1] || {}
        this.setData({
          loading: false,
          isAdmin: Boolean(status.isAdmin),
          pendingCount: Number(status.pendingCount) || 0,
          mySubmissions: (own.submissions || []).map(decorateSubmission),
          reviewQueue: (queue.submissions || []).map(decorateReview)
        })
        storage.markCommunityNoticesSeen()
        wx.removeTabBarBadge({ index: 4 })
      })
    }).catch(error => {
      this.setData({ loading: false, errorText: error.message || '通知加载失败，请下拉重试。' })
    })
  },

  toggleReviewDetail(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`reviewQueue[${index}].expanded`]: !this.data.reviewQueue[index].expanded })
  },

  approve(event) {
    const item = this.data.reviewQueue[Number(event.currentTarget.dataset.index)]
    if (!item) return
    wx.showModal({
      title: '审核通过？',
      content: `「${item.recipe.name}」将进入公共菜谱库，所有用户下拉同步后都能查看。`,
      confirmText: '确认发布',
      success: result => {
        if (result.confirm) this.performReview(item.id, 'approve', '')
      }
    })
  },

  reject(event) {
    const item = this.data.reviewQueue[Number(event.currentTarget.dataset.index)]
    if (!item) return
    wx.showModal({
      title: '填写未通过原因',
      editable: true,
      placeholderText: '例如：步骤不完整，请补充火候和时间',
      confirmText: '确认驳回',
      success: result => {
        if (!result.confirm) return
        const reason = String(result.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写原因', icon: 'none' })
          return
        }
        this.performReview(item.id, 'reject', reason)
      }
    })
  },

  performReview(submissionId, decision, reason) {
    wx.showLoading({ title: decision === 'approve' ? '正在发布' : '正在处理', mask: true })
    community.reviewSubmission(submissionId, decision, reason).then(() => {
      if (decision === 'approve') return community.syncPublicRecipes()
      return null
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: decision === 'approve' ? '已发布' : '已驳回', icon: 'success' })
      this.loadData()
    }).catch(error => {
      wx.hideLoading()
      wx.showModal({ title: '审核失败', content: error.message || '请稍后重试', showCancel: false })
    })
  },

  removeOwnSubmission(event) {
    const item = this.data.mySubmissions[Number(event.currentTarget.dataset.index)]
    if (!item) return
    const published = item.status === 'approved'
    if (published) {
      wx.showActionSheet({
        itemList: ['仅下架公开版本', '下架并删除本机副本'],
        success: result => this.confirmRemoveSubmission(item, true, result.tapIndex === 1)
      })
      return
    }
    this.confirmRemoveSubmission(item, false, false)
  },

  confirmRemoveSubmission(item, published, removeLocal) {
    let removedLocalRecipe = false
    wx.showModal({
      title: published ? '下架并删除？' : '删除这次投稿？',
      content: published
        ? (removeLocal
          ? '公共菜谱将下架，云端投稿和封面会删除；当前设备保存的“我的菜谱”副本也会一并删除。'
          : '只下架公共菜谱并删除云端投稿和封面；当前设备保存的“我的菜谱”仍会保留在首页。')
        : '云端投稿和已上传封面将被删除，本机菜谱不受影响。',
      confirmText: published ? '下架删除' : '确认删除',
      confirmColor: '#b44335',
      success: result => {
        if (!result.confirm) return
        wx.showLoading({ title: '正在删除', mask: true })
        community.removeSubmission(item.id).then(result => {
          const localRecipeId = result.clientRecipeId || item.clientRecipeId
          if (removeLocal && localRecipeId) {
            storage.deleteCustomRecipe(localRecipeId)
            removedLocalRecipe = true
          }
          if (published) return community.syncPublicRecipes()
          return null
        }).then(() => {
          wx.hideLoading()
          if (removeLocal && !removedLocalRecipe) {
            wx.showModal({
              title: '公开版本已下架',
              content: '这是一条旧投稿，未记录本机菜谱关联。请到“收藏菜谱 → 我的菜谱”中手动删除本机副本。',
              showCancel: false
            })
          } else {
            wx.showToast({ title: published ? '已下架' : '已删除', icon: 'success' })
          }
          this.loadData()
        }).catch(error => {
          wx.hideLoading()
          wx.showModal({ title: '删除失败', content: error.message || '请稍后重试', showCancel: false })
        })
      }
    })
  }
})
