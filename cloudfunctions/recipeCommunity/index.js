const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { defaultCatalog, normalizeCatalog, applyRecipeCategories, changeCatalog } = require('./recipe-catalog')
const BUILTIN_CATEGORY_INDEX = new Map(require('./builtin-category-index'))

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const command = db.command
const SUBMISSIONS = 'recipe_submissions'
const PUBLIC_RECIPES = 'public_recipes'
const META = 'recipe_meta'
const META_ID = 'public-recipes'
const CATALOG_ID = 'recipe-catalog'
const SYNC_PROTOCOL = 2
const DELETION_HISTORY_LIMIT = 1000
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

function sanitizeRecipe(raw, catalog) {
  const ingredients = itemList(raw && raw.ingredients, 80)
  const seasonings = itemList(raw && raw.seasonings, 40)
  const steps = stepList(raw && raw.steps)
  const coverImage = /^cloud:\/\//.test(String(raw && raw.coverImage || '')) ? String(raw.coverImage) : ''
  const allergens = list(raw && raw.allergens, VALID_ALLERGENS, VALID_ALLERGENS.length)
  const allergensReviewed = Boolean(raw && raw.allergensReviewed)
  const healthEligible = Boolean(raw && raw.healthEligible && allergensReviewed && raw.energyLevel !== 'unknown' && Number(raw.estimatedKcalPerServing) > 0)
  return applyRecipeCategories({
    name: text(raw && raw.name, 60),
    description: text(raw && raw.description, 500),
    mealType: String(raw && raw.mealType || VALID_MEAL_TYPES[0]),
    cuisine: String(raw && raw.cuisine || VALID_CUISINES[0]),
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
  }, catalog)
}

function getAdmins() {
  return String(process.env.ADMIN_OPENIDS || '').split(',').map(item => item.trim()).filter(Boolean)
}

function isAdmin(openid) {
  return Boolean(openid && getAdmins().includes(openid))
}

async function getDocument(database, collection, id) {
  try {
    const result = await database.collection(collection).doc(id).get()
    return result.data || null
  } catch (error) {
    if (/DOCUMENT_NOT_(?:EXIST|FOUND)|does not exist|not found|不存在/i.test(String(error.code || '') + ' ' + String(error.errMsg || error.message || ''))) return null
    throw error
  }
}

async function getMeta(database = db) {
  return await getDocument(database, META, META_ID) || { version: 0, updatedAt: 0 }
}

async function readCatalog(database = db) {
  return normalizeCatalog(await getDocument(database, META, CATALOG_ID) || defaultCatalog())
}

async function updateCatalog(event, openid) {
  if (!isAdmin(openid)) return failure('FORBIDDEN', '当前账号没有分类管理权限')
  try {
    const result = await db.runTransaction(async transaction => {
      const current = await readCatalog(transaction)
      if (event.operation === 'assign') {
        const id = text(event.recipeId, 80)
        if (!BUILTIN_CATEGORY_INDEX.has(id)) {
          if (!/^community_[a-zA-Z0-9_-]+$/.test(id) || !await getDocument(transaction, PUBLIC_RECIPES, id)) {
            return failure('NOT_FOUND', '菜谱不存在或已下架，请刷新列表')
          }
        }
      }
      const catalog = changeCatalog(current, event)
      await transaction.collection(META).doc(CATALOG_ID).set({ data: catalog })
      return success({ catalog })
    })
    return result.result || result
  } catch (error) {
    if (['INVALID_CATEGORY', 'CATALOG_CONFLICT'].includes(error.code)) return failure(error.code, error.message)
    throw error
  }
}

async function advanceVersion(transaction, current, deletedRecipeId) {
  const time = Date.now()
  const nextVersion = (Number(current.version) || 0) + 1
  const deletedRecipes = Array.isArray(current.deletedRecipes) ? current.deletedRecipes.slice() : []
  if (deletedRecipeId) deletedRecipes.push({ id: deletedRecipeId, version: nextVersion, deletedAt: time })
  const discarded = deletedRecipes.splice(0, Math.max(0, deletedRecipes.length - DELETION_HISTORY_LIMIT))
  const minDeltaVersion = Math.max(
    Number(current.minDeltaVersion) || 0,
    current.syncProtocol === SYNC_PROTOCOL ? 0 : Number(current.version) || 0,
    ...discarded.map(item => Number(item.version) || 0)
  )
  await transaction.collection(META).doc(META_ID).set({ data: {
    version: nextVersion, updatedAt: time, deletedRecipes, minDeltaVersion, syncProtocol: SYNC_PROTOCOL
  } })
  return nextVersion
}

function coverPath(fileId) {
  const match = String(fileId || '').match(/^cloud:\/\/([^/]+)\/(community-recipe-covers\/[^?#]+)$/)
  const env = process.env.TCB_ENV || cloud.getWXContext().ENV
  return match && env && match[1].startsWith(`${env}.`) ? match[2] : ''
}

async function prepareCover(event, openid) {
  const token = crypto.randomBytes(20).toString('hex')
  const owner = crypto.createHash('sha256').update(openid).digest('hex').slice(0, 24)
  const suffix = ['jpg', 'png', 'webp'].includes(event.suffix) ? event.suffix : 'jpg'
  const cloudPath = `community-recipe-covers/${owner}/${token}.${suffix}`
  await db.collection(META).doc(`cover_${token}`).set({ data: {
    ownerOpenid: openid, cloudPath, createdAt: Date.now(), submissionId: ''
  } })
  return success({ token, cloudPath })
}

async function discardCover(event, openid) {
  const token = text(event.coverToken, 40)
  if (!/^[a-f0-9]{40}$/.test(token)) return failure('INVALID_COVER', '封面凭证无效')
  const result = await db.runTransaction(async transaction => {
    const ticket = await getDocument(transaction, META, `cover_${token}`)
    if (!ticket || ticket.ownerOpenid !== openid || ticket.submissionId) return failure('COVER_IN_USE', '封面已使用或不属于当前用户')
    if (coverPath(event.fileId) !== ticket.cloudPath) return failure('INVALID_COVER', '封面与上传凭证不匹配')
    await transaction.collection(META).doc(`cover_${token}`).remove()
    return success()
  })
  const payload = result.result || result
  if (payload.ok) await cloud.deleteFile({ fileList: [event.fileId] })
  return payload
}

async function submit(event, openid) {
  const recipe = sanitizeRecipe(event.recipe || {}, await readCatalog())
  const clientRecipeId = text(event.recipe && event.recipe.id, 80)
  if (!recipe.name || !recipe.ingredients.length || !recipe.steps.length) {
    return failure('INVALID_RECIPE', '菜名、食材和做法步骤不能为空')
  }
  if (recipe.steps.length < 2) return failure('STEPS_TOO_SHORT', '投稿菜谱至少需要两个做法步骤')
  if (!recipe.allergensReviewed) return failure('ALLERGENS_NOT_REVIEWED', '投稿前请核对并确认主要过敏原')
  const pending = await db.collection(SUBMISSIONS).where({ submitterOpenid: openid, status: 'pending' }).count()
  if (pending.total >= 5) {
    return failure('TOO_MANY_PENDING', '最多同时保留 5 个待审核投稿')
  }
  const time = Date.now()
  const submissionId = crypto.randomBytes(16).toString('hex')
  const coverToken = text(event.coverToken, 40)
  if (recipe.coverImage) {
    if (!/^[a-f0-9]{40}$/.test(coverToken) || !coverPath(recipe.coverImage)) return failure('INVALID_COVER', '请重新选择并上传当前账号的封面')
    const files = await cloud.getTempFileURL({ fileList: [recipe.coverImage] })
    if (!files.fileList || !files.fileList[0] || !files.fileList[0].tempFileURL) return failure('INVALID_COVER', '封面上传尚未完成，请重新选择')
  }
  const result = await db.runTransaction(async transaction => {
    if (recipe.coverImage) {
      const ticket = await getDocument(transaction, META, `cover_${coverToken}`)
      if (!ticket || ticket.ownerOpenid !== openid || ticket.submissionId || ticket.cloudPath !== coverPath(recipe.coverImage) || time - Number(ticket.createdAt) > 86400000) {
        return failure('INVALID_COVER', '封面上传凭证已失效，请重新选择')
      }
      await transaction.collection(META).doc(`cover_${coverToken}`).update({ data: { submissionId } })
    }
    await transaction.collection(SUBMISSIONS).doc(submissionId).set({ data: {
      recipe,
      clientRecipeId,
      submitterOpenid: openid,
      publisherName: text(event.publisherName || '社区用户', 24),
      status: 'pending',
      reviewReason: '',
      createdAt: time,
      updatedAt: time,
      reviewedAt: 0,
      coverToken: recipe.coverImage ? coverToken : ''
    } })
    return success({ submissionId, status: 'pending' })
  })
  return result.result || result
}

async function pull(event) {
  const meta = await getMeta()
  let knownVersion = Math.max(0, Number(event.knownVersion) || 0)
  const version = Number(meta.version) || 0
  if (event.snapshotVersion !== undefined && Number(event.snapshotVersion) !== version) {
    return success({ restart: true, version })
  }
  // 老缓存先全量校准一次，修复旧协议可能遗漏的同版本发布及已过期删除记录。
  if (Number(event.syncProtocol) !== SYNC_PROTOCOL || knownVersion > version || knownVersion < (Number(meta.minDeltaVersion) || 0)) knownVersion = 0
  if (knownVersion && knownVersion === Number(meta.version || 0)) {
    return success({ unchanged: true, version: meta.version, recipes: [] })
  }
  const toRecipe = item => Object.assign({}, item.recipe, {
    id: item._id,
    source: 'community',
    submissionId: item.submissionId,
    publisherName: item.publisherName,
    publishedAt: item.publishedAt,
    createdAt: item.publishedAt,
    updatedAt: item.updatedAt
  })
  if (!knownVersion) {
    const cursor = Math.max(0, Number(event.cursor) || 0)
    const result = await db.collection(PUBLIC_RECIPES).orderBy('publishedAt', 'desc').skip(cursor).limit(100).get()
    if (Number((await getMeta()).version || 0) !== version) return success({ restart: true, version })
    return success({
      unchanged: false,
      mode: 'full',
      version: Number(meta.version) || 0,
      syncProtocol: SYNC_PROTOCOL,
      recipes: result.data.map(toRecipe),
      removedIds: [],
      hasMore: result.data.length === 100,
      nextCursor: cursor + result.data.length
    })
  }
  const result = await db.collection(PUBLIC_RECIPES)
    .where({ version: command.gt(knownVersion) })
    .orderBy('version', 'asc')
    .limit(100)
    .get()
  if (Number((await getMeta()).version || 0) !== version) return success({ restart: true, version })
  const lastRecipeVersion = result.data.reduce((value, item) => Math.max(value, Number(item.version) || 0), knownVersion)
  const hasMore = result.data.length === 100 && lastRecipeVersion < Number(meta.version || 0)
  const nextVersion = hasMore ? lastRecipeVersion : Number(meta.version) || knownVersion
  const removedIds = (Array.isArray(meta.deletedRecipes) ? meta.deletedRecipes : [])
    .filter(item => Number(item.version) > knownVersion && Number(item.version) <= nextVersion)
    .map(item => item.id)
  return success({
    unchanged: false,
    mode: 'delta',
    syncProtocol: SYNC_PROTOCOL,
    version: Number(meta.version) || 0,
    recipes: result.data.map(toRecipe),
    removedIds,
    hasMore,
    nextVersion
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
  const time = Date.now()
  const statusValue = decision === 'approve' ? 'approved' : 'rejected'
  const reason = text(event.reason, 200)
  if (decision === 'reject' && !reason) return failure('REASON_REQUIRED', '驳回时请填写原因')
  const result = await db.runTransaction(async transaction => {
    const submission = await getDocument(transaction, SUBMISSIONS, submissionId)
    if (!submission) return failure('NOT_FOUND', '投稿不存在或已删除')
    if (submission.status !== 'pending') return failure('ALREADY_REVIEWED', '该投稿已经处理')
    if (decision === 'approve') {
      const meta = await getMeta(transaction)
      const catalog = await readCatalog(transaction)
      const nextVersion = await advanceVersion(transaction, meta)
      await transaction.collection(PUBLIC_RECIPES).doc(`community_${submissionId}`).set({ data: {
        recipe: applyRecipeCategories(submission.recipe, catalog), submissionId,
        publisherName: submission.publisherName || '社区用户',
        publishedAt: time, updatedAt: time, version: nextVersion
      } })
    }
    await transaction.collection(SUBMISSIONS).doc(submissionId).update({ data: {
      status: statusValue, reviewReason: reason, reviewerOpenid: openid,
      reviewedAt: time, updatedAt: time
    } })
    return success({ submissionId, status: statusValue })
  })
  return result.result || result
}

async function removeSubmission(event, openid) {
  const submissionId = text(event.submissionId, 80)
  const transactionResult = await db.runTransaction(async transaction => {
    const submission = await getDocument(transaction, SUBMISSIONS, submissionId)
    if (!submission) return failure('NOT_FOUND', '投稿不存在或已删除')
    if (submission.submitterOpenid !== openid) return failure('FORBIDDEN', '只能删除自己的投稿')
    const publicId = `community_${submissionId}`
    const meta = submission.status === 'approved' ? await getMeta(transaction) : null
    const published = meta ? await getDocument(transaction, PUBLIC_RECIPES, publicId) : null
    let ownedCover = ''
    let ownedTicketId = ''
    if (/^[a-f0-9]{40}$/.test(submission.coverToken || '')) {
      const ticketId = `cover_${submission.coverToken}`
      const ticket = await getDocument(transaction, META, ticketId)
      if (ticket && ticket.ownerOpenid === openid && ticket.submissionId === submissionId && ticket.cloudPath === coverPath(submission.recipe && submission.recipe.coverImage)) {
        ownedCover = submission.recipe.coverImage
        ownedTicketId = ticketId
      }
    }
    // 先完成所有读取，再执行写入，便于事务冲突时安全重试。
    if (meta) {
      if (published) await transaction.collection(PUBLIC_RECIPES).doc(publicId).remove()
      await advanceVersion(transaction, meta, publicId)
    }
    if (ownedTicketId) await transaction.collection(META).doc(ownedTicketId).remove()
    await transaction.collection(SUBMISSIONS).doc(submissionId).remove()
    return success({ submissionId, removed: true, clientRecipeId: submission.clientRecipeId || '', coverImage: ownedCover })
  })
  const result = transactionResult.result || transactionResult
  if (!result.ok) return result
  const coverImage = result.data.coverImage
  if (/^cloud:\/\//.test(String(coverImage || ''))) {
    try {
      await cloud.deleteFile({ fileList: [coverImage] })
    } catch (error) {
      console.warn('[removeSubmission] cover cleanup failed', error)
    }
  }
  delete result.data.coverImage
  return result
}

exports.main = async (event) => {
  const context = cloud.getWXContext()
  const openid = context.OPENID
  if (!openid) return failure('UNAUTHORIZED', '无法识别当前微信用户')
  try {
    switch (event && event.action) {
      case 'getCatalog': return success({ catalog: await readCatalog() })
      case 'updateCatalog': return await updateCatalog(event, openid)
      case 'prepareCover': return await prepareCover(event, openid)
      case 'discardCover': return await discardCover(event, openid)
      case 'submit': return await submit(event, openid)
      case 'pull': return await pull(event)
      case 'status': return await status(event, openid)
      case 'mySubmissions': return await mySubmissions(openid)
      case 'reviewQueue': return await reviewQueue(openid)
      case 'review': return await review(event, openid)
      case 'removeSubmission': return await removeSubmission(event, openid)
      default: return failure('UNKNOWN_ACTION', '不支持的操作')
    }
  } catch (error) {
    console.error('[recipeCommunity]', event && event.action, error)
    return failure('SERVER_ERROR', '云端服务暂时不可用，请稍后重试')
  }
}
