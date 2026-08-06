// CloudBase 环境 ID 不是密钥，可在微信开发者工具的“云开发”控制台查看。
// 创建环境后填入，例如：today-eat-8gxxxxxx。留空时小程序自动使用本地兜底插画。
const CLOUDBASE_ENV_ID = 'cloud1-d8gd0cz7te6173bb3'
// 云文件 ID 需要使用云存储返回的完整 fileID 前缀，不能只填写数字 AppID。
// 该值由环境的云存储访问域名 636c-cloud1-d8gd0cz7te6173bb3-1460690589 确认。
const CLOUDBASE_FILE_ID_PREFIX = 'cloud://cloud1-d8gd0cz7te6173bb3.636c-cloud1-d8gd0cz7te6173bb3-1460690589'
const BUILTIN_COVER_DIRECTORY = 'recipe-covers'
const RECIPE_STEP_IMAGE_DIRECTORY = 'recipe-steps'
const RECIPE_SOURCE_COVER_DIRECTORY = 'recipe-source-covers'

function isCloudCoverEnabled() {
  return Boolean(CLOUDBASE_ENV_ID && CLOUDBASE_FILE_ID_PREFIX)
}

function getBuiltinCoverFileId(recipeId) {
  if (!isCloudCoverEnabled() || !recipeId) return ''
  return `${CLOUDBASE_FILE_ID_PREFIX}/${BUILTIN_COVER_DIRECTORY}/${recipeId}.png`
}

function getRecipeStepImageFileId(cloudPath) {
  if (!isCloudCoverEnabled() || !cloudPath || !cloudPath.startsWith(`${RECIPE_STEP_IMAGE_DIRECTORY}/`)) return ''
  return `${CLOUDBASE_FILE_ID_PREFIX}/${cloudPath}`
}

function getRecipeSourceCoverFileId(cloudPath) {
  if (!isCloudCoverEnabled() || !cloudPath || !cloudPath.startsWith(`${RECIPE_SOURCE_COVER_DIRECTORY}/`)) return ''
  return `${CLOUDBASE_FILE_ID_PREFIX}/${cloudPath}`
}

module.exports = {
  CLOUDBASE_ENV_ID,
  CLOUDBASE_FILE_ID_PREFIX,
  BUILTIN_COVER_DIRECTORY,
  RECIPE_STEP_IMAGE_DIRECTORY,
  RECIPE_SOURCE_COVER_DIRECTORY,
  isCloudCoverEnabled,
  getBuiltinCoverFileId,
  getRecipeStepImageFileId,
  getRecipeSourceCoverFileId
}
