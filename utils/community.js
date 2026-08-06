const storage = require('./storage')

const FUNCTION_NAME = 'recipeCommunity'

function isAvailable() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'
}

function cloudError(message, code) {
  const error = new Error(message || '云端服务暂不可用')
  error.code = code || 'COMMUNITY_ERROR'
  return error
}

function call(action, data) {
  if (!isAvailable()) return Promise.reject(cloudError('当前微信版本不支持云端菜谱服务', 'CLOUD_UNAVAILABLE'))
  return wx.cloud.callFunction({
    name: FUNCTION_NAME,
    data: Object.assign({ action }, data || {})
  }).then(result => {
    const payload = result && result.result
    if (!payload || payload.ok !== true) {
      throw cloudError(payload && payload.message, payload && payload.code)
    }
    return payload.data || {}
  })
}

function isLocalFile(filePath) {
  return Boolean(filePath && !/^cloud:\/\//.test(filePath) && !/^https?:\/\//i.test(filePath))
}

function getImageSuffix(filePath) {
  const match = String(filePath || '').match(/\.(jpe?g|png|webp)(?:\?|$)/i)
  return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg'
}

function uploadCoverIfNeeded(recipe) {
  const coverImage = recipe && recipe.coverImage || ''
  if (!isLocalFile(coverImage)) return Promise.resolve(/^cloud:\/\//.test(coverImage) ? coverImage : '')
  if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
    return Promise.reject(cloudError('当前微信版本不支持上传图片', 'UPLOAD_UNAVAILABLE'))
  }
  const cloudPath = `community-recipe-covers/${Date.now()}_${Math.random().toString(36).slice(2, 10)}${getImageSuffix(coverImage)}`
  return wx.cloud.uploadFile({ cloudPath, filePath: coverImage }).then(result => result.fileID || '')
}

function submitRecipe(recipe, profile) {
  return uploadCoverIfNeeded(recipe).then(coverFileId => call('submit', {
    recipe: Object.assign({}, recipe, { coverImage: coverFileId }),
    publisherName: String(profile && profile.nickname || '社区用户').trim().slice(0, 24)
  }))
}

function syncPublicRecipes() {
  const current = storage.getCommunitySync()
  const recipes = []
  const removedIds = []

  function pullPage(params) {
    return call('pull', params).then(data => {
      if (data.unchanged) return data
      // 兼容尚未升级的云函数：旧协议直接返回完整 recipes 数组。
      if (!data.mode) return data
      recipes.push(...(data.recipes || []))
      removedIds.push(...(data.removedIds || []))
      if (!data.hasMore) return data
      if (data.mode === 'full') {
        return pullPage({ knownVersion: 0, cursor: Number(data.nextCursor) || recipes.length })
      }
      return pullPage({ knownVersion: Number(data.nextVersion) || params.knownVersion })
    })
  }

  return pullPage({ knownVersion: current.version }).then(data => {
    if (!data.unchanged) {
      const syncInfo = { version: Number(data.version) || current.version, syncedAt: Date.now() }
      if (!data.mode) storage.replaceCommunityRecipes(data.recipes || [], syncInfo)
      else if (data.mode === 'full') storage.replaceCommunityRecipes(recipes, syncInfo)
      else storage.applyCommunityRecipeDelta(recipes, removedIds, syncInfo)
    }
    return {
      unchanged: Boolean(data.unchanged),
      count: storage.getCommunityRecipes().length,
      version: Number(data.version) || current.version
    }
  })
}

function getStatus(seenAt) {
  return call('status', { seenAt: Number(seenAt) || 0 })
}

function getMySubmissions() {
  return call('mySubmissions')
}

function getReviewQueue() {
  return call('reviewQueue')
}

function reviewSubmission(submissionId, decision, reason) {
  return call('review', {
    submissionId,
    decision,
    reason: String(reason || '').trim().slice(0, 200)
  })
}

function removeSubmission(submissionId) {
  return call('removeSubmission', { submissionId })
}

module.exports = {
  FUNCTION_NAME,
  isAvailable,
  submitRecipe,
  syncPublicRecipes,
  getStatus,
  getMySubmissions,
  getReviewQueue,
  reviewSubmission,
  removeSubmission
}
