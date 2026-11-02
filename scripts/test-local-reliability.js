const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')
const root = path.resolve(__dirname, '..')
const clone = value => value === undefined ? value : JSON.parse(JSON.stringify(value))

function load(file, dependencies = {}, globals = {}) {
  const filename = path.join(root, file)
  const native = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), Object.assign({
    require: name => Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : native(name),
    module, exports: module.exports, console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 2, clearInterval() {},
    unescape, encodeURIComponent
  }, globals), { filename })
  return module.exports
}

function makePage(file, dependencies = {}, globals = {}) {
  let definition
  load(file, dependencies, Object.assign({}, globals, { Page: page => { definition = page } }))
  const page = Object.assign({}, definition, { data: clone(definition.data), patches: [] })
  page.setData = (patch, callback) => {
    page.patches.push(clone(patch))
    Object.entries(patch).forEach(([key, value]) => {
      const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      keys.slice(0, -1).forEach(key => { target = target[key] })
      target[keys[keys.length - 1]] = clone(value)
    })
    if (callback) callback()
  }
  return page
}

function localStore() {
  const values = new Map()
  const files = new Map()
  const directories = new Set(['/local'])
  const failures = new Set()
  const toasts = []
  const modals = []
  let modalConfirm = true
  let writeCount = 0
  let failFileWriteAt = 0
  const fileSystem = {
    accessSync(file) { if (!files.has(file) && !directories.has(file)) throw new Error('ENOENT') },
    mkdirSync(directory) { directories.add(directory) },
    readdirSync(directory) { return [...files.keys()].filter(file => file.startsWith(directory + '/') && !file.slice(directory.length + 1).includes('/')).map(file => file.slice(directory.length + 1)) },
    saveFileSync(source, destination) {
      if (!files.has(source)) throw new Error('ENOENT')
      files.set(destination, files.get(source)); files.delete(source)
    },
    unlinkSync(file) { files.delete(file) },
    getFileInfo({ filePath, success, fail }) {
      if (!files.has(filePath)) return fail({ errMsg: 'ENOENT' })
      success({ size: files.get(filePath).length })
    },
    readFile({ filePath, encoding, success, fail }) {
      if (!files.has(filePath)) return fail({ errMsg: 'ENOENT' })
      success({ data: files.get(filePath).toString(encoding === 'base64' ? 'base64' : 'utf8') })
    },
    writeFile({ filePath, data, encoding, success, fail }) {
      writeCount++
      if (writeCount === failFileWriteAt) return fail({ errMsg: 'storage full' })
      files.set(filePath, Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8')); success({})
    },
    mkdir({ dirPath, success }) { directories.add(dirPath); success({}) },
    readdir({ dirPath, success, fail }) {
      if (!directories.has(dirPath)) return fail({ errMsg: 'ENOENT' })
      success({ files: [...files.keys()].filter(file => file.startsWith(dirPath + '/')).map(file => file.slice(dirPath.length + 1)) })
    },
    stat({ path, success }) { success({ stats: { size: files.get(path).length,
      lastModifiedTime: Date.now() - 48 * 3600000, isFile: () => true } }) },
    unlink({ filePath, success }) { files.delete(filePath); success({}) }
  }
  const wx = {
    env: { USER_DATA_PATH: '/local' },
    getStorageSync: key => clone(values.get(key)),
    setStorageSync(key, value) {
      if (failures.has(key)) throw new Error('storage full')
      values.set(key, clone(value))
    },
    removeStorageSync: key => values.delete(key),
    getFileSystemManager: () => fileSystem,
    showToast: value => toasts.push(value),
    showModal(options) { modals.push(options); if (options.success) options.success({ confirm: modalConfirm, cancel: !modalConfirm }) },
    setNavigationBarTitle() {}, navigateBack() {},
    enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {}
  }
  return { wx, values, files, directories, failures, toasts, modals, fileSystem,
    setModalConfirm(value) { modalConfirm = value },
    failNextFileWrite(offset = 1) { failFileWriteAt = writeCount + offset },
    open: () => load('utils/storage.js', {}, { wx }) }
}

const fixture = {
  id: 'custom_example', name: '番茄豆腐汤', ingredients: [{ name: '豆腐', amount: '200g', note: '切丁', noteKind: 'prep' }],
  seasonings: [{ name: '蒜末', amount: '2g' }], allergens: ['豆制品'], healthTags: ['日常均衡', '轻盈低卡'],
  drawPools: ['家常快手', '均衡健康'], servings: 2, durationMinutes: 20,
  steps: [{ id: 'prep', text: '豆腐切丁后放入锅中煮开', imageCloudPaths: ['recipe-steps/r001/001.jpg'] }, { id: 'finish', text: '调味煮熟后盛出' }],
  referenceName: 'Wikibooks 中文改编', referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:French_Toast',
  sourceLicense: 'CC BY-SA 4.0', sourceLicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/'
}

function testRestrictions() {
  const health = require('../utils/health')
  assert.strictEqual(health.filterRecipesByDietaryRestrictions([fixture], { avoidedIngredients: ['大蒜'] }).length, 0)
  assert.strictEqual(health.filterRecipesByDietaryRestrictions([{ ingredients: [{ name: '西红柿' }], allergens: [] }], { avoidedIngredients: ['番茄'] }).length, 0)
  assert.strictEqual(health.filterRecipesByDietaryRestrictions([{ ingredientKeywords: ['芫荽'], allergens: [] }], { avoidedIngredients: ['香菜'] }).length, 0)
  assert.strictEqual(health.filterRecipesByDietaryRestrictions([fixture], { avoidedIngredients: ['花生'] }).length, 1)
  assert.strictEqual(health.filterRecipesByDietaryRestrictions([fixture], { allergies: ['豆制品'] }).length, 0)
}

function testDurableStorage() {
  const store = localStore()
  const storage = store.open()
  storage.initStorage()
  store.files.set('/temp/photo.jpg', Buffer.from('original-photo'))
  const coverImage = storage.saveRecipeImageFile('/temp/photo.jpg')
  const saved = storage.saveCustomRecipe(Object.assign({}, fixture, { coverImage }))
  assert(saved.ingredientKeywords.includes('蒜末'))
  const before = clone(store.values.get(storage.STORAGE_KEY))
  store.failures.add(storage.STORAGE_KEY)
  assert.throws(() => storage.saveCustomRecipe(Object.assign({}, saved, { name: '不应保存' })))
  assert.strictEqual(storage.getRecipe(saved.id).name, fixture.name)
  assert.deepStrictEqual(store.values.get(storage.STORAGE_KEY), before)
  assert.throws(() => storage.deleteCustomRecipe(saved.id))
  assert(store.files.has(coverImage), '删除失败时保留旧图')
  assert.throws(() => storage.saveHealthRecord({ heightCm: 180 }, '2026-11-02', 80))
  assert.strictEqual(storage.getProfile().heightCm, null)
  assert.strictEqual(storage.getWeightRecords().length, 0)
  store.failures.clear()
  const reloaded = store.open()
  reloaded.initStorage()
  const recipe = reloaded.getRecipe(saved.id)
  assert.strictEqual(recipe.sourceLicenseUrl, saved.sourceLicenseUrl)
  assert.strictEqual(recipe.steps[0].imageCloudPaths[0], saved.steps[0].imageCloudPaths[0])
  assert.strictEqual(recipe.ingredients[0].note, '切丁')
  reloaded.saveHealthRecord({ heightCm: 170 }, '2026-11-02', 68)
  reloaded.saveHealthRecord({ heightCm: 170 }, '2026-11-02', 69)
  assert.strictEqual(reloaded.getWeightRecords().length, 1)
  assert.strictEqual(reloaded.getWeightRecords()[0].weightKg, 69)
  return { store, storage: reloaded, saved }
}

function editorFor(store, storage) {
  return makePage('features/editor/editor.js', {
    '../../utils/storage': storage, '../utils/recipe-details': { getRecipe: id => storage.getRecipe(id) },
    '../utils/local-files': { prepareRecipeImage: async src => src }, '../../utils/community': { isAvailable: () => false }
  }, { wx: store.wx })
}

function testEditorAndDrafts() {
  const { store, storage, saved } = testDurableStorage()
  const page = editorFor(store, storage)
  page.onLoad({ id: saved.id })
  const revisionBeforeDraft = storage.getRecipeRevision()
  page.updateField({ currentTarget: { dataset: { field: 'description' } }, detail: { value: '只修改简介' } })
  page.saveDraft()
  assert.strictEqual(storage.getRecipeRevision(), revisionBeforeDraft, '草稿自动保存不能反复重建首页菜谱缓存')
  assert(storage.getEditorDraft(`edit:${saved.id}:0`))
  const restored = editorFor(store, storage)
  restored.onLoad({ id: saved.id })
  assert.strictEqual(restored.data.form.description, '只修改简介')
  const built = restored.buildRecipe()
  assert.strictEqual(built.referenceUrl, saved.referenceUrl)
  assert.strictEqual(built.steps[0].imageCloudPaths[0], saved.steps[0].imageCloudPaths[0])
  assert.strictEqual(built.ingredients[0].note, '切丁')
  assert.deepStrictEqual(clone(built.healthTags), clone(saved.healthTags), '未修改标签时保留多标签')
  store.failures.add(storage.STORAGE_KEY)
  restored.save()
  assert(!store.toasts.some(item => item.title === '菜谱已保存'), '落盘失败不能提示成功')
  assert(store.files.has(saved.coverImage), '失败不能提前清理旧封面')
  assert(storage.getEditorDraft(`edit:${saved.id}:0`), '失败保留可恢复草稿')
  store.failures.clear()
  restored.save()
  assert(store.toasts.some(item => item.title === '菜谱已保存'))
  assert.strictEqual(storage.getEditorDraft(`edit:${saved.id}:0`), null)
  assert.strictEqual(storage.getRecipe(saved.id).referenceUrl, saved.referenceUrl)
  assert.strictEqual(storage.getRecipe(saved.id).steps[0].imageCloudPaths[0], saved.steps[0].imageCloudPaths[0])
  const builtin = require('../features/data/recipe-details').getBuiltinRecipe('w013')
  storage.saveBuiltinRecipeOverride(builtin)
  const direct = editorFor(store, storage)
  direct.onLoad({ id: builtin.id, direct: '1' })
  direct.updateField({ currentTarget: { dataset: { field: 'description' } }, detail: { value: '个人修改' } })
  direct.persistRecipe(direct.buildRecipe())
  assert.strictEqual(storage.getRecipe(builtin.id).sourceLicenseUrl, builtin.sourceLicenseUrl)
  assert.strictEqual(storage.getRecipe(builtin.id).referenceRevisionUrl, builtin.referenceRevisionUrl)
  const legacyOverride = { ...builtin, referenceName: '', referenceUrl: '', sourceLicense: '', sourceLicenseUrl: '' }
  storage.saveBuiltinRecipeOverride(legacyOverride)
  const details = load('features/utils/recipe-details.js', { '../../utils/storage': storage })
  assert.strictEqual(details.getRecipe(builtin.id).referenceUrl, builtin.referenceUrl, '已知内置ID可以恢复旧版丢失的出处')
}

async function testBackup() {
  const { store, storage, saved } = testDurableStorage()
  store.files.set('/local/avatar_test.jpg', Buffer.from('avatar'))
  storage.commitPersonalChange(state => { state.profile.nickname = '访客'; state.profile.avatarPath = '/local/avatar_test.jpg'; return state })
  storage.replaceCommunityRecipes([{ ...fixture, id: 'community_keep' }], { version: 8, syncProtocol: 2 })
  const helpers = load('features/utils/local-files.js', { '../../utils/storage': storage }, { wx: store.wx })
  const backup = load('features/utils/local-backup.js', { '../../utils/storage': storage, './local-files': helpers }, { wx: store.wx })
  const file = await backup.createBackup()
  const text = store.files.get(file).toString()
  const parsed = backup.validateBackup(text)
  assert.strictEqual(parsed.data.communityRecipes, undefined)
  assert.strictEqual(parsed.data.editorDrafts, undefined)
  assert.strictEqual(parsed.data.profile.avatarPath, 'backup://img_0')
  assert.strictEqual(Object.keys(parsed.images).length, 2)
  assert(!text.includes('/local/'), '跨设备备份不应保留机器文件路径')
  assert.throws(() => backup.validateBackup(text.replace('"version":1', '"version":99')))
  assert.throws(() => backup.validateBackup(text.replace('"version":1', '"constructor":{},"version":1')))
  const missing = clone(parsed); delete missing.images.img_0
  assert.throws(() => backup.validateBackup(JSON.stringify(missing)))
  const future = clone(parsed); future.data.schemaVersion = 1000
  assert.throws(() => backup.validateBackup(JSON.stringify(future)))
  const invalid = clone(parsed); invalid.data.customRecipes.push(null)
  assert.throws(() => backup.validateBackup(JSON.stringify(invalid)))
  const badDate = clone(parsed); badDate.data.weightRecords[0].date = '2026-02-30'
  assert.throws(() => backup.validateBackup(JSON.stringify(badDate)))
  const collision = clone(parsed); collision.data.customRecipes[0].id = 'r001'
  assert.throws(() => backup.validateBackup(JSON.stringify(collision)))
  const largeImage = clone(parsed); largeImage.images.img_0.base64 = Buffer.alloc(1024 * 1024).toString('base64')
  assert(backup.validateBackup(JSON.stringify(largeImage)), 'MB级真实备份也应能校验')
  storage.commitPersonalChange(state => { state.profile.nickname = '恢复前'; return state })
  const before = clone(store.values.get(storage.STORAGE_KEY))
  const beforeFiles = new Set(store.files.keys())
  store.failNextFileWrite(2)
  await assert.rejects(() => backup.restoreBackup(parsed))
  assert.strictEqual(storage.getProfile().nickname, '恢复前')
  assert.deepStrictEqual(new Set(store.files.keys()), beforeFiles, '部分图片写失败后回收已经写入的新文件')
  store.failures.add(storage.STORAGE_KEY)
  await assert.rejects(() => backup.restoreBackup(parsed))
  assert.deepStrictEqual(store.values.get(storage.STORAGE_KEY), before)
  assert.deepStrictEqual(new Set(store.files.keys()), beforeFiles, '数据提交失败后清理新图，保留旧图')
  store.failures.clear()
  await backup.restoreBackup(parsed)
  assert.strictEqual(storage.getProfile().nickname, '访客')
  assert(store.files.has(storage.getProfile().avatarPath))
  assert(!store.files.has('/local/avatar_test.jpg'), '恢复成功后才清理旧图')
  assert(store.files.has(storage.getRecipe(saved.id).coverImage))
  assert.strictEqual(storage.getCommunityRecipes()[0].id, 'community_keep')
  assert.strictEqual(storage.getCommunitySync().version, 8)
  const reloaded = store.open(); reloaded.initStorage()
  assert.strictEqual(reloaded.getProfile().nickname, '访客')
  assert.strictEqual(reloaded.getRecipe(saved.id).sourceLicenseUrl, fixture.sourceLicenseUrl)
  return { store, storage, helpers }
}

async function testImageManagement() {
  const { store, storage, helpers } = await testBackup()
  const orphan = '/local/recipe_images/recipe_orphan.jpg'
  const referenced = '/local/recipe_images/recipe_draft.jpg'
  const recent = '/local/recipe_images/recipe_recent.jpg'
  store.files.set(orphan, Buffer.from('orphan'))
  store.files.set(referenced, Buffer.from('draft'))
  store.files.set(recent, Buffer.from('recent'))
  const stat = store.fileSystem.stat
  store.fileSystem.stat = options => options.path === recent
    ? options.success({ stats: { size: 6, lastModifiedTime: Date.now(), isFile: () => true } }) : stat(options)
  storage.saveEditorDraft('new', { form: { coverImage: referenced, steps: [] } })
  const usage = await helpers.getImageUsage()
  assert(usage.unused.some(item => item.filePath === orphan))
  assert(!usage.unused.some(item => item.filePath === referenced || item.filePath === recent))
  assert.strictEqual(await helpers.cleanUnusedImages(), 1)
  assert(!store.files.has(orphan) && store.files.has(referenced) && store.files.has(recent))
  storage.deleteUserFile('/local/../foreign.jpg')
  storage.deleteUserFile('/another/local/recipe.jpg')
  storage.clearAllPersonalData()
  assert.strictEqual(storage.getCustomRecipes().length, 0)
  assert.strictEqual(storage.getEditorDraft('new'), null)
  assert(!store.files.has(referenced), '清除个人数据也应清除草稿图片')
  assert(!store.files.has(recent), '全部清除与普通清理不同，连未引用的新图也应清理')
  assert(!store.files.has('/local/recipe_backups/今日食签-个人备份.json'), '清除个人数据不能遗留含健康记录的本地备份副本')
}

function testTimerAndLibrary() {
  const store = localStore()
  const storage = store.open(); storage.initStorage()
  let now = 100000
  class TestDate extends Date { static now() { return now } }
  const cook = makePage('features/cook/cook.js', {
    '../../utils/storage': storage, '../utils/recipe-details': { getRecipe: () => fixture },
    '../../utils/image-service': { hydrateRecipeStepImages: async recipe => recipe }
  }, { wx: store.wx, Date: TestDate })
  cook.onLoad({ id: fixture.id })
  cook.toggleTimer()
  now += 3200; cook.updateElapsed()
  assert.strictEqual(cook.data.elapsed, 3)
  cook.onHide(); now += 60000; cook.onShow()
  assert.strictEqual(cook.data.elapsed, 63, '后台时间按时间戳累计，不依赖 interval 次数')
  cook.toggleTimer(); now += 20000; cook.onShow()
  assert.strictEqual(cook.data.elapsed, 63, '主动暂停期间不累计')
  cook.toggleTimer(); now += 1800; cook.stopTimer()
  assert.strictEqual(cook.data.elapsed, 65, '多次暂停保留不足1秒的余量')
  storage.saveCustomRecipe(fixture)
  storage.toggleFavorite('r001')
  const library = makePage('pages/library/library.js', {
    '../../utils/storage': storage, '../../utils/share': { enableShareMenu() {} }
  })
  library.onShow()
  library.setData({ searchQuery: '西红柿' }); library.applyLibraryFilters()
  assert(library.data.favoriteRecipes.some(recipe => recipe.id === 'r001'))
  library.setData({ searchQuery: '蒜' }); library.applyLibraryFilters()
  assert.strictEqual(library.data.customTotal, 1, '个人菜谱搜索包含调味料')
  library.setData({ searchQuery: '绝对没有的菜名' }); library.applyLibraryFilters()
  assert.strictEqual(library.data.customTotal + library.data.favoriteTotal, 0)
  library.clearFilters()
  assert.strictEqual(library.data.customTotal, 1)
}

async function testImageCompression() {
  const store = localStore()
  let size = 200000
  let args
  store.wx.getImageInfo = options => options.success(options.src === '/temp/original' ? { width: 4000, height: 3000 } : { width: 1280, height: 960 })
  store.wx.compressImage = options => { args = options; options.success({ tempFilePath: '/temp/small' }) }
  store.fileSystem.getFileInfo = options => options.success({ size })
  const files = load('features/utils/local-files.js', { '../../utils/storage': store.open() }, { wx: store.wx })
  assert.strictEqual(await files.prepareRecipeImage('/temp/original'), '/temp/small')
  assert.strictEqual(args.compressedWidth, 1280)
  assert.strictEqual(args.compressedHeight, 960)
  size = 2 * 1024 * 1024
  await assert.rejects(() => files.prepareRecipeImage('/temp/original'))
  size = 200000
  store.wx.getImageInfo = options => options.success({ width: 4000, height: 3000 })
  await assert.rejects(() => files.prepareRecipeImage('/temp/original'), '基础库忽略尺寸参数时不直接保存超大图片')
}

async function testPreservedStepImagesAndAttribution() {
  const store = localStore()
  store.wx.cloud = { getTempFileURL: async ({ fileList }) => ({ fileList: fileList.map(fileID => ({ fileID, tempFileURL: 'https://example.com/step.jpg', maxAge: 7200 })) }) }
  const images = load('utils/image-service.js', { '../config/cloudbase': {
    isCloudCoverEnabled: () => true, getRecipeStepImageFileId: value => 'cloud://test.bucket/' + value
  } }, { wx: store.wx })
  const hydrated = await images.hydrateRecipeStepImages({ ...fixture, source: 'builtin', isLocalOverride: true,
    steps: [{ ...fixture.steps[0], image: '/local/step.jpg' }] })
  assert.strictEqual(hydrated.steps[0].images.length, 2)
  assert.strictEqual(hydrated.steps[0].images[0], '/local/step.jpg', '本地修改的步骤图和来源云图都能继续展示')
  let submitted
  store.wx.cloud.callFunction = async ({ data }) => { submitted = data; return { result: { ok: true, submissionId: 'test' } } }
  const community = load('utils/community.js', {}, { wx: store.wx })
  await community.submitRecipe({ ...fixture, coverImage: '' }, { nickname: '访客' })
  assert(submitted.recipe.tips.some(tip => tip.includes(fixture.referenceUrl)))
  assert(submitted.recipe.tips.some(tip => tip.includes(fixture.sourceLicenseUrl)), '投稿经旧云函数过滤后仍保留署名许可提示')
}

async function main() {
  testRestrictions()
  testEditorAndDrafts()
  await testImageManagement()
  testTimerAndLibrary()
  await testImageCompression()
  await testPreservedStepImagesAndAttribution()
  console.log('本地可靠性测试通过：忌口、失败回滚、编辑保真、草稿、图片备份恢复与清理、搜索、后台计时、缩图')
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { load, localStore, makePage }
