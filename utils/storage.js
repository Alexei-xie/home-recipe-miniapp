const { BUILTIN_RECIPES, CUISINES, getBuiltinRecipe } = require('../data/recipes')

const STORAGE_KEY = 'today_eat_local_data'
const COMMUNITY_STORAGE_KEY = 'today_eat_community_recipes'
const SCHEMA_VERSION = 13
const WRITE_DEBOUNCE_MS = 120

let cachedState = null
let pendingWriteTimer = null
let hasPendingWrite = false
let hasPendingCommunityWrite = false
let shouldPersistCommunityOnInit = true
let cachedRecipeList = null
let cachedRecipeById = null
let cachedCookedByDate = null

function invalidateRecipeCache() {
  cachedRecipeList = null
  cachedRecipeById = null
}

function invalidateCookedCache() {
  cachedCookedByDate = null
}

const POPULATION_TYPES = ['adult', 'child', 'pregnant', 'postpartum']
const HEALTH_CONDITIONS = [
  'hypertension',
  'hyperglycemia',
  'hyperlipidemia',
  'hyperuricemia',
  'fattyLiver',
  'kidneyDisease',
  'eatingDisorder',
  'gestationalDiabetes'
]

function now() {
  return Date.now()
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultProfile() {
  const time = now()
  return {
    schemaVersion: SCHEMA_VERSION,
    nickname: '',
    avatarPath: '',
    adultConfirmed: false,
    healthRecommendationEnabled: true,
    heightCm: null,
    populationType: 'adult',
    birthDate: '',
    biologicalSex: '',
    prePregnancyWeightKg: null,
    gestationalWeek: null,
    singletonPregnancyConfirmed: false,
    healthConditions: [],
    specialGuidanceConfirmed: false,
    allergies: [],
    avoidedIngredients: [],
    createdAt: time,
    updatedAt: time
  }
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    introSeen: false,
    profile: defaultProfile(),
    weightRecords: [],
    customRecipes: [],
    communityRecipes: [],
    communitySync: {
      version: 0,
      syncedAt: 0,
      noticeSeenAt: 0
    },
    recipeOverrides: {},
    drawHistory: [],
    favorites: [],
    pantryIngredients: [],
    mealPlan: {},
    shoppingList: [],
    cookedHistory: []
  }
}

function normalizeCuisine(cuisine) {
  const migrated = cuisine === '粤菜' || cuisine === '泰菜' ? '家常菜' : cuisine
  return CUISINES.includes(migrated) ? migrated : '家常菜'
}

function safeRead() {
  try {
    const data = wx.getStorageSync(STORAGE_KEY)
    if (!data || typeof data !== 'object') {
      shouldPersistCommunityOnInit = true
      return null
    }
    const communityRecipes = wx.getStorageSync(COMMUNITY_STORAGE_KEY)
    shouldPersistCommunityOnInit = !Array.isArray(communityRecipes) || Number(data.schemaVersion) !== SCHEMA_VERSION
    if (Array.isArray(communityRecipes)) data.communityRecipes = communityRecipes
    return data
  } catch (error) {
    console.error('读取本地数据失败', error)
    return null
  }
}

function normalizeCustomRecipe(recipe) {
  const time = now()
  ;(recipe.steps || []).forEach((step) => {
    if (step && step.image) deleteUserFile(step.image)
  })
  const ingredientList = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
    : String(recipe.ingredients || '').split('\n').filter(Boolean).map(line => {
      const parts = line.trim().split(/\s+/)
      return { name: parts.shift() || '', amount: parts.join(' ') || '适量' }
    })
  const tutorialLinks = Array.isArray(recipe.tutorialLinks)
    ? recipe.tutorialLinks.map(item => ({
      source: String(item && item.source || '').trim(),
      title: String(item && item.title || '').trim(),
      url: String(item && item.url || '').trim()
    })).filter(item => item.url)
    : []
  return {
    id: recipe.id || generateId('custom'),
    source: 'custom',
    name: recipe.name || '未命名菜谱',
    description: recipe.description || '',
    mealType: recipe.mealType || recipe.category || '家常热菜',
    cuisine: normalizeCuisine(recipe.cuisine),
    healthTags: Array.isArray(recipe.healthTags) ? recipe.healthTags : ['常见家常'],
    drawPools: Array.isArray(recipe.drawPools) ? recipe.drawPools : ['家常快手'],
    healthEligible: Boolean(recipe.healthEligible),
    energyLevel: recipe.energyLevel || 'unknown',
    estimatedKcalPerServing: Number(recipe.estimatedKcalPerServing) || null,
    servings: Number(recipe.servings) || 2,
    durationMinutes: Number(recipe.durationMinutes) || parseInt(recipe.duration, 10) || 30,
    difficulty: recipe.difficulty || '简单',
    ingredients: ingredientList,
    seasonings: Array.isArray(recipe.seasonings) ? recipe.seasonings : [],
    allergens: Array.isArray(recipe.allergens) ? recipe.allergens : [],
    allergensReviewed: Boolean(recipe.allergensReviewed || (Array.isArray(recipe.allergens) && recipe.allergens.length)),
    ingredientKeywords: Array.isArray(recipe.ingredientKeywords)
      ? recipe.ingredientKeywords
      : ingredientList.map(item => item.name),
    steps: Array.isArray(recipe.steps) ? recipe.steps.map((step, index) => ({
      id: step.id || generateId('step'),
      order: index + 1,
      text: step.text || String(step)
    })) : [],
    tips: Array.isArray(recipe.tips) ? recipe.tips : [],
    coverImage: recipe.coverImage || recipe.mainImage || '',
    coverEmoji: recipe.coverEmoji || '🍽️',
    videoUrl: recipe.videoUrl || '',
    tutorialLinks,
    createdAt: recipe.createdAt || time,
    updatedAt: recipe.updatedAt || time
  }
}

function normalizeBuiltinOverride(recipe, builtin) {
  const normalized = normalizeCustomRecipe(Object.assign({}, builtin, recipe, {
    id: builtin.id,
    createdAt: builtin.createdAt
  }))
  return Object.assign(normalized, {
    id: builtin.id,
    source: 'builtin',
    baseRecipeId: builtin.id,
    isLocalOverride: true,
    createdAt: builtin.createdAt,
    updatedAt: recipe.updatedAt || now()
  })
}

const BUILTIN_SUMMARY_BY_ID = new Map(BUILTIN_RECIPES.map(recipe => [recipe.id, recipe]))

function normalizeCommunityRecipe(recipe) {
  const normalized = normalizeCustomRecipe(recipe || {})
  return Object.assign(normalized, {
    id: String(recipe && recipe.id || normalized.id),
    source: 'community',
    submissionId: String(recipe && recipe.submissionId || ''),
    publisherName: String(recipe && recipe.publisherName || '社区用户').slice(0, 24),
    publishedAt: Number(recipe && recipe.publishedAt) || Number(recipe && recipe.updatedAt) || now(),
    healthEligible: Boolean(recipe && recipe.healthEligible && recipe.allergensReviewed),
    coverImage: String(recipe && recipe.coverImage || '')
  })
}

function migrateLegacyRecipes(state) {
  let legacy = []
  try {
    legacy = wx.getStorageSync('recipes') || []
  } catch (error) {
    legacy = []
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return state

  const existingNames = new Set(state.customRecipes.map(item => item.name))
  legacy.forEach((recipe) => {
    if (!existingNames.has(recipe.name)) {
      state.customRecipes.push(normalizeCustomRecipe(recipe))
      existingNames.add(recipe.name)
    }
  })
  return state
}

function migrateLocalData(rawData) {
  const state = Object.assign(defaultState(), rawData || {})
  state.profile = Object.assign(defaultProfile(), state.profile || {}, { schemaVersion: SCHEMA_VERSION })
  state.profile.populationType = POPULATION_TYPES.includes(state.profile.populationType)
    ? state.profile.populationType
    : 'adult'
  state.profile.birthDate = String(state.profile.birthDate || '')
  state.profile.biologicalSex = ['male', 'female'].includes(state.profile.biologicalSex)
    ? state.profile.biologicalSex
    : ''
  const prePregnancyWeightKg = Number(state.profile.prePregnancyWeightKg)
  state.profile.prePregnancyWeightKg = Number.isFinite(prePregnancyWeightKg) && prePregnancyWeightKg > 0
    ? prePregnancyWeightKg
    : null
  const gestationalWeek = Number(state.profile.gestationalWeek)
  state.profile.gestationalWeek = Number.isFinite(gestationalWeek) && gestationalWeek > 0
    ? gestationalWeek
    : null
  state.profile.singletonPregnancyConfirmed = Boolean(state.profile.singletonPregnancyConfirmed)
  state.profile.healthConditions = Array.from(new Set(Array.isArray(state.profile.healthConditions)
    ? state.profile.healthConditions.filter(item => HEALTH_CONDITIONS.includes(item))
    : []))
  state.profile.specialGuidanceConfirmed = Boolean(state.profile.specialGuidanceConfirmed)
  state.weightRecords = Array.isArray(state.weightRecords) ? state.weightRecords : []
  state.customRecipes = Array.isArray(state.customRecipes)
    ? state.customRecipes.map(normalizeCustomRecipe)
    : []
  state.communityRecipes = Array.isArray(state.communityRecipes)
    ? state.communityRecipes.map(normalizeCommunityRecipe).slice(0, 1000)
    : []
  state.communitySync = state.communitySync && typeof state.communitySync === 'object'
    ? {
      version: Math.max(0, Number(state.communitySync.version) || 0),
      syncedAt: Math.max(0, Number(state.communitySync.syncedAt) || 0),
      noticeSeenAt: Math.max(0, Number(state.communitySync.noticeSeenAt) || 0)
    }
    : { version: 0, syncedAt: 0, noticeSeenAt: 0 }
  const rawOverrides = state.recipeOverrides && typeof state.recipeOverrides === 'object'
    ? state.recipeOverrides
    : {}
  state.recipeOverrides = {}
  Object.keys(rawOverrides).forEach((id) => {
    const builtin = BUILTIN_SUMMARY_BY_ID.get(id)
    if (builtin) state.recipeOverrides[id] = normalizeBuiltinOverride(rawOverrides[id], builtin)
  })
  state.drawHistory = Array.isArray(state.drawHistory) ? state.drawHistory.slice(0, 10) : []
  const rawFavorites = Array.isArray(state.favorites)
    ? state.favorites
    : (Array.isArray(state.favoriteRecipeIds) ? state.favoriteRecipeIds : [])
  const favoriteIds = new Set()
  state.favorites = rawFavorites.reduce((items, entry) => {
    const recipeId = typeof entry === 'string' ? entry : entry && entry.recipeId
    if (!recipeId || favoriteIds.has(recipeId)) return items
    favoriteIds.add(recipeId)
    items.push({ recipeId, savedAt: Number(entry && entry.savedAt) || now() })
    return items
  }, []).slice(0, 200)
  state.pantryIngredients = Array.isArray(state.pantryIngredients)
    ? state.pantryIngredients.map(item => String(item || '').trim()).filter(Boolean).slice(0, 50)
    : []
  state.mealPlan = state.mealPlan && typeof state.mealPlan === 'object' ? state.mealPlan : {}
  state.shoppingList = Array.isArray(state.shoppingList)
    ? state.shoppingList.map(item => ({
      id: item.id || generateId('shop'),
      name: String(item.name || '').trim(),
      amount: String(item.amount || '适量').trim(),
      recipeName: String(item.recipeName || '').trim(),
      checked: Boolean(item.checked),
      createdAt: Number(item.createdAt) || now()
    })).filter(item => item.name).slice(0, 300)
    : []
  state.cookedHistory = Array.isArray(state.cookedHistory)
    ? state.cookedHistory.filter(item => item && item.recipeId && item.date).slice(0, 200)
    : []
  delete state.budgetPreference
  delete state.priceSettings
  delete state.priceCache
  delete state.priceSnapshots
  state.schemaVersion = SCHEMA_VERSION
  return migrateLegacyRecipes(state)
}

function writeStateSync(state) {
  try {
    const personalState = Object.assign({}, state)
    delete personalState.communityRecipes
    wx.setStorageSync(STORAGE_KEY, personalState)
    hasPendingWrite = false
    return true
  } catch (error) {
    console.error('保存本地数据失败', error)
    wx.showToast({ title: '本地保存失败，请检查存储空间', icon: 'none' })
    return false
  }
}

function writeCommunityRecipesSync(state) {
  try {
    wx.setStorageSync(COMMUNITY_STORAGE_KEY, state.communityRecipes || [])
    hasPendingCommunityWrite = false
    return true
  } catch (error) {
    console.error('保存社区菜谱缓存失败', error)
    return false
  }
}

function flushStateSync() {
  if (pendingWriteTimer) clearTimeout(pendingWriteTimer)
  pendingWriteTimer = null
  if (!cachedState) return true
  const personalSaved = !hasPendingWrite || writeStateSync(cachedState)
  const communitySaved = !hasPendingCommunityWrite || writeCommunityRecipesSync(cachedState)
  return personalSaved && communitySaved
}

function scheduleStateWrite() {
  hasPendingWrite = true
  if (pendingWriteTimer) clearTimeout(pendingWriteTimer)
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null
    if (cachedState && hasPendingWrite) writeStateSync(cachedState)
    if (cachedState && hasPendingCommunityWrite) writeCommunityRecipesSync(cachedState)
  }, WRITE_DEBOUNCE_MS)
  return true
}

function initStorage() {
  invalidateRecipeCache()
  invalidateCookedCache()
  cachedState = migrateLocalData(safeRead())
  const personalInitialized = writeStateSync(cachedState)
  const communityInitialized = !shouldPersistCommunityOnInit || writeCommunityRecipesSync(cachedState)
  shouldPersistCommunityOnInit = false
  const initialized = personalInitialized && communityInitialized
  if (initialized) {
    try {
      wx.removeStorageSync('recipes')
    } catch (error) {
      console.warn('旧数据标记清理失败', error)
    }
  }
  return cachedState
}

function getState() {
  if (!cachedState) cachedState = migrateLocalData(safeRead())
  return cachedState
}

function updateState(updater) {
  const state = getState()
  const result = updater(state) || state
  result.schemaVersion = SCHEMA_VERSION
  cachedState = result
  scheduleStateWrite()
  return result
}

function getProfile() {
  return getState().profile
}

function saveProfile(patch) {
  return updateState((state) => {
    state.profile = Object.assign({}, state.profile, patch, {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: now()
    })
    return state
  }).profile
}

function saveAvatarFile(tempPath) {
  if (!tempPath) return ''
  try {
    const fs = wx.getFileSystemManager()
    const suffix = tempPath.includes('.') ? tempPath.slice(tempPath.lastIndexOf('.')) : '.jpg'
    const destination = `${wx.env.USER_DATA_PATH}/${generateId('avatar')}${suffix}`
    fs.saveFileSync(tempPath, destination)
    const oldPath = getProfile().avatarPath
    if (oldPath && oldPath !== destination && oldPath.includes(wx.env.USER_DATA_PATH)) {
      try {
        fs.unlinkSync(oldPath)
      } catch (unlinkError) {
        console.warn('旧头像清理失败', unlinkError)
      }
    }
    return destination
  } catch (error) {
    console.warn('头像持久化失败，将使用临时路径', error)
    return tempPath
  }
}

function saveRecipeImageFile(tempPath) {
  if (!tempPath) return ''
  try {
    const fs = wx.getFileSystemManager()
    const directory = `${wx.env.USER_DATA_PATH}/recipe_images`
    try {
      fs.accessSync(directory)
    } catch (accessError) {
      fs.mkdirSync(directory, true)
    }
    const rawSuffix = tempPath.includes('.') ? tempPath.slice(tempPath.lastIndexOf('.')).toLowerCase() : '.jpg'
    const suffix = ['.jpg', '.jpeg', '.png', '.webp'].includes(rawSuffix) ? rawSuffix : '.jpg'
    const destination = `${directory}/${generateId('recipe')}${suffix}`
    fs.saveFileSync(tempPath, destination)
    return destination
  } catch (error) {
    console.error('菜谱图片保存失败', error)
    wx.showToast({ title: '图片保存失败，请检查本地空间', icon: 'none' })
    return ''
  }
}

function markIntroSeen() {
  updateState((state) => {
    state.introSeen = true
    return state
  })
}

function getWeightRecords() {
  return getState().weightRecords.slice().sort((a, b) => b.date.localeCompare(a.date))
}

function saveWeightRecord(date, weightKg) {
  return updateState((state) => {
    const index = state.weightRecords.findIndex(item => item.date === date)
    const time = now()
    if (index >= 0) {
      state.weightRecords[index] = Object.assign({}, state.weightRecords[index], {
        weightKg,
        updatedAt: time
      })
    } else {
      state.weightRecords.push({
        id: generateId('weight'),
        date,
        weightKg,
        createdAt: time,
        updatedAt: time
      })
    }
    return state
  }).weightRecords
}

function deleteWeightRecord(id) {
  return updateState((state) => {
    state.weightRecords = state.weightRecords.filter(item => item.id !== id)
    return state
  }).weightRecords
}

function getCustomRecipes() {
  return getState().customRecipes
}

function saveCustomRecipe(recipe) {
  const normalized = normalizeCustomRecipe(recipe)
  updateState((state) => {
    const index = state.customRecipes.findIndex(item => item.id === normalized.id)
    if (index >= 0) state.customRecipes[index] = normalized
    else state.customRecipes.unshift(normalized)
    return state
  })
  invalidateRecipeCache()
  return normalized
}

function deleteCustomRecipe(id) {
  const recipes = updateState((state) => {
    const target = state.customRecipes.find(item => item.id === id)
    if (target) deleteRecipeFiles(target)
    state.customRecipes = state.customRecipes.filter(item => item.id !== id)
    state.favorites = state.favorites.filter(item => item.recipeId !== id)
    return state
  }).customRecipes
  invalidateRecipeCache()
  return recipes
}

function getCommunityRecipes() {
  return getState().communityRecipes
}

function getCommunitySync() {
  return getState().communitySync
}

function replaceCommunityRecipes(recipes, syncInfo) {
  const normalized = (Array.isArray(recipes) ? recipes : [])
    .map(normalizeCommunityRecipe)
    .filter(recipe => recipe.id && recipe.name && recipe.ingredients.length && recipe.steps.length)
    .slice(0, 1000)
  const communityRecipes = updateState((state) => {
    state.communityRecipes = normalized
    state.communitySync = {
      version: Math.max(0, Number(syncInfo && syncInfo.version) || 0),
      syncedAt: Number(syncInfo && syncInfo.syncedAt) || now(),
      noticeSeenAt: Number(state.communitySync.noticeSeenAt) || 0
    }
    return state
  }).communityRecipes
  invalidateRecipeCache()
  hasPendingCommunityWrite = true
  scheduleStateWrite()
  return communityRecipes
}

function applyCommunityRecipeDelta(recipes, removedIds, syncInfo) {
  const state = getState()
  const removed = new Set((removedIds || []).map(String))
  const byId = new Map(state.communityRecipes
    .filter(recipe => !removed.has(String(recipe.id)))
    .map(recipe => [String(recipe.id), recipe]))
  ;(Array.isArray(recipes) ? recipes : []).forEach(rawRecipe => {
    const recipe = normalizeCommunityRecipe(rawRecipe)
    if (recipe.id && recipe.name && recipe.ingredients.length && recipe.steps.length) {
      byId.set(String(recipe.id), recipe)
    }
  })
  const merged = Array.from(byId.values())
    .sort((a, b) => Number(b.publishedAt || b.updatedAt) - Number(a.publishedAt || a.updatedAt))
    .slice(0, 1000)
  return replaceCommunityRecipes(merged, syncInfo)
}

function markCommunityNoticesSeen() {
  return updateState((state) => {
    state.communitySync.noticeSeenAt = now()
    return state
  }).communitySync
}

function getRecipeOverrides() {
  return getState().recipeOverrides
}

function saveBuiltinRecipeOverride(recipe) {
  const builtin = BUILTIN_SUMMARY_BY_ID.get(recipe.id)
  if (!builtin) return null
  const normalized = normalizeBuiltinOverride(recipe, builtin)
  updateState((state) => {
    state.recipeOverrides[normalized.id] = normalized
    return state
  })
  invalidateRecipeCache()
  return normalized
}

function clearBuiltinRecipeOverride(id) {
  const overrides = updateState((state) => {
    const target = state.recipeOverrides[id]
    if (target) deleteRecipeFiles(target)
    delete state.recipeOverrides[id]
    return state
  }).recipeOverrides
  invalidateRecipeCache()
  return overrides
}

function deleteUserFile(filePath) {
  if (!filePath || !filePath.includes(wx.env.USER_DATA_PATH)) return
  try {
    wx.getFileSystemManager().unlinkSync(filePath)
  } catch (error) {
    console.warn('本地文件清理失败', error)
  }
}

function deleteRecipeFiles(recipe) {
  deleteUserFile(recipe.coverImage)
}

function getAllRecipes() {
  if (cachedRecipeList) return cachedRecipeList
  const state = getState()
  const builtins = BUILTIN_RECIPES.map((recipe) => {
    const override = state.recipeOverrides[recipe.id]
    return override ? Object.assign({}, recipe, override, {
      id: recipe.id,
      source: 'builtin',
      baseRecipeId: recipe.id,
      isLocalOverride: true
    }) : recipe
  })
  cachedRecipeList = builtins.concat(state.communityRecipes, state.customRecipes)
  cachedRecipeById = new Map(cachedRecipeList.map(recipe => [recipe.id, recipe]))
  return cachedRecipeList
}

function getRecipe(id) {
  if (!cachedRecipeById) getAllRecipes()
  const recipe = cachedRecipeById.get(id) || null
  if (!recipe || recipe.source !== 'builtin' || recipe.isLocalOverride) return recipe
  return getBuiltinRecipe(id) || recipe
}

function getFavorites() {
  return getState().favorites.slice().sort((a, b) => b.savedAt - a.savedAt)
}

function isFavorite(recipeId) {
  return getState().favorites.some(item => item.recipeId === recipeId)
}

function toggleFavorite(recipeId) {
  if (!cachedRecipeById) getAllRecipes()
  if (!cachedRecipeById.has(recipeId)) return { favorite: false, favorites: getFavorites() }
  const state = updateState((current) => {
    const index = current.favorites.findIndex(item => item.recipeId === recipeId)
    if (index >= 0) current.favorites.splice(index, 1)
    else current.favorites.unshift({ recipeId, savedAt: now() })
    return current
  })
  return {
    favorite: state.favorites.some(item => item.recipeId === recipeId),
    favorites: state.favorites.slice().sort((a, b) => b.savedAt - a.savedAt)
  }
}

function getFavoriteRecipes() {
  if (!cachedRecipeById) getAllRecipes()
  return getFavorites().map(item => cachedRecipeById.get(item.recipeId)).filter(Boolean)
}

function getDrawHistory() {
  return getState().drawHistory
}

function addDrawHistory(recipeId, pool) {
  return updateState((state) => {
    state.drawHistory.unshift({ recipeId, pool, drawnAt: now() })
    state.drawHistory = state.drawHistory.slice(0, 10)
    return state
  }).drawHistory
}

function getDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPantryIngredients() {
  return getState().pantryIngredients
}

function savePantryIngredients(items) {
  const pantryIngredients = Array.from(new Set((items || [])
    .map(item => String(item || '').trim())
    .filter(Boolean))).slice(0, 50)
  return updateState(state => {
    state.pantryIngredients = pantryIngredients
    return state
  }).pantryIngredients
}

function getMealPlan(date = getDateKey()) {
  const state = getState()
  const recipeIds = Array.isArray(state.mealPlan[date]) ? state.mealPlan[date] : []
  if (!cachedRecipeById) getAllRecipes()
  return recipeIds.map(id => cachedRecipeById.get(id)).filter(Boolean)
}

function addRecipeToMealPlan(recipeId, date = getDateKey()) {
  return updateState(state => {
    const items = Array.isArray(state.mealPlan[date]) ? state.mealPlan[date] : []
    if (!items.includes(recipeId)) items.push(recipeId)
    state.mealPlan[date] = items.slice(0, 12)
    return state
  }).mealPlan[date]
}

function removeRecipeFromMealPlan(recipeId, date = getDateKey()) {
  return updateState(state => {
    const items = Array.isArray(state.mealPlan[date]) ? state.mealPlan[date] : []
    state.mealPlan[date] = items.filter(id => id !== recipeId)
    return state
  }).mealPlan[date]
}

function addRecipeToShoppingList(recipe) {
  if (!recipe) return []
  const ingredients = (recipe.ingredients || []).concat(recipe.seasonings || [])
    .filter(item => item && item.name && item.name !== '无')
  return updateState(state => {
    const existing = new Set(state.shoppingList.map(item => `${item.name}|${item.amount}|${item.recipeName}`))
    ingredients.forEach(item => {
      const key = `${item.name}|${item.amount || '适量'}|${recipe.name}`
      if (existing.has(key)) return
      existing.add(key)
      state.shoppingList.push({
        id: generateId('shop'),
        name: item.name,
        amount: item.amount || '适量',
        recipeName: recipe.name,
        checked: false,
        createdAt: now()
      })
    })
    state.shoppingList = state.shoppingList.slice(-300)
    return state
  }).shoppingList
}

function getShoppingList() {
  const groups = new Map()
  getState().shoppingList.forEach((item) => {
    const key = String(item.name || '').trim().toLowerCase()
    if (!key) return
    const group = groups.get(key) || {
      id: `shopping_group_${key}`,
      name: item.name,
      entries: [],
      checked: true,
      createdAt: 0
    }
    group.entries.push(item)
    group.checked = group.checked && Boolean(item.checked)
    group.createdAt = Math.max(group.createdAt, Number(item.createdAt) || 0)
    groups.set(key, group)
  })
  return Array.from(groups.values()).map((group) => {
    const numericAmounts = new Map()
    const textAmountCounts = new Map()
    const recipeNames = []
    group.entries.forEach((item) => {
      const amount = item.amount || '适量'
      const numericMatch = String(amount).match(/^(\d+(?:\.\d+)?)(.*)$/)
      if (numericMatch && numericMatch[2]) {
        const unit = numericMatch[2]
        numericAmounts.set(unit, (numericAmounts.get(unit) || 0) + Number(numericMatch[1]))
      } else {
        textAmountCounts.set(amount, (textAmountCounts.get(amount) || 0) + 1)
      }
      if (item.recipeName && !recipeNames.includes(item.recipeName)) recipeNames.push(item.recipeName)
    })
    const amount = Array.from(numericAmounts.entries())
      .map(([unit, value]) => `${Math.round(value * 10) / 10}${unit}`)
      .concat(Array.from(textAmountCounts.entries())
        .map(([value, count]) => count > 1 ? `${value} × ${count}` : value)
      ).join(' + ')
    return {
      id: group.id,
      name: group.name,
      checked: group.checked,
      createdAt: group.createdAt,
      amount,
      recipeName: recipeNames.join('、'),
      entryIds: group.entries.map(item => item.id)
    }
  }).sort((a, b) => Number(a.checked) - Number(b.checked) || b.createdAt - a.createdAt)
}

function toggleShoppingItem(id) {
  return updateState(state => {
    const rawId = String(id || '')
    const groupName = rawId.replace(/^shopping_group_/, '')
    const groupItems = rawId.startsWith('shopping_group_')
      ? state.shoppingList.filter(item => String(item.name || '').trim().toLowerCase() === groupName)
      : state.shoppingList.filter(item => item.id === id)
    const nextChecked = !groupItems.every(item => item.checked)
    groupItems.forEach(item => { item.checked = nextChecked })
    return state
  }).shoppingList
}

function removeShoppingItem(id) {
  return updateState(state => {
    const rawId = String(id || '')
    const groupName = rawId.replace(/^shopping_group_/, '')
    state.shoppingList = rawId.startsWith('shopping_group_')
      ? state.shoppingList.filter(item => String(item.name || '').trim().toLowerCase() !== groupName)
      : state.shoppingList.filter(item => item.id !== id)
    return state
  }).shoppingList
}

function clearCheckedShoppingItems() {
  return updateState(state => {
    state.shoppingList = state.shoppingList.filter(item => !item.checked)
    return state
  }).shoppingList
}

function markRecipeCooked(recipeId, date = getDateKey()) {
  const history = updateState(state => {
    const index = state.cookedHistory.findIndex(item => item.recipeId === recipeId && item.date === date)
    if (index >= 0) state.cookedHistory.splice(index, 1)
    else state.cookedHistory.unshift({ recipeId, date, createdAt: now() })
    state.cookedHistory = state.cookedHistory.slice(0, 200)
    return state
  }).cookedHistory
  invalidateCookedCache()
  return history
}

function getCookedRecipeIds(date = getDateKey()) {
  if (!cachedCookedByDate) cachedCookedByDate = new Map()
  if (!cachedCookedByDate.has(date)) {
    cachedCookedByDate.set(date, new Set(
      getState().cookedHistory.filter(item => item.date === date).map(item => item.recipeId)
    ))
  }
  return cachedCookedByDate.get(date)
}

function isRecipeCookedToday(recipeId) {
  return getCookedRecipeIds().has(recipeId)
}

function clearHealthData() {
  updateState((state) => {
    state.weightRecords = []
    state.profile.heightCm = null
    state.profile.adultConfirmed = false
    state.profile.populationType = 'adult'
    state.profile.birthDate = ''
    state.profile.biologicalSex = ''
    state.profile.prePregnancyWeightKg = null
    state.profile.gestationalWeek = null
    state.profile.singletonPregnancyConfirmed = false
    state.profile.healthConditions = []
    state.profile.specialGuidanceConfirmed = false
    state.profile.updatedAt = now()
    return state
  })
}

function clearDrawHistory() {
  updateState((state) => {
    state.drawHistory = []
    return state
  })
}

function clearAllPersonalData() {
  const state = getState()
  try {
    if (pendingWriteTimer) clearTimeout(pendingWriteTimer)
    pendingWriteTimer = null
    hasPendingWrite = false
    hasPendingCommunityWrite = false
    deleteUserFile(state.profile.avatarPath)
    state.customRecipes.forEach(deleteRecipeFiles)
    Object.keys(state.recipeOverrides || {}).forEach(id => deleteRecipeFiles(state.recipeOverrides[id]))
    wx.removeStorageSync(STORAGE_KEY)
    wx.removeStorageSync(COMMUNITY_STORAGE_KEY)
    wx.removeStorageSync('recipes')
    cachedState = null
    invalidateRecipeCache()
    invalidateCookedCache()
  } catch (error) {
    console.error('清除数据失败', error)
  }
  return initStorage()
}

module.exports = {
  STORAGE_KEY,
  COMMUNITY_STORAGE_KEY,
  SCHEMA_VERSION,
  generateId,
  initStorage,
  flushStateSync,
  getState,
  getProfile,
  saveProfile,
  saveAvatarFile,
  saveRecipeImageFile,
  deleteUserFile,
  markIntroSeen,
  getWeightRecords,
  saveWeightRecord,
  deleteWeightRecord,
  getCustomRecipes,
  saveCustomRecipe,
  deleteCustomRecipe,
  getCommunityRecipes,
  getCommunitySync,
  replaceCommunityRecipes,
  applyCommunityRecipeDelta,
  markCommunityNoticesSeen,
  getRecipeOverrides,
  saveBuiltinRecipeOverride,
  clearBuiltinRecipeOverride,
  getAllRecipes,
  getRecipe,
  getFavorites,
  isFavorite,
  toggleFavorite,
  getFavoriteRecipes,
  getDrawHistory,
  addDrawHistory,
  getDateKey,
  getPantryIngredients,
  savePantryIngredients,
  getMealPlan,
  addRecipeToMealPlan,
  removeRecipeFromMealPlan,
  addRecipeToShoppingList,
  getShoppingList,
  toggleShoppingItem,
  removeShoppingItem,
  clearCheckedShoppingItems,
  markRecipeCooked,
  getCookedRecipeIds,
  isRecipeCookedToday,
  clearHealthData,
  clearDrawHistory,
  clearAllPersonalData,
  migrateLocalData,
  normalizeCustomRecipe,
  normalizeCommunityRecipe,
  normalizeBuiltinOverride
}
