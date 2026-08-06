// 内置菜谱优先从 CloudBase 加载已核对的来源成品图，其次使用原有云端插画，失败时自动使用本地兜底插画。
// 用户自己上传的封面仍只保存在其当前设备，并始终优先显示。
const cloudbase = require('../config/cloudbase')

const CARTOON_COVERS = {
  vegetable: '/assets/recipe-covers/tomato-eggs.webp',
  seafood: '/assets/recipe-covers/seafood.webp',
  drink: '/assets/recipe-covers/cold-drink.webp',
  dessert: '/assets/recipe-covers/dessert.webp',
  chicken: '/assets/recipe-covers/tomato-eggs.webp',
  meat: '/assets/recipe-covers/tomato-eggs.webp',
  soup: '/assets/recipe-covers/tomato-eggs.webp',
  staple: '/assets/recipe-covers/tomato-eggs.webp',
  spicy: '/assets/recipe-covers/tomato-eggs.webp'
}

const SEAFOOD_RECIPE_IDS = new Set([
  'r004', 'r015', 'r031', 'r041', 'r063', 'r064', 'r068', 'r072',
  'r101', 'r102', 'r103', 'r104', 'r105', 'r106', 'r107', 'r108',
  'r109', 'r110', 'r111', 'r112'
])

// CloudBase 私有文件返回的是有时效的 HTTPS 地址。缓存必须跟随 maxAge 失效，
// 否则小程序长时间驻留后台后会继续使用已经过期的地址。
const DEFAULT_CLOUD_URL_TTL_MS = 60 * 60 * 1000
const CACHE_EXPIRY_GUARD_MS = 60 * 1000
const cloudUrlCache = Object.create(null)
const stepImageUrlCache = Object.create(null)
const cloudCoverInFlight = Object.create(null)
const stepImageInFlight = Object.create(null)

function canUseCloudCover() {
  return cloudbase.isCloudCoverEnabled() && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.getTempFileURL === 'function'
}

function normalizeMaxAgeMs(maxAge) {
  const value = Number(maxAge)
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CLOUD_URL_TTL_MS
  // 不同版本 SDK 中 maxAge 曾以秒或毫秒返回。小于等于 7 天时按秒处理，
  // 更大的值按毫秒处理，可兼容常见的 7200 和 7200000 两种返回值。
  return value <= 7 * 24 * 60 * 60 ? value * 1000 : value
}

function createCacheEntry(file, fileId) {
  if (!file || !file.tempFileURL) return null
  const now = Date.now()
  return {
    url: file.tempFileURL,
    fileId: file.fileID || fileId || '',
    expiresAt: now + normalizeMaxAgeMs(file.maxAge)
  }
}

function getValidCacheEntry(cache, key) {
  const entry = cache[key]
  if (!entry) return null
  // 兼容升级前同一运行周期内遗留的字符串缓存，但只短暂使用。
  if (typeof entry === 'string') {
    cache[key] = {
      url: entry,
      fileId: '',
      expiresAt: Date.now() + DEFAULT_CLOUD_URL_TTL_MS
    }
    return cache[key]
  }
  if (!entry.url || entry.expiresAt <= Date.now() + CACHE_EXPIRY_GUARD_MS) {
    delete cache[key]
    return null
  }
  return entry
}

function getCachedCloudCover(recipeId, expectedFileId) {
  const entry = getValidCacheEntry(cloudUrlCache, recipeId)
  if (entry && expectedFileId && entry.fileId && entry.fileId !== expectedFileId) {
    delete cloudUrlCache[recipeId]
    return ''
  }
  return entry ? entry.url : ''
}

function getCloudCoverFallback(recipe) {
  return recipe && recipe.source === 'builtin' ? getBuiltinCartoonCover(recipe) : ''
}

function getPreferredCoverFileId(recipe) {
  if (!recipe) return ''
  if (/^cloud:\/\//.test(recipe.coverImage || '')) return recipe.coverImage
  if (recipe.source !== 'builtin') return ''
  if (recipe.sourceCoverCloudPath) return cloudbase.getRecipeSourceCoverFileId(recipe.sourceCoverCloudPath)
  if (/^r\d{3}$/.test(recipe.id)) return cloudbase.getBuiltinCoverFileId(recipe.id)
  return ''
}

function invalidateCloudCover(recipeId, failedUrl) {
  const entry = cloudUrlCache[recipeId]
  if (!entry) return
  const cachedUrl = typeof entry === 'string' ? entry : entry.url
  if (!failedUrl || cachedUrl === failedUrl) delete cloudUrlCache[recipeId]
}

function loadCloudCovers(recipes, options = {}) {
  const forceRecipeIds = new Set(options.forceRecipeIds || [])
  forceRecipeIds.forEach(recipeId => delete cloudUrlCache[recipeId])
  const pending = (recipes || []).filter(recipe =>
    recipe && getPreferredCoverFileId(recipe) && !getCachedCloudCover(recipe.id, getPreferredCoverFileId(recipe))
  )
  if (!pending.length || !canUseCloudCover()) return Promise.resolve(cloudUrlCache)
  const unique = []
  const waiting = []
  const ids = new Set()
  pending.forEach(recipe => {
    if (ids.has(recipe.id)) return
    ids.add(recipe.id)
    if (cloudCoverInFlight[recipe.id]) waiting.push(cloudCoverInFlight[recipe.id])
    else unique.push(recipe)
  })
  if (unique.length) {
    const request = wx.cloud.getTempFileURL({
      fileList: unique.map(getPreferredCoverFileId)
    }).then(result => {
      ;(result.fileList || []).forEach((file, index) => {
        const recipe = unique[index]
        const entry = createCacheEntry(file, recipe && getPreferredCoverFileId(recipe))
        if (recipe && entry) cloudUrlCache[recipe.id] = entry
        else if (file) console.warn('[recipe-cover] 云端封面不可用', unique[index].id, file.errMsg || file.status)
      })
    }).catch(error => {
      console.warn('[recipe-cover] 获取云端封面失败', error)
    })
    unique.forEach(recipe => { cloudCoverInFlight[recipe.id] = request })
    waiting.push(request.then(() => {
      unique.forEach(recipe => {
        if (cloudCoverInFlight[recipe.id] === request) delete cloudCoverInFlight[recipe.id]
      })
    }))
  }
  return Promise.all(waiting).then(() => cloudUrlCache)
}

function getCachedStepImage(cloudPath) {
  const entry = getValidCacheEntry(stepImageUrlCache, cloudPath)
  return entry ? entry.url : ''
}

function invalidateStepImageByUrl(failedUrl) {
  if (!failedUrl) return []
  const invalidatedPaths = []
  Object.keys(stepImageUrlCache).forEach(cloudPath => {
    const entry = stepImageUrlCache[cloudPath]
    const cachedUrl = typeof entry === 'string' ? entry : entry && entry.url
    if (cachedUrl === failedUrl) {
      delete stepImageUrlCache[cloudPath]
      invalidatedPaths.push(cloudPath)
    }
  })
  return invalidatedPaths
}

function hydrateRecipeStepImages(recipe) {
  if (!recipe || recipe.source !== 'builtin' || recipe.isLocalOverride) return Promise.resolve(recipe)
  const steps = recipe.steps || []
  const paths = []
  steps.forEach(step => (step.imageCloudPaths || []).forEach(item => paths.push(item)))
  ;(recipe.processImageCloudPaths || []).forEach(item => paths.push(item))
  if (!paths.length || !canUseCloudCover()) return Promise.resolve(Object.assign({}, recipe, {
    steps: steps.map(step => Object.assign({}, step, { images: [] })),
    processImages: []
  }))
  const pending = Array.from(new Set(paths.filter(item => !getCachedStepImage(item))))
  const waiting = pending.map(item => stepImageInFlight[item]).filter(Boolean)
  const requestPaths = pending.filter(item => !stepImageInFlight[item])
  if (requestPaths.length) {
    const request = wx.cloud.getTempFileURL({ fileList: requestPaths.map(item => cloudbase.getRecipeStepImageFileId(item)) })
      .then(result => {
        ;(result.fileList || []).forEach((file, index) => {
          const cloudPath = requestPaths[index]
          const entry = createCacheEntry(file, cloudbase.getRecipeStepImageFileId(cloudPath))
          if (entry) stepImageUrlCache[cloudPath] = entry
          else if (file) console.warn('[recipe-step] 步骤图不可用', requestPaths[index], file.errMsg || file.status)
        })
      })
      .catch(error => console.warn('[recipe-step] 获取步骤图失败', error))
    requestPaths.forEach(item => { stepImageInFlight[item] = request })
    waiting.push(request.then(() => {
      requestPaths.forEach(item => {
        if (stepImageInFlight[item] === request) delete stepImageInFlight[item]
      })
    }))
  }
  return Promise.all(waiting).then(() => Object.assign({}, recipe, {
    steps: steps.map(step => Object.assign({}, step, {
      images: (step.imageCloudPaths || []).map(getCachedStepImage).filter(Boolean)
    })),
    processImages: (recipe.processImageCloudPaths || []).map(getCachedStepImage).filter(Boolean)
  }))
}

const ILLUSTRATION_PATTERNS = {
  seafood: /虾|鱼|蛤|贝|蟹|鱿|生蚝|鲍|扇贝|鲈|鳕|三文鱼|鲳|黄花|带鱼|鲫|石斑|马鲛|田螺|海参|蛏|墨鱼/,
  soup: /汤|羹|粥|炖|煲/,
  staple: /饭|面|粉|饺|包|饼|粽|馒头|三明治|米线|河粉|乌冬|意面|焖饭|年糕|烧麦|馄饨|面包/,
  spicy: /辣|麻|剁椒|泡椒|川|湘|傣|咖喱|冬阴功|酸辣|水煮|干锅|麻婆|香锅/,
  chicken: /鸡|凤爪|翅根|鸡翅|鸡腿/,
  meat: /牛|猪|羊|肉|排骨|腊|里脊|猪肝|猪蹄|肉丸|肥肠|培根|火腿/
}

function getRecipeSearchText(recipe) {
  if (!recipe) return ''
  const ingredientNames = (recipe.ingredients || []).map(item => item && item.name)
  return [
    recipe.name,
    recipe.cuisine,
    recipe.mealType,
    ...(recipe.ingredientKeywords || []),
    ...ingredientNames
  ].filter(Boolean).join(' ')
}

function getRecipeIllustrationKey(recipe) {
  if (!recipe) return 'vegetable'
  const text = getRecipeSearchText(recipe)
  if (recipe.mealType === '饮品') return 'drink'
  if (recipe.mealType === '小吃甜品') return 'dessert'
  if (SEAFOOD_RECIPE_IDS.has(recipe.id) || ILLUSTRATION_PATTERNS.seafood.test(text)) return 'seafood'
  if (ILLUSTRATION_PATTERNS.soup.test(text)) return 'soup'
  if (recipe.mealType === '主食' || recipe.mealType === '早餐' || ILLUSTRATION_PATTERNS.staple.test(text)) return 'staple'
  if (ILLUSTRATION_PATTERNS.spicy.test(text)) return 'spicy'
  if (ILLUSTRATION_PATTERNS.chicken.test(text)) return 'chicken'
  if (ILLUSTRATION_PATTERNS.meat.test(text)) return 'meat'
  return 'vegetable'
}

function getBuiltinCartoonCover(recipe) {
  return CARTOON_COVERS[getRecipeIllustrationKey(recipe)] || CARTOON_COVERS.vegetable
}

function getRecipeImageFallback(recipe) {
  return recipe && recipe.source === 'builtin' ? getBuiltinCartoonCover(recipe) : ''
}

function getRecipeInitialImage(recipe) {
  if (!recipe) return ''
  const coverImage = recipe.coverImage || ''
  if (coverImage && !/^cloud:\/\//.test(coverImage)) return coverImage
  return getRecipeImageFallback(recipe)
}

function resolveRecipeImage(recipe) {
  if (!recipe) return Promise.resolve(null)
  if (recipe.coverImage && !/^cloud:\/\//.test(recipe.coverImage)) {
    return Promise.resolve({ url: recipe.coverImage, title: recipe.name })
  }
  const preferredFileId = getPreferredCoverFileId(recipe)
  if (!preferredFileId) {
    const fallback = getRecipeImageFallback(recipe)
    return Promise.resolve(fallback ? { url: fallback, title: recipe.name } : null)
  }
  const cachedUrl = getCachedCloudCover(recipe.id, preferredFileId)
  if (cachedUrl) return Promise.resolve({ url: cachedUrl, title: recipe.name })
  if (!canUseCloudCover()) {
    const fallback = getRecipeImageFallback(recipe)
    return Promise.resolve(fallback ? { url: fallback, title: recipe.name } : null)
  }
  return loadCloudCovers([recipe]).then(() => ({
    url: getCachedCloudCover(recipe.id, preferredFileId) || getCloudCoverFallback(recipe),
    title: recipe.name
  }))
}

function recoverRecipeImage(recipe, failedUrl) {
  if (!recipe) return Promise.resolve('')
  invalidateCloudCover(recipe.id, failedUrl)
  const fileId = getPreferredCoverFileId(recipe)
  if (!fileId || !canUseCloudCover()) return Promise.resolve(getRecipeImageFallback(recipe))
  return loadCloudCovers([recipe], { forceRecipeIds: [recipe.id] }).then(() =>
    getCachedCloudCover(recipe.id, fileId) || getRecipeImageFallback(recipe)
  )
}

function hydrateRecipe(recipe) {
  return Promise.all([resolveRecipeImage(recipe), hydrateRecipeStepImages(recipe)]).then(([image, recipeWithSteps]) => {
    if (!image) return Object.assign({}, recipe, {
      coverImage: recipe.source === 'builtin' ? '' : recipe.coverImage || '',
      steps: recipeWithSteps.steps,
      processImages: recipeWithSteps.processImages
    })
    return Object.assign({}, recipeWithSteps, {
      coverImage: image.url,
      imageSourceUrl: '',
      imageAuthor: '',
      imageLicense: '',
      imageTitle: image.title
    })
  })
}

function hydrateRecipeCover(recipe) {
  return resolveRecipeImage(recipe).then(image => Object.assign({}, recipe, {
    coverImage: image ? image.url : (recipe.source === 'builtin' ? '' : recipe.coverImage || ''),
    imageSourceUrl: '',
    imageAuthor: '',
    imageLicense: '',
    imageTitle: image ? image.title : recipe.name
  }))
}

function hydrateRecipeCovers(recipes, onResolved, limit = 24) {
  const visible = (recipes || []).slice(0, limit)
  return loadCloudCovers(visible).then(() => Promise.all(visible.map((recipe, index) =>
    hydrateRecipeCover(recipe).then(hydrated => {
      if (typeof onResolved === 'function') onResolved(hydrated, index)
      return hydrated
    })
  )))
}

function hydrateRecipes(recipes, onResolved, limit = 24) {
  const visible = (recipes || []).slice(0, limit)
  return loadCloudCovers(visible).then(() => Promise.all(visible.map((recipe, index) =>
    hydrateRecipe(recipe).then(hydrated => {
      if (typeof onResolved === 'function') onResolved(hydrated, index)
      return hydrated
    })
  )))
}

module.exports = {
  CARTOON_COVERS,
  canUseCloudCover,
  loadCloudCovers,
  invalidateCloudCover,
  invalidateStepImageByUrl,
  getRecipeIllustrationKey,
  getBuiltinCartoonCover,
  getRecipeImageFallback,
  getRecipeInitialImage,
  resolveRecipeImage,
  recoverRecipeImage,
  hydrateRecipeStepImages,
  hydrateRecipeCover,
  hydrateRecipeCovers,
  hydrateRecipe,
  hydrateRecipes
}
