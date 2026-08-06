const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const SUBMISSIONS = 'recipe_submissions'
const PUBLIC_RECIPES = 'public_recipes'
const META = 'recipe_meta'
const META_ID = 'public-recipes'
const VALID_MEAL_TYPES = ['家常热菜', '凉菜', '汤羹', '主食', '早餐', '小吃甜品', '饮品']
const VALID_CUISINES = ['家常菜', '东北菜', '湘菜', '川菜', '傣菜']
const VALID_HEALTH_TAGS = ['增能均衡', '日常均衡', '轻盈低卡', '轻享解馋', '放纵高热量', '零食加餐', '常见家常']
const VALID_DRAW_POOLS = ['轻盈低卡', '均衡健康', '家常快手', '轻享解馋', '放纵高热量', '零食加餐']
const VALID_ALLERGENS = ['蛋', '奶', '花生与坚果', '豆制品', '小麦或麸质', '鱼类', '甲壳及贝类', '芝麻']

function success(data) {
  return { ok: true, data: data || {} }
}

function failure(code, message) {
  return { ok: false, code, message }
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function number(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, parsed))
}

function list(values, allowed, maximum) {
  const items = Array.isArray(values) ? values : []
  return [...new Set(items.filter(item => allowed.includes(item)))].slice(0, maximum)
}

function itemList(values, maximum) {
  return (Array.isArray(values) ? values : []).slice(0, maximum).map(item => ({
    name: text(item && item.name, 40),
    amount: text(item && item.amount || '适量', 40)
  })).filter(item => item.name)
}

function stepList(values) {
  return (Array.isArray(values) ? values : []).slice(0, 40).map((step, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    text: text(step && step.text || step, 600)
  })).filter(step => step.text)
}

function tutorialList(values) {
  return (Array.isArray(values) ? values : []).slice(0, 3).map(item => ({
    source: text(item && item.source || '外部教程', 30),
    title: text(item && item.title, 80),
    url: text(item && item.url, 500)
  })).filter(item => /^https:\/\//i.test(item.url))
}

function sanitizeRecipe(raw) {
  const ingredients = itemList(raw && raw.ingredients, 80)
  const seasonings = itemList(raw && raw.seasonings, 40)
  const steps = stepList(raw && raw.steps)
  const coverImage = /^cloud:\/\//.test(String(raw && raw.coverImage || '')) ? String(raw.coverImage) : ''
  const allergens = list(raw && raw.allergens, VALID_ALLERGENS, VALID_ALLERGENS.length)
  const allergensReviewed = Boolean(raw && raw.allergensReviewed)
  const healthEligible = Boolean(raw && raw.healthEligible && allergensReviewed && raw.energyLevel !== 'unknown' && Number(raw.estimatedKcalPerServing) > 0)
  return {
    name: text(raw && raw.name, 60),
    description: text(raw && raw.description, 500),
    mealType: VALID_MEAL_TYPES.includes(raw && raw.mealType) ? raw.mealType : '家常热菜',
    cuisine: VALID_CUISINES.includes(raw && raw.cuisine) ? raw.cuisine : '家常菜',
    healthTags: list(raw && raw.healthTags, VALID_HEALTH_TAGS, 4),
    drawPools: list(raw && raw.drawPools, VALID_DRAW_POOLS, 4),
    healthEligible,
    energyLevel: ['low', 'medium', 'high', 'unknown'].includes(raw && raw.energyLevel) ? raw.energyLevel : 'unknown',
    estimatedKcalPerServing: number(raw && raw.estimatedKcalPerServing, null, 1, 3000),
    servings: number(raw && raw.servings, 2, 1, 20),
    durationMinutes: number(raw && raw.durationMinutes, 30, 1, 1440),
    difficulty: ['简单', '中等', '较难'].includes(raw && raw.difficulty) ? raw.difficulty : '简单',
    ingredients,
    seasonings,
    allergens,
    allergensReviewed,
    ingredientKeywords: ingredients.concat(seasonings).map(item => item.name),
    steps,
    tips: (Array.isArray(raw && raw.tips) ? raw.tips : []).slice(0, 12).map(item => text(item, 200)).filter(Boolean),
    coverImage,
    coverEmoji: text(raw && raw.coverEmoji || '🍽️', 8),
    videoUrl: /^https:\/\//i.test(String(raw && raw.videoUrl || '')) ? text(raw.videoUrl, 500) : '',
    tutorialLinks: tutorialList(raw && raw.tutorialLinks)
  }
}

function getAdmins() {
  return String(process.env.ADMIN_OPENIDS || '').split(',').map(item => item.trim()).filter(Boolean)
}

function isAdmin(openid) {
  return Boolean(openid && getAdmins().includes(openid))
}

async function getMeta() {
  try {
    const result = await db.collection(META).doc(META_ID).get()
    return result.data || { version: 0, updatedAt: 0 }
  } catch (error) {
    return { version: 0, updatedAt: 0 }
  }
}

async function incrementVersion() {
  const time = Date.now()
  try {
    await db.collection(META).doc(META_ID).update({ data: { version: command.inc(1), updatedAt: time } })
  } catch (error) {
    await db.collection(META).doc(META_ID).set({ data: { version: 1, updatedAt: time } })
  }
  return getMeta()
}

async function submit(event, openid) {
  const recipe = sanitizeRecipe(event.recipe || {})
  const clientRecipeId = text(event.recipe && event.recipe.id, 80)
  if (!recipe.name || !recipe.ingredients.length || !recipe.steps.length) {
    return failure('INVALID_RECIPE', '菜名、食材和做法步骤不能为空')
  }
  if (recipe.steps.length < 2) return failure('STEPS_TOO_SHORT', '投稿菜谱至少需要两个做法步骤')
  if (!recipe.allergensReviewed) return failure('ALLERGENS_NOT_REVIEWED', '投稿前请核对并确认主要过敏原')
  const ownRecent = await db.collection(SUBMISSIONS).where({ submitterOpenid: openid }).limit(50).get()
  if (ownRecent.data.filter(item => item.status === 'pending').length >= 5) {
    return failure('TOO_MANY_PENDING', '最多同时保留 5 个待审核投稿')
  }
  const time = Date.now()
  const result = await db.collection(SUBMISSIONS).add({ data: {
    recipe,
    clientRecipeId,
    submitterOpenid: openid,
    publisherName: text(event.publisherName || '社区用户', 24),
    status: 'pending',
    reviewReason: '',
    createdAt: time,
    updatedAt: time,
    reviewedAt: 0
  } })
  return success({ submissionId: result._id, status: 'pending' })
}

async function pull(event) {
  const meta = await getMeta()
  const knownVersion = Math.max(0, Number(event.knownVersion) || 0)
  if (knownVersion && knownVersion === Number(meta.version || 0)) {
    return success({ unchanged: true, version: meta.version, recipes: [] })
  }
  const recipes = []
  let offset = 0
  while (offset < 1000) {
    const result = await db.collection(PUBLIC_RECIPES).orderBy('publishedAt', 'desc').skip(offset).limit(100).get()
    recipes.push(...result.data)
    if (result.data.length < 100) break
    offset += result.data.length
  }
  return success({
    unchanged: false,
    version: Number(meta.version) || 0,
    recipes: recipes.map(item => Object.assign({}, item.recipe, {
      id: item._id,
      source: 'community',
      submissionId: item.submissionId,
      publisherName: item.publisherName,
      publishedAt: item.publishedAt,
      createdAt: item.publishedAt,
      updatedAt: item.updatedAt
    }))
  })
}

async function status(event, openid) {
  const admin = isAdmin(openid)
  const pendingPromise = admin
    ? db.collection(SUBMISSIONS).where({ status: 'pending' }).count()
    : Promise.resolve({ total: 0 })
  const seenAt = Math.max(0, Number(event.seenAt) || 0)
  const ownPromise = db.collection(SUBMISSIONS).where({ submitterOpenid: openid }).limit(50).get()
  const [pending, own] = await Promise.all([pendingPromise, ownPromise])
  const myResolvedCount = own.data.filter(item =>
    ['approved', 'rejected'].includes(item.status) && Number(item.updatedAt) > seenAt
  ).length
  return success({ isAdmin: admin, pendingCount: pending.total, myResolvedCount })
}

async function mySubmissions(openid) {
  const result = await db.collection(SUBMISSIONS).where({ submitterOpenid: openid }).limit(50).get()
  const submissions = result.data.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)).map(item => ({
    id: item._id,
    name: item.recipe && item.recipe.name,
    coverEmoji: item.recipe && item.recipe.coverEmoji,
    clientRecipeId: item.clientRecipeId || '',
    status: item.status,
    reviewReason: item.reviewReason || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }))
  return success({ submissions })
}

async function reviewQueue(openid) {
  if (!isAdmin(openid)) return failure('FORBIDDEN', '当前账号没有审核权限')
  const result = await db.collection(SUBMISSIONS).where({ status: 'pending' }).limit(100).get()
  const submissions = result.data.sort((a, b) => Number(a.createdAt) - Number(b.createdAt)).map(item => ({
    id: item._id,
    recipe: item.recipe,
    publisherName: item.publisherName,
    createdAt: item.createdAt
  }))
  return success({ submissions })
}

async function review(event, openid) {
  if (!isAdmin(openid)) return failure('FORBIDDEN', '当前账号没有审核权限')
  const decision = event.decision
  if (!['approve', 'reject'].includes(decision)) return failure('INVALID_DECISION', '审核结果无效')
  const submissionId = text(event.submissionId, 80)
  let submission
  try {
    submission = (await db.collection(SUBMISSIONS).doc(submissionId).get()).data
  } catch (error) {
    return failure('NOT_FOUND', '投稿不存在或已删除')
  }
  if (!submission || submission.status !== 'pending') return failure('ALREADY_REVIEWED', '该投稿已经处理')
  const time = Date.now()
  const statusValue = decision === 'approve' ? 'approved' : 'rejected'
  const reason = text(event.reason, 200)
  if (decision === 'reject' && !reason) return failure('REASON_REQUIRED', '驳回时请填写原因')
  if (decision === 'approve') {
    const publicId = `community_${submissionId}`
    await db.collection(PUBLIC_RECIPES).doc(publicId).set({ data: {
      recipe: submission.recipe,
      submissionId,
      publisherName: submission.publisherName || '社区用户',
      publishedAt: time,
      updatedAt: time
    } })
    await incrementVersion()
  }
  await db.collection(SUBMISSIONS).doc(submissionId).update({ data: {
    status: statusValue,
    reviewReason: reason,
    reviewerOpenid: openid,
    reviewedAt: time,
    updatedAt: time
  } })
  return success({ submissionId, status: statusValue })
}

async function removeSubmission(event, openid) {
  const submissionId = text(event.submissionId, 80)
  let submission
  try {
    submission = (await db.collection(SUBMISSIONS).doc(submissionId).get()).data
  } catch (error) {
    return failure('NOT_FOUND', '投稿不存在或已删除')
  }
  if (!submission || submission.submitterOpenid !== openid) return failure('FORBIDDEN', '只能删除自己的投稿')
  if (submission.status === 'approved') {
    try {
      await db.collection(PUBLIC_RECIPES).doc(`community_${submissionId}`).remove()
    } catch (error) {
      console.warn('[removeSubmission] public recipe missing', submissionId)
    }
    await incrementVersion()
  }
  const coverImage = submission.recipe && submission.recipe.coverImage
  if (/^cloud:\/\//.test(String(coverImage || ''))) {
    try {
      await cloud.deleteFile({ fileList: [coverImage] })
    } catch (error) {
      console.warn('[removeSubmission] cover cleanup failed', error)
    }
  }
  await db.collection(SUBMISSIONS).doc(submissionId).remove()
  return success({ submissionId, removed: true, clientRecipeId: submission.clientRecipeId || '' })
}

exports.main = async (event) => {
  const context = cloud.getWXContext()
  const openid = context.OPENID
  if (!openid) return failure('UNAUTHORIZED', '无法识别当前微信用户')
  try {
    switch (event && event.action) {
      case 'submit': return submit(event, openid)
      case 'pull': return pull(event)
      case 'status': return status(event, openid)
      case 'mySubmissions': return mySubmissions(openid)
      case 'reviewQueue': return reviewQueue(openid)
      case 'review': return review(event, openid)
      case 'removeSubmission': return removeSubmission(event, openid)
      default: return failure('UNKNOWN_ACTION', '不支持的操作')
    }
  } catch (error) {
    console.error('[recipeCommunity]', event && event.action, error)
    return failure('SERVER_ERROR', '云端服务暂时不可用，请稍后重试')
  }
}
