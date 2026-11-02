const storage = require('./storage')

const FUNCTION_NAME = 'recipeCommunity'
let syncInFlight = null

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
  if (!coverImage || /^https?:\/\//i.test(coverImage)) return Promise.resolve({ fileId: '', token: '' })
  if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
    return Promise.reject(cloudError('当前微信版本不支持上传图片', 'UPLOAD_UNAVAILABLE'))
  }
  // 复制社区菜谱也重新上传一份，避免两个投稿共享封面后互相影响删除。
  const localPath = isLocalFile(coverImage)
    ? Promise.resolve(coverImage)
    : wx.cloud.downloadFile({ fileID: coverImage }).then(result => result.tempFilePath)
  return localPath.then(filePath => call('prepareCover', { suffix: getImageSuffix(coverImage).slice(1) }).then(ticket =>
    wx.cloud.uploadFile({ cloudPath: ticket.cloudPath, filePath }).then(result => ({ fileId: result.fileID || '', token: ticket.token }))
  ))
}

function submitRecipe(recipe, profile) {
  // 兼容旧云函数的白名单：把复制来源及许可同时保留在公开烹饪提示中。
  const attribution = []
  if (recipe.referenceName && /^https:\/\//.test(recipe.referenceUrl || '')) attribution.push(`中文改编来源：${recipe.referenceName} ${recipe.referenceUrl}`)
  if (recipe.sourceLicense && /^https:\/\//.test(recipe.sourceLicenseUrl || '')) attribution.push(`改编内容按 ${recipe.sourceLicense} 提供：${recipe.sourceLicenseUrl}`)
  const publicRecipe = Object.assign({}, recipe, { tips: Array.from(new Set(attribution.concat(recipe.tips || []))).slice(0, 12) })
  return uploadCoverIfNeeded(recipe).then(cover => call('submit', {
    coverToken: cover.token,
    recipe: Object.assign({}, publicRecipe, { coverImage: cover.fileId }),
    publisherName: String(profile && profile.nickname || '社区用户').trim().slice(0, 24)
  }).catch(async error => {
    if (cover.token && cover.fileId) {
      try { await call('discardCover', { coverToken: cover.token, fileId: cover.fileId }) } catch (cleanupError) { console.warn('[community] 未使用封面清理失败', cleanupError.code || '') }
    }
    throw error
  }))
}

function syncPublicRecipes() {
  if (syncInFlight) return syncInFlight
  const current = storage.getCommunitySync()
  const recipes = []
  const removedIds = []
  let snapshotVersion
  let mode
  let restarts = 0
  let pages = 0

  function restart() {
    if (++restarts > 2) throw cloudError('菜谱正在更新，请稍后重新同步', 'SYNC_CHANGED')
    recipes.length = 0
    removedIds.length = 0
    snapshotVersion = undefined
    mode = null
    return pullPage({ knownVersion: 0 })
  }

  function pullPage(params) {
    if (++pages > 200) return Promise.reject(cloudError('同步分页过多，请稍后重试', 'SYNC_LIMIT'))
    return call('pull', Object.assign({ syncProtocol: current.syncProtocol || 0 }, params,
      snapshotVersion === undefined ? {} : { snapshotVersion })).then(data => {
      if (data.restart) return restart()
      if (data.unchanged) return data
      // 兼容尚未升级的云函数：旧协议直接返回完整 recipes 数组。
      if (!data.mode) return data
      if ((mode && mode !== data.mode) || (snapshotVersion !== undefined && snapshotVersion !== Number(data.version))) return restart()
      mode = data.mode
      snapshotVersion = Number(data.version) || 0
      recipes.push(...(data.recipes || []))
      removedIds.push(...(data.removedIds || []))
      if (!data.hasMore) return data
      if (data.mode === 'full') {
        const cursor = Number(data.nextCursor) || recipes.length
        if (cursor <= Number(params.cursor || 0)) throw cloudError('同步游标异常，请重新同步', 'INVALID_CURSOR')
        return pullPage({ knownVersion: 0, cursor })
      }
      const nextVersion = Number(data.nextVersion)
      if (!(nextVersion > Number(params.knownVersion || 0))) throw cloudError('同步版本异常，请重新同步', 'INVALID_VERSION')
      return pullPage({ knownVersion: nextVersion })
    })
  }

  const catalogRequest = call('getCatalog').catch(error => {
    if (error.code === 'UNKNOWN_ACTION') return null
    throw error
  })
  syncInFlight = Promise.all([pullPage({ knownVersion: current.version }), catalogRequest]).then(([data, catalogData]) => {
    if (!data.unchanged) {
      const syncInfo = { version: Number(data.version) || 0, syncedAt: Date.now(), syncProtocol: Number(data.syncProtocol) || 0 }
      if (!data.mode) storage.replaceCommunityRecipes(data.recipes || [], syncInfo)
      else if (data.mode === 'full') storage.replaceCommunityRecipes(recipes, syncInfo)
      else storage.applyCommunityRecipeDelta(recipes, removedIds, syncInfo)
    }
    if (!storage.flushCommunityCache()) throw cloudError('菜谱缓存保存失败，请清理本地空间后重试', 'CACHE_WRITE_FAILED')
    const catalogChanged = Boolean(catalogData && catalogData.catalog && storage.saveRecipeCatalog(catalogData.catalog))
    return {
      catalogChanged,
      unchanged: Boolean(data.unchanged),
      count: storage.getCommunityRecipes().length,
      version: Number(data.version) || current.version
    }
  }).finally(() => { syncInFlight = null })
  return syncInFlight
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

function getRecipeCatalog() {
  return call('getCatalog').then(data => {
    storage.saveRecipeCatalog(data.catalog)
    return storage.getRecipeCatalog()
  })
}

function updateRecipeCatalog(change) {
  return call('updateCatalog', change).then(data => {
    storage.saveRecipeCatalog(data.catalog)
    return storage.getRecipeCatalog()
  })
}

module.exports = {
  getRecipeCatalog,
  updateRecipeCatalog,
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
