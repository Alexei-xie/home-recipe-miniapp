const storage = require('../../utils/storage')
const MAX_IMAGE_BYTES = 1024 * 1024

function invoke(target, method, options) {
  return new Promise((resolve, reject) => target[method](Object.assign({}, options, { success: resolve, fail: reject })))
}

async function prepareRecipeImage(src) {
  if (!wx.getImageInfo || !wx.compressImage) throw new Error('当前微信不支持图片优化，请更新后重试')
  const info = await invoke(wx, 'getImageInfo', { src })
  if (!info.width || !info.height) throw new Error('无法读取图片尺寸，请换一张图片')
  const ratio = Math.min(1, 1280 / Math.max(info.width, info.height))
  const compressed = await invoke(wx, 'compressImage', {
    src, quality: 72, compressedWidth: Math.max(1, Math.round(info.width * ratio)),
    compressedHeight: Math.max(1, Math.round(info.height * ratio))
  })
  const fs = wx.getFileSystemManager()
  const result = await invoke(fs, 'getFileInfo', { filePath: compressed.tempFilePath })
  if (result.size > MAX_IMAGE_BYTES) throw new Error('优化后图片仍超过1MB，请裁剪后重试')
  // 部分基础库不支持指定压缩尺寸，必须检查结果，不能直接保存大图。
  const output = await invoke(wx, 'getImageInfo', { src: compressed.tempFilePath })
  if (Math.max(output.width, output.height) > 1280) throw new Error('图片尺寸仍过大，请裁剪或更新微信后重试')
  return compressed.tempFilePath
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function getImageUsage() {
  const directory = `${wx.env.USER_DATA_PATH}/recipe_images`
  const fs = wx.getFileSystemManager()
  let files
  try { files = (await invoke(fs, 'readdir', { dirPath: directory })).files } catch (error) {
    // 目录尚未创建时没有用户菜谱图片；其他读取失败不可伪装为空。
    if (/no such|not exist|ENOENT/i.test(error.errMsg || error.message || '')) return { files: [], bytes: 0, unused: [] }
    throw new Error('无法读取图片目录，请稍后重试')
  }
  const referenced = storage.getReferencedUserFiles()
  const entries = []
  for (const name of files) {
    if (!/^recipe_[a-z0-9_]+\.(?:jpg|jpeg|png|webp)$/.test(name)) continue
    const filePath = `${directory}/${name}`
    const { stats } = await invoke(fs, 'stat', { path: filePath })
    if (!stats.isFile()) continue
    const time = Number(stats.lastModifiedTime) || 0
    const modifiedAt = time < 1e12 ? time * 1000 : time
    entries.push({ filePath, bytes: stats.size, referenced: referenced.has(filePath),
      canClean: !referenced.has(filePath) && modifiedAt > 0 && Date.now() - modifiedAt > 24 * 60 * 60 * 1000 })
  }
  return { files: entries, bytes: entries.reduce((sum, item) => sum + item.bytes, 0), unused: entries.filter(item => item.canClean) }
}

async function cleanUnusedImages() {
  const usage = await getImageUsage()
  let removed = 0
  for (const item of usage.unused) {
    // 确认后重新核对当前引用，草稿和其他菜谱共用的文件不能删除。
    if (storage.getReferencedUserFiles().has(item.filePath)) continue
    await invoke(wx.getFileSystemManager(), 'unlink', { filePath: item.filePath })
    removed += 1
  }
  return removed
}

module.exports = { invoke, prepareRecipeImage, formatBytes, getImageUsage, cleanUnusedImages, MAX_IMAGE_BYTES }
