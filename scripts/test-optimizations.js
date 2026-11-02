const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')

const root = path.resolve(__dirname, '..')
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const quiet = { log() {}, warn() {}, error() {} }

function load(relativePath, dependencies = {}, globals = {}) {
  const filename = path.join(root, relativePath)
  const nativeRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), Object.assign({
    require: name => Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : nativeRequire(name),
    module, exports: module.exports, console: quiet, setTimeout: () => 1, clearTimeout() {}
  }, globals), { filename })
  return module.exports
}

function localStore() {
  const values = new Map()
  const failures = new Set()
  const wx = {
    env: { USER_DATA_PATH: '/test-user' },
    getStorageSync: key => clone(values.get(key)),
    setStorageSync(key, value) {
      if (failures.has(key)) throw new Error('storage full')
      values.set(key, clone(value))
    },
    removeStorageSync: key => values.delete(key), showToast() {}
  }
  return { wx, values, failures, open: () => load('utils/storage.js', {}, { wx }) }
}

const testRecipe = {
  id: 'community_test', name: '豆腐汤', ingredients: [{ name: '豆腐', amount: '100g' }],
  steps: [{ text: '切块' }, { text: '煮熟' }], allergensReviewed: true
}

function testAtomicCache() {
  const store = localStore()
  let storage = store.open()
  storage.initStorage()
  storage.replaceCommunityRecipes([testRecipe], { version: 5, syncProtocol: 2 })
  assert(storage.flushStateSync())
  store.failures.add('today_eat_community_recipes')
  storage.replaceCommunityRecipes([], { version: 6, syncProtocol: 2 })
  assert.strictEqual(storage.flushStateSync(), false)
  store.failures.clear()
  storage = store.open()
  storage.initStorage()
  assert.strictEqual(storage.getCommunitySync().version, 5, '写失败后应保留上一个完整快照')
  assert.strictEqual(storage.getCommunityRecipes().length, 1)
  store.values.set('today_eat_community_recipes', 'corrupt')
  storage = store.open()
  storage.initStorage()
  assert.strictEqual(storage.getCommunitySync().version, 0, '缓存损坏必须允许重新全量同步')
  store.values.set('today_eat_community_recipes', { cacheVersion: 1, sync: { version: 20 }, recipes: [null] })
  storage = store.open()
  storage.initStorage()
  assert.strictEqual(storage.getCommunitySync().version, 0, '快照内部条目损坏也必须重新同步')
  const personal = store.values.get('today_eat_local_data')
  personal.schemaVersion = 14
  personal.communitySync = { version: 99 }
  store.values.set('today_eat_community_recipes', [testRecipe])
  storage = store.open()
  storage.initStorage()
  assert.strictEqual(storage.getCommunitySync().version, 0, '旧分离式缓存不能信任已推进的版本')
  assert.strictEqual(storage.getCommunityRecipes().length, 1)
}

function cloudStore() {
  const docs = new Map()
  const revisions = new Map()
  let failWrite = ''
  const query = (name, tx) => {
    let conditions = {}
    let order = null
    let offset = 0
    let limit = Infinity
    const api = {
      doc(id) {
        const key = `${name}/${id}`
        return {
          async get() {
            if (tx) tx.reads.set(key, revisions.get(key) || 0)
            return { data: clone(docs.get(key)) || null }
          },
          async set({ data }) { write('set', data) },
          async update({ data }) { write('update', data) },
          async remove() { write('remove') }
        }
        function write(action, data) {
          if (failWrite === key) throw new Error('simulated database write failure')
          if (tx) tx.writes.push({ key, action, data: clone(data) })
          else apply({ key, action, data })
        }
      },
      where(value) { conditions = value; return api },
      orderBy(field, direction) { order = { field, direction }; return api },
      skip(value) { offset = value; return api },
      limit(value) { limit = value; return api },
      async get() {
        let data = Array.from(docs).filter(([key]) => key.startsWith(`${name}/`)).map(([key, value]) => Object.assign({ _id: key.slice(name.length + 1) }, clone(value)))
        data = data.filter(item => Object.entries(conditions).every(([key, value]) => value && value.gt !== undefined ? item[key] > value.gt : item[key] === value))
        if (order) data.sort((a, b) => (a[order.field] - b[order.field]) * (order.direction === 'desc' ? -1 : 1))
        return { data: data.slice(offset, offset + limit) }
      },
      async count() { return { total: (await api.get()).data.length } }
    }
    return api
  }
  function apply({ key, action, data }) {
    if (action === 'remove') docs.delete(key)
    else docs.set(key, action === 'update' ? Object.assign({}, docs.get(key), clone(data)) : clone(data))
    revisions.set(key, (revisions.get(key) || 0) + 1)
  }
  const db = {
    command: { gt: value => ({ gt: value }) },
    collection: name => query(name),
    async runTransaction(callback) {
      for (let retry = 0; retry < 10; retry++) {
        const tx = { reads: new Map(), writes: [] }
        const result = await callback({ collection: name => query(name, tx) })
        if (Array.from(tx.reads).some(([key, version]) => (revisions.get(key) || 0) !== version)) continue
        tx.writes.forEach(apply)
        return { result }
      }
      throw new Error('transaction conflict')
    }
  }
  let openid = 'admin'
  const deleted = []
  const cloud = {
    init() {}, database: () => db, getWXContext: () => ({ OPENID: openid, ENV: 'test-env' }),
    getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://test.invalid/image' })) }),
    async deleteFile({ fileList }) { deleted.push(...fileList) }
  }
  const server = load('cloudfunctions/recipeCommunity/index.js', { 'wx-server-sdk': cloud }, { process: { env: { ADMIN_OPENIDS: 'admin' } } })
  return {
    docs, deleted, call: (event, user = 'admin') => { openid = user; return server.main(event) },
    failAt: key => { failWrite = key }
  }
}

async function testCommunityTransactions() {
  const store = cloudStore()
  for (const id of ['a', 'b']) store.docs.set(`recipe_submissions/${id}`, { recipe: testRecipe, submitterOpenid: 'owner', status: 'pending' })
  const results = await Promise.all(['a', 'b'].map(submissionId => store.call({ action: 'review', submissionId, decision: 'approve' })))
  assert(results.every(result => result.ok))
  assert.strictEqual(store.docs.get('recipe_meta/public-recipes').version, 2)
  assert.notStrictEqual(store.docs.get('public_recipes/community_a').version, store.docs.get('public_recipes/community_b').version)
  assert.strictEqual((await store.call({ action: 'review', submissionId: 'a', decision: 'approve' })).code, 'ALREADY_REVIEWED')
  const removed = await store.call({ action: 'removeSubmission', submissionId: 'a' }, 'owner')
  assert(removed.ok)
  assert(!store.docs.has('public_recipes/community_a'))
  assert.strictEqual(store.docs.get('recipe_meta/public-recipes').version, 3)
  const delta = await store.call({ action: 'pull', knownVersion: 2, syncProtocol: 2 })
  assert.deepStrictEqual(clone(delta.data.removedIds), ['community_a'])
  const oldClient = await store.call({ action: 'pull', knownVersion: 2 })
  assert.strictEqual(oldClient.data.mode, 'full')
  const stalePage = await store.call({ action: 'pull', knownVersion: 0, snapshotVersion: 1 })
  assert(stalePage.data.restart)
  store.docs.set('recipe_submissions/c', { recipe: testRecipe, status: 'pending' })
  store.failAt('recipe_submissions/c')
  assert.strictEqual((await store.call({ action: 'review', submissionId: 'c', decision: 'approve' })).code, 'SERVER_ERROR')
  assert(!store.docs.has('public_recipes/community_c'), '事务失败不得留下半发布数据')
  assert.strictEqual(store.docs.get('recipe_meta/public-recipes').version, 3)
}

async function testCoverOwnership() {
  const store = cloudStore()
  const ticket = (await store.call({ action: 'prepareCover', suffix: 'jpg' }, 'owner')).data
  const coverImage = `cloud://test-env.bucket/${ticket.cloudPath}`
  const recipe = Object.assign({}, testRecipe, { coverImage })
  assert.strictEqual((await store.call({ action: 'submit', recipe, coverToken: ticket.token }, 'other')).code, 'INVALID_COVER')
  const result = await store.call({ action: 'submit', recipe, coverToken: ticket.token }, 'owner')
  assert(result.ok)
  assert.strictEqual((await store.call({ action: 'submit', recipe, coverToken: ticket.token }, 'owner')).code, 'INVALID_COVER')
  assert.strictEqual((await store.call({ action: 'discardCover', coverToken: ticket.token, fileId: coverImage }, 'owner')).code, 'COVER_IN_USE')
  await store.call({ action: 'removeSubmission', submissionId: result.data.submissionId }, 'owner')
  assert.deepStrictEqual(store.deleted, [coverImage])
  const foreignCover = 'cloud://test-env.bucket/recipe-covers/r001.png'
  store.docs.set('recipe_submissions/legacy', { submitterOpenid: 'owner', status: 'pending', recipe: { coverImage: foreignCover } })
  await store.call({ action: 'removeSubmission', submissionId: 'legacy' }, 'owner')
  assert(!store.deleted.includes(foreignCover), '旧投稿不允许删除无归属凭证的云文件')
}

async function testSyncRecovery() {
  const store = localStore()
  const storage = store.open()
  storage.initStorage()
  let requests = 0
  store.wx.cloud = { callFunction: async ({ data }) => {
    if (data.action === 'getCatalog') return { result: { ok: true, data: { catalog: storage.getRecipeCatalog() } } }
    requests++
    const pages = [
      { mode: 'full', version: 1, recipes: [testRecipe], hasMore: true, nextCursor: 1 },
      { restart: true, version: 2 },
      { mode: 'full', version: 2, syncProtocol: 2, recipes: [Object.assign({}, testRecipe, { id: 'community_new' })], hasMore: false }
    ]
    return { result: { ok: true, data: pages[requests - 1] } }
  } }
  const community = load('utils/community.js', { './storage': storage }, { wx: store.wx })
  const one = community.syncPublicRecipes()
  const two = community.syncPublicRecipes()
  assert.strictEqual(one, two, '同一时间只允许一个同步任务')
  await one
  assert.strictEqual(requests, 3)
  assert.strictEqual(storage.getCommunitySync().version, 2)
  assert.deepStrictEqual(clone(storage.getCommunityRecipes().map(recipe => recipe.id)), ['community_new'], '版本变化后不得混合旧分页')
  store.failures.add('today_eat_community_recipes')
  store.wx.cloud.callFunction = async () => ({ result: { ok: true, data: { mode: 'delta', version: 3, syncProtocol: 2, recipes: [], removedIds: ['community_new'] } } })
  await assert.rejects(community.syncPublicRecipes(), error => error.code === 'CACHE_WRITE_FAILED')
  assert.strictEqual(store.values.get('today_eat_community_recipes').sync.version, 2)
}

function testMealRoles() {
  const { BUILTIN_RECIPES } = require('../data/recipes')
  const { getRecipeMealRoles } = require('../utils/recipe-roles')
  const health = require('../utils/health')
  assert(!getRecipeMealRoles({ mealType: '家常热菜', ingredients: [{ name: '青菜' }, { name: '鸡精' }, { name: '蚝油' }] }).includes('protein'))
  assert(!getRecipeMealRoles({ mealType: '家常热菜', ingredients: [{ name: '草鱼' }, { name: '白菜' }] }).includes('vegetable'))
  const profile = { heightCm: 170, adultConfirmed: true, healthRecommendationEnabled: true }
  for (let day = 1; day <= 30; day++) {
    const recommendation = health.buildTimeBasedRecommendation(BUILTIN_RECIPES, profile, { weightKg: 68 }, new Date(2026, 10, day, 12))
    assert.strictEqual(recommendation.items.length, 3)
    for (const item of recommendation.items) {
      const role = { 主食: 'staple', 蛋白质主菜: 'protein', 蔬菜: 'vegetable' }[item.label]
      assert(getRecipeMealRoles(item.recipe).includes(role), `${item.label} 不应推荐 ${item.recipe.name}`)
    }
  }
  const noVegetables = BUILTIN_RECIPES.filter(recipe => !getRecipeMealRoles(recipe).includes('vegetable'))
  const sparse = health.buildTimeBasedRecommendation(noVegetables, profile, { weightKg: 68 }, new Date(2026, 10, 1, 12))
  assert(!sparse.items.some(item => item.label === '蔬菜'), '缺少合适菜谱时不得拿肉菜填充蔬菜位置')
}

async function testImageCooldown() {
  let clock = Date.now()
  let failures = false
  const batches = []
  const wx = { cloud: { getTempFileURL: async ({ fileList }) => {
    batches.push(fileList.length)
    return { fileList: fileList.map(fileID => failures ? { fileID, status: -1 } : { fileID, tempFileURL: `https://test.invalid/${encodeURIComponent(fileID)}`, maxAge: 3600 }) }
  } } }
  const images = load('utils/image-service.js', {}, { wx, Date: class extends Date { static now() { return clock } } })
  const recipe = { id: 'r001', source: 'builtin', name: '番茄炒蛋' }
  const resolved = await images.resolveRecipeImage(recipe)
  assert.strictEqual(images.getRecipeInitialImage(recipe), resolved.url, '首次渲染应复用有效缓存')
  failures = true
  const failed = { id: 'r002', source: 'builtin' }
  await images.resolveRecipeImage(failed)
  const count = batches.length
  await images.resolveRecipeImage(failed)
  assert.strictEqual(batches.length, count, '冷却期间不重复请求缺失图片')
  clock += 31000
  await images.resolveRecipeImage(failed)
  assert.strictEqual(batches.length, count + 1, '冷却结束后可自动重试')
  failures = false
  await images.loadCloudCovers(Array.from({ length: 120 }, (_, index) => ({ id: `cloud_${index}`, coverImage: `cloud://test.bucket/covers/${index}.jpg`, source: 'community' })))
  assert(batches.every(size => size <= 50), '请求必须按 SDK 限额分批')
}

function makePage(file, dependencies, globals = {}) {
  let definition
  load(file, dependencies, Object.assign({ Page: value => { definition = value } }, globals))
  const page = Object.assign({}, definition, { data: clone(definition.data), patches: [] })
  page.setData = (patch, callback) => {
    page.patches.push(clone(patch))
    Object.entries(patch).forEach(([key, value]) => {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let object = page.data
      for (const part of parts.slice(0, -1)) object = object[part]
      object[parts[parts.length - 1]] = clone(value)
    })
    if (callback) callback()
  }
  return page
}

async function testPageUpdates() {
  const store = localStore()
  const storage = store.open()
  storage.initStorage()
  const details = load('features/utils/recipe-details.js', { '../../utils/storage': storage })
  assert.strictEqual(storage.getRecipe('r001').steps.length, 0)
  const fullRecipe = details.getRecipe('r001')
  assert(fullRecipe.steps.length >= 2 && fullRecipe.ingredients.length > 0, '进入分包后必须取到完整详情')
  storage.saveBuiltinRecipeOverride(Object.assign({}, fullRecipe, { name: '本地版本' }))
  assert.strictEqual(details.getRecipe('r001').name, '本地版本')
  assert.strictEqual(details.getRecipe('r001').steps.length, fullRecipe.steps.length)
  storage.clearBuiltinRecipeOverride('r001')
  const images = { getRecipeInitialImage: () => '', hydrateRecipeCovers: async recipes => recipes.map(recipe => Object.assign({}, recipe, { coverImage: '' })) }
  const home = makePage('pages/index/index.js', {
    '../../utils/storage': storage, '../../utils/image-service': images,
    '../../utils/share': { enableShareMenu() {} }
  })
  home.onShow()
  await Promise.resolve()
  assert.strictEqual(home.data.visibleRecipes.length, 16)
  home.onReachBottom()
  assert.strictEqual(home.data.visibleRecipes.length, 32)
  const append = home.patches.find(patch => patch.loadedRecipeCount === 32)
  assert(!Object.prototype.hasOwnProperty.call(append, 'visibleRecipes'), '分页不应重新传输整个列表')
  assert(Object.prototype.hasOwnProperty.call(append, 'visibleRecipes[16]'))
  home.onShow()
  assert.strictEqual(home.data.visibleRecipes.length, 32, '从详情返回不应重置已加载页')
  storage.saveProfile({ allergies: ['蛋'] })
  home.onShow()
  assert(home.filteredRecipes.every(recipe => !recipe.allergens.includes('蛋')), '更改忌口后仍需刷新列表')
  for (let index = 0; index < 45; index++) storage.saveCustomRecipe(Object.assign({}, testRecipe, { id: `custom_${index}` }))
  const library = makePage('pages/library/library.js', { '../../utils/storage': storage })
  library.loadRecipes()
  assert.strictEqual(library.data.customRecipes.length, 20)
  assert.strictEqual(library.data.customRecipes[0].steps, undefined, '列表卡片不能携带完整步骤')
  library.loadMoreCustom()
  assert.strictEqual(library.data.customRecipes.length, 40)
  library.loadRecipes()
  assert.strictEqual(library.data.customRecipes.length, 40)
  await Promise.resolve()
}

async function testAdminCatalog() {
  const { changeCatalog, defaultCatalog, applyRecipeCategories } = require('../utils/recipe-catalog')
  const { getRecipeMealRoles } = require('../utils/recipe-roles')
  const server = cloudStore()
  server.docs.set('recipe_meta/public-recipes', { version: 7, syncProtocol: 2 })
  server.docs.set('public_recipes/community_published', { recipe: testRecipe, version: 7, publishedAt: 1, updatedAt: 1 })
  const forbidden = await server.call({ action: 'updateCatalog', expectedRevision: 0, operation: 'add', field: 'cuisines', name: '客家菜' }, 'reader')
  assert.strictEqual(forbidden.code, 'FORBIDDEN')
  assert(!server.docs.has('recipe_meta/recipe-catalog'))
  let catalog = (await server.call({ action: 'getCatalog' }, 'reader')).data.catalog
  const update = async change => {
    const response = await server.call(Object.assign({ action: 'updateCatalog', expectedRevision: catalog.revision }, change))
    assert(response.ok, response.message)
    catalog = response.data.catalog
    return catalog
  }
  await update({ operation: 'add', field: 'cuisines', name: '客家菜' })
  await update({ operation: 'add', field: 'mealTypes', name: '夜宵' })
  await update({ operation: 'assign', recipeId: 'r001', cuisine: '客家菜', mealType: '夜宵' })
  await update({ operation: 'assign', recipeId: 'community_published', cuisine: '东北菜', mealType: '汤羹' })
  const local = localStore()
  let storage = local.open()
  storage.initStorage()
  local.wx.cloud = { callFunction: async ({ data }) => ({ result: await server.call(data, 'reader') }) }
  const community = load('utils/community.js', { './storage': storage }, { wx: local.wx })
  const result = await community.syncPublicRecipes()
  assert.strictEqual(result.catalogChanged, true)
  assert.strictEqual(storage.getRecipe('r001').cuisine, '客家菜')
  assert.strictEqual(storage.getRecipe('r001').mealType, '夜宵')
  assert.strictEqual(storage.getRecipe('community_published').cuisine, '东北菜')
  const details = load('features/utils/recipe-details.js', { '../../utils/storage': storage })
  assert.strictEqual(details.getRecipe('r001').mealType, '夜宵')
  assert(details.getRecipe('r001').steps.length > 1)
  await update({ operation: 'rename', field: 'cuisines', name: '客家菜', target: '客家风味' })
  const categoryOnly = await community.syncPublicRecipes()
  assert.strictEqual(categoryOnly.unchanged, true)
  assert.strictEqual(categoryOnly.catalogChanged, true, '食谱正文版本未变时也应同步分类')
  assert.strictEqual(storage.getRecipe('r001').cuisine, '客家风味')
  await update({ operation: 'move', field: 'cuisines', name: '客家风味', direction: -1 })
  assert.strictEqual(catalog.cuisines.indexOf('客家风味'), catalog.cuisines.length - 2)
  await update({ operation: 'merge', field: 'cuisines', name: '客家风味', target: '家常菜' })
  await community.syncPublicRecipes()
  assert(!storage.getRecipeCatalog().cuisines.includes('客家风味'))
  assert.strictEqual(storage.getRecipe('r001').cuisine, '家常菜')
  assert.strictEqual((await server.call({ action: 'updateCatalog', operation: 'assign', expectedRevision: catalog.revision, recipeId: 'custom_private', cuisine: '家常菜', mealType: '主食' })).code, 'NOT_FOUND')
  const stale = catalog.revision
  const race = await Promise.all(['第一类', '第二类'].map(name => server.call({ action: 'updateCatalog', expectedRevision: stale, operation: 'add', field: 'cuisines', name })))
  assert.strictEqual(race.filter(response => response.ok).length, 1)
  assert.strictEqual(race.filter(response => response.code === 'CATALOG_CONFLICT').length, 1)
  await community.syncPublicRecipes()
  storage = local.open()
  storage.initStorage()
  assert(storage.getRecipeCatalog().mealTypes.includes('夜宵'), '重启及离线时仍可读取分类缓存')
  const { BUILTIN_RECIPES } = require('../data/recipes')
  const recipe = BUILTIN_RECIPES.find(item => item.id === 'r001')
  const privateVersion = Object.assign({}, recipe, { isLocalOverride: true, cuisine: '川菜' })
  const assigned = Object.assign({}, storage.getRecipeCatalog(), { assignments: { r001: { cuisine: '东北菜', mealType: '早餐' } } })
  assert.strictEqual(applyRecipeCategories(privateVersion, assigned).cuisine, '川菜', '管理员单菜覆盖不应影响私人修改')
  const renamed = changeCatalog(defaultCatalog(), { expectedRevision: 0, operation: 'rename', field: 'mealTypes', name: '主食', target: '谷物主食' })
  const rice = BUILTIN_RECIPES.find(item => item.mealType === '主食')
  assert(getRecipeMealRoles(applyRecipeCategories(rice, renamed)).includes('staple'), '分类改名不能改变搭配角色')
  const renamedAgain = changeCatalog(renamed, { expectedRevision: 1, operation: 'rename', field: 'mealTypes', name: '谷物主食', target: '主食' })
  assert.strictEqual(applyRecipeCategories(rice, renamedAgain).mealType, '主食', '分类名应能安全改回')
  assert.throws(() => changeCatalog(defaultCatalog(), { expectedRevision: 0, operation: 'add', field: 'cuisines', name: '川菜' }))
  assert.throws(() => changeCatalog(defaultCatalog(), { expectedRevision: 0, operation: 'add', field: 'cuisines', name: '__proto__' }))
  const home = makePage('pages/index/index.js', { '../../utils/storage': storage, '../../utils/share': { enableShareMenu() {} } })
  home.onShow()
  assert(home.data.mealTypes.includes('夜宵'))
  const editor = makePage('features/editor/editor.js', { '../../utils/storage': storage }, { wx: { setNavigationBarTitle() {} } })
  editor.onLoad({})
  assert(editor.data.mealTypes.includes('夜宵'))
  storage.saveCustomRecipe(Object.assign({}, testRecipe, { id: 'private_breakfast', mealType: '早餐', cuisine: '川菜' }))
  const privateCatalog = changeCatalog(storage.getRecipeCatalog(), { expectedRevision: storage.getRecipeCatalog().revision, operation: 'rename', field: 'mealTypes', name: '早餐', target: '早饭' })
  storage.saveRecipeCatalog(privateCatalog)
  assert.strictEqual(storage.getCustomRecipes().find(recipe => recipe.id === 'private_breakfast').mealType, '早饭', '收藏菜谱页也应读取更新后的分类名称')
  assert.strictEqual(storage.getCustomRecipes().find(recipe => recipe.id === 'private_breakfast').cuisine, '川菜')
  const adminPage = makePage('features/categories/categories.js', { '../../utils/storage': storage })
  adminPage.catalog = storage.getRecipeCatalog()
  adminPage.refreshView()
  assert.strictEqual(adminPage.data.recipes.length, 20)
  assert.strictEqual(adminPage.data.recipes[0].steps, undefined)
  adminPage.loadMore()
  assert.strictEqual(adminPage.data.recipes.length, 40)
  assert(adminPage.data.recipes.every(row => row.cuisineIndex >= 0 && row.mealTypeIndex >= 0))
  await Promise.resolve()
}

async function testCategoryDeletion() {
  const { defaultCatalog, changeCatalog, applyRecipeCategories } = require('../utils/recipe-catalog')
  const original = defaultCatalog()
  const removed = changeCatalog(original, { expectedRevision: 0, operation: 'delete', field: 'cuisines', name: '川菜', target: '家常菜' })
  assert(!removed.cuisines.includes('川菜'))
  assert(original.cuisines.includes('川菜'), '删除不得直接修改输入快照')
  assert.strictEqual(applyRecipeCategories({ id: 'r002', source: 'builtin', cuisine: '川菜', mealType: '家常热菜' }, removed).cuisine, '家常菜')
  const renamed = changeCatalog(original, { expectedRevision: 0, operation: 'rename', field: 'cuisines', name: '川菜', target: '川味' })
  const aliasRemoved = changeCatalog(renamed, { expectedRevision: 1, operation: 'delete', field: 'cuisines', name: '川味', target: '东北菜' })
  assert.strictEqual(applyRecipeCategories({ cuisine: '川菜', mealType: '家常热菜' }, aliasRemoved).cuisine, '东北菜', '历史改名引用也应转移')
  assert.throws(() => changeCatalog(Object.assign(defaultCatalog(), { cuisines: ['唯一分类'] }), {
    expectedRevision: 0, operation: 'delete', field: 'cuisines', name: '唯一分类', target: '唯一分类'
  }), error => error.code === 'INVALID_CATEGORY' && error.message.includes('至少保留'))
  const mealRemoved = changeCatalog(original, { expectedRevision: 0, operation: 'delete', field: 'mealTypes', name: '早餐', target: '主食' })
  assert(!mealRemoved.mealTypes.includes('早餐'))
  const server = cloudStore()
  server.docs.set('public_recipes/community_keep', { recipe: Object.assign({}, testRecipe, { cuisine: '川菜' }), version: 1 })
  const beforeRecipe = clone(server.docs.get('public_recipes/community_keep'))
  const event = { action: 'updateCatalog', expectedRevision: 0, operation: 'delete', field: 'cuisines', name: '川菜', target: '家常菜' }
  assert.strictEqual((await server.call(event, 'reader')).code, 'FORBIDDEN')
  const result = await server.call(event)
  assert(result.ok)
  assert.deepStrictEqual(server.docs.get('public_recipes/community_keep'), beforeRecipe, '删除分类不得删除或改写菜谱内容')
  assert.strictEqual((await server.call(event)).code, 'CATALOG_CONFLICT')
  assert.strictEqual((await server.call(Object.assign({}, event, { expectedRevision: 1, name: '湘菜', target: '不存在' }))).code, 'INVALID_CATEGORY')
  assert.strictEqual(server.docs.get('recipe_meta/recipe-catalog').revision, 1)

  const local = localStore()
  const storage = local.open()
  storage.initStorage()
  const modals = []
  const page = makePage('features/categories/categories.js', { '../../utils/storage': storage }, {
    wx: { showModal: modal => modals.push(modal), showToast() {} }
  })
  page.catalog = changeCatalog(original, { expectedRevision: 0, operation: 'add', field: 'cuisines', name: '空分类' })
  page.refreshView()
  let dispatched = null
  page.performChange = change => { dispatched = change }
  page.openDelete({ currentTarget: { dataset: { name: '空分类' } } })
  assert.strictEqual(modals.length, 1)
  assert.strictEqual(dispatched, null)
  modals[0].success({ confirm: false })
  assert.strictEqual(dispatched, null, '取消删除不能发送修改请求')
  modals[0].success({ confirm: true })
  assert.strictEqual(dispatched.operation, 'delete')
  assert.strictEqual(dispatched.name, '空分类')
  dispatched = null
  page.openDelete({ currentTarget: { dataset: { name: '川菜' } } })
  assert(page.data.mergeVisible && page.data.mergeRecipeCount > 0)
  assert.strictEqual(page.data.mergeTargetIndex, -1)
  page.confirmMerge()
  assert.strictEqual(dispatched, null, '有菜谱的分类必须主动选择接收分类')
  page.chooseMergeTarget({ detail: { value: '1' } })
  page.confirmMerge()
  assert.strictEqual(dispatched.operation, 'delete')
  assert.strictEqual(dispatched.target, page.data.mergeOptions[0], '接收列表第一项也能正常选择')
}

async function main() {
  testAtomicCache()
  await testCommunityTransactions()
  await testCoverOwnership()
  await testSyncRecovery()
  testMealRoles()
  await testImageCooldown()
  await testPageUpdates()
  await testAdminCatalog()
  await testCategoryDeletion()
  console.log('优化回归测试通过：缓存、事务、同步、封面、套餐、图片、页面、管理员分类与安全删除')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
