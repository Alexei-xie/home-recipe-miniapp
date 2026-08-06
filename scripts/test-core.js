const assert = require('assert')
const health = require('../utils/health')
const { BUILTIN_RECIPES, getBuiltinRecipe } = require('../data/recipes')
const imageService = require('../utils/image-service')
const nutrition = require('../features/utils/nutrition')
const { FOOD_MICROS } = require('../features/data/food-micros')
const cloudbase = require('../config/cloudbase')
const FULL_BUILTIN_RECIPES = BUILTIN_RECIPES.map(recipe => getBuiltinRecipe(recipe.id) || recipe)

function testHealthRules() {
  assert.strictEqual(health.parseMeasurement('168.5'), 168.5)
  assert.strictEqual(health.parseMeasurement('168,5'), 168.5)
  assert.strictEqual(health.parseMeasurement('１６８。５'), 168.5)
  assert.strictEqual(health.parseMeasurement('168..5'), null)
  assert.strictEqual(health.parseMeasurement('abc'), null)
  assert(Math.abs(health.calculateBMI(170, 65) - 22.49134948096886) < 1e-10)
  assert(Math.abs(health.calculateBMI('１７０', '６５，５') - 22.6643598615917) < 1e-10)

  assert.strictEqual(health.classifyAdultBMI(18.4999).key, 'underweight')
  assert.strictEqual(health.classifyAdultBMI(18.5).key, 'normal')
  assert.strictEqual(health.classifyAdultBMI(23.9999).key, 'normal')
  assert.strictEqual(health.classifyAdultBMI(24).key, 'overweight')
  assert.strictEqual(health.classifyAdultBMI(27.9999).key, 'overweight')
  assert.strictEqual(health.classifyAdultBMI(28).key, 'obese')

  const maleSix = health.classifyChildBMI(17.7, '2020-01-01', 'male', new Date('2026-01-01T12:00:00'))
  assert.strictEqual(maleSix.key, 'child_obese')
  assert.strictEqual(maleSix.overweightLimit, 16.4)
  assert.strictEqual(health.classifyChildBMI(16.34, '2020-01-01', 'male', new Date('2026-01-01T12:00:00')).key, 'child_below_overweight')
  assert.strictEqual(health.classifyChildBMI(16.2, '2020-01-01', 'female', new Date('2026-01-01T12:00:00')).key, 'child_overweight')
  assert.strictEqual(health.classifyChildBMI(16.6, '2020-01-15', 'male', new Date('2026-07-14T12:00:00')).age, 6)
  assert.strictEqual(health.classifyChildBMI(16.6, '2020-01-15', 'male', new Date('2026-07-15T12:00:00')).age, 6.5)
  assert.strictEqual(health.classifyChildBMI(20, '2021-01-01', 'male', new Date('2026-01-01T12:00:00')), null)
  assert.strictEqual(health.classifyChildBMI(20, '2008-01-01', 'male', new Date('2026-01-01T12:00:00')), null)
  assert.strictEqual(health.calculateAgeYears('2020-02-31', new Date('2026-01-01T12:00:00')), null)

  const pregnancy = health.assessPregnancy({
    heightCm: 165,
    prePregnancyWeightKg: 55,
    gestationalWeek: 24,
    singletonPregnancyConfirmed: true
  }, 62)
  assert.strictEqual(pregnancy.preBmiLabel, '正常范围')
  assert.strictEqual(pregnancy.gainKg, 7)
  assert.strictEqual(pregnancy.totalRange, '8.0–14.0 kg')
  assert.strictEqual(pregnancy.weeklyRange, '0.37 kg/周（范围 0.26–0.48）')
  assert.strictEqual(health.assessPregnancy({
    heightCm: 165, prePregnancyWeightKg: 55, gestationalWeek: 24, singletonPregnancyConfirmed: false
  }, 62), null)

  const childAssessment = health.buildSpecialPopulationAssessment({
    populationType: 'child',
    heightCm: 150,
    birthDate: '2014-01-01',
    biologicalSex: 'female',
    healthConditions: []
  }, { weightKg: 50 }, new Date('2026-01-01T12:00:00'))
  assert.strictEqual(childAssessment.type, 'child')
  assert(childAssessment.child)

  const eggFree = health.filterRecipesByDietaryRestrictions(BUILTIN_RECIPES, {
    allergies: ['蛋'],
    avoidedIngredients: []
  })
  assert(eggFree.every(recipe => !recipe.allergens.includes('蛋')))

  const tomatoFree = health.filterRecipesByDietaryRestrictions(BUILTIN_RECIPES, {
    allergies: [],
    avoidedIngredients: ['番茄']
  })
  assert(tomatoFree.every(recipe => !recipe.ingredientKeywords.some(word => word.includes('番茄'))))

  const expected = [
    [50, 'underweight'],
    [65, 'normal'],
    [75, 'overweight'],
    [90, 'obese']
  ]
  expected.forEach(([weightKg, category]) => {
    const result = health.buildHealthRecommendation(
      BUILTIN_RECIPES,
      {
        heightCm: 170,
        adultConfirmed: true,
        healthRecommendationEnabled: true,
        allergies: [],
        avoidedIngredients: []
      },
      { weightKg }
    )
    assert.strictEqual(result.category.key, category)
    assert(result.recipes.length >= 4)
    assert.strictEqual(result.mealCombination.length, 3)
  })

  const suppressedForChild = health.buildHealthRecommendation(BUILTIN_RECIPES, {
    populationType: 'child', heightCm: 150, adultConfirmed: false, healthRecommendationEnabled: true
  }, { weightKg: 50 })
  assert.strictEqual(suppressedForChild.category, null)
  assert.strictEqual(suppressedForChild.recipes.length, 0)
  const suppressedForCondition = health.buildHealthRecommendation(BUILTIN_RECIPES, {
    populationType: 'adult', heightCm: 170, adultConfirmed: true, healthRecommendationEnabled: true,
    healthConditions: ['hypertension']
  }, { weightKg: 65 })
  assert.strictEqual(suppressedForCondition.category, null)
  assert.strictEqual(suppressedForCondition.recipes.length, 0)
  const fattyLiverGuidance = health.getConditionGuidance(['fattyLiver'])
  assert.strictEqual(fattyLiverGuidance.length, 1)
  assert.strictEqual(fattyLiverGuidance[0].label, '脂肪肝')
  assert.strictEqual(fattyLiverGuidance[0].blocksRecommendation, true)

  const recommendationProfile = {
    heightCm: 170,
    adultConfirmed: true,
    healthRecommendationEnabled: true,
    allergies: ['甲壳及贝类'],
    avoidedIngredients: []
  }
  const lunchRecommendation = health.buildTimeBasedRecommendation(
    BUILTIN_RECIPES,
    recommendationProfile,
    { weightKg: 75 },
    new Date('2026-07-29T12:00:00')
  )
  assert.strictEqual(lunchRecommendation.period.key, 'lunch')
  assert.strictEqual(lunchRecommendation.items.length, 3)
  assert(lunchRecommendation.items.every(item => !item.recipe.allergens.includes('甲壳及贝类')))
  assert(lunchRecommendation.items.every(item => item.recipe.energyLevel !== 'high'))
  ;['2026-07-29T08:00:00', '2026-07-29T15:00:00', '2026-07-29T19:00:00', '2026-07-29T23:00:00'].forEach(value => {
    const packageRecommendation = health.buildTimeBasedRecommendation(
      BUILTIN_RECIPES,
      recommendationProfile,
      { weightKg: 75 },
      new Date(value)
    )
    assert.strictEqual(packageRecommendation.items.length, 3)
  })
  const alternateLunchRecommendation = health.buildTimeBasedRecommendation(
    BUILTIN_RECIPES,
    recommendationProfile,
    { weightKg: 75 },
    new Date('2026-07-29T12:00:00'),
    1
  )
  assert(alternateLunchRecommendation.items.some((item, index) => item.recipe.id !== lunchRecommendation.items[index].recipe.id))

  assert.strictEqual(health.getMealPeriod(new Date('2026-07-29T08:00:00')).key, 'breakfast')
  assert.strictEqual(health.getMealPeriod(new Date('2026-07-29T15:00:00')).key, 'snack')
  assert.strictEqual(health.getMealPeriod(new Date('2026-07-29T19:00:00')).key, 'dinner')
  assert.strictEqual(health.getMealPeriod(new Date('2026-07-29T23:00:00')).key, 'late')
}

function testRecipeIllustrationRules() {
  const illustrationCases = [
    [{ name: '番茄炒蛋', mealType: '家常热菜' }, 'vegetable'],
    [{ name: '清蒸鲈鱼', mealType: '家常热菜' }, 'seafood'],
    [{ name: '菌菇豆腐汤', mealType: '汤羹' }, 'soup'],
    [{ name: '扬州炒饭', mealType: '主食' }, 'staple'],
    [{ name: '剁椒鸡翅', mealType: '家常热菜', cuisine: '湘菜' }, 'spicy'],
    [{ name: '葱油鸡', mealType: '家常热菜' }, 'chicken'],
    [{ name: '土豆烧牛肉', mealType: '家常热菜' }, 'meat'],
    [{ name: '芒果奶昔', mealType: '饮品' }, 'drink'],
    [{ name: '焦糖布丁', mealType: '小吃甜品' }, 'dessert']
  ]
  illustrationCases.forEach(([recipe, expected]) => {
    assert.strictEqual(imageService.getRecipeIllustrationKey(recipe), expected)
    assert(imageService.getBuiltinCartoonCover(recipe))
  })
  const sichuanRecipes = BUILTIN_RECIPES.filter(recipe => recipe.cuisine === '川菜')
  assert(sichuanRecipes.length >= 10)
  const sichuanCovers = new Set(sichuanRecipes.map(recipe => imageService.getBuiltinCartoonCover(recipe)))
  const allCovers = new Set(BUILTIN_RECIPES.map(recipe => imageService.getBuiltinCartoonCover(recipe)))
  assert(sichuanCovers.size >= 2)
  assert(allCovers.size >= 4)
  const recipesWithStepImages = BUILTIN_RECIPES.map(recipe => getBuiltinRecipe(recipe.id) || recipe).filter(recipe =>
    recipe.processImageCloudPaths.length || recipe.steps.some(step => step.imageCloudPaths.length)
  )
  const stepImageCount = recipesWithStepImages.reduce((total, recipe) =>
    total + recipe.processImageCloudPaths.length + recipe.steps.reduce((sum, step) => sum + step.imageCloudPaths.length, 0), 0)
  assert.strictEqual(stepImageCount, 167)
  assert(recipesWithStepImages.length >= 50)
  const recipesWithSourceCovers = BUILTIN_RECIPES.filter(recipe => recipe.sourceCoverCloudPath)
  assert(recipesWithSourceCovers.length >= 140)
  assert.strictEqual(
    cloudbase.getRecipeStepImageFileId('recipe-steps/r001/001.jpg'),
    `${cloudbase.CLOUDBASE_FILE_ID_PREFIX}/recipe-steps/r001/001.jpg`
  )
  assert.strictEqual(
    cloudbase.getRecipeSourceCoverFileId('recipe-source-covers/r001.jpg'),
    `${cloudbase.CLOUDBASE_FILE_ID_PREFIX}/recipe-source-covers/r001.jpg`
  )
}

async function testImageRecoveryRules() {
  const previousWx = global.wx
  let requestCount = 0
  global.wx = {
    cloud: {
      getTempFileURL({ fileList }) {
        requestCount += 1
        return Promise.resolve({
          fileList: fileList.map(fileID => ({
            fileID,
            tempFileURL: `https://example.test/cover-${requestCount}.jpg`,
            maxAge: 7200
          }))
        })
      }
    }
  }
  try {
    const communityRecipe = {
      id: 'community_image_test',
      source: 'community',
      name: '社区图片测试',
      coverImage: 'cloud://example.test/community-recipe-covers/test.jpg',
      steps: []
    }
    assert.strictEqual(imageService.getRecipeInitialImage(communityRecipe), '')
    const first = await imageService.resolveRecipeImage(communityRecipe)
    assert.strictEqual(first.url, 'https://example.test/cover-1.jpg')
    const cached = await imageService.resolveRecipeImage(communityRecipe)
    assert.strictEqual(cached.url, first.url)
    assert.strictEqual(requestCount, 1)
    const recovered = await imageService.recoverRecipeImage(communityRecipe, first.url)
    assert.strictEqual(recovered, 'https://example.test/cover-2.jpg')
    assert.strictEqual(requestCount, 2)
    const stepRecipe = {
      id: 'step_image_test',
      source: 'builtin',
      steps: [{ id: 's1', imageCloudPaths: ['recipe-steps/step_image_test/001.jpg'], images: [] }],
      processImageCloudPaths: []
    }
    const hydratedSteps = await imageService.hydrateRecipeStepImages(stepRecipe)
    const firstStepUrl = hydratedSteps.steps[0].images[0]
    assert.strictEqual(firstStepUrl, 'https://example.test/cover-3.jpg')
    assert.deepStrictEqual(
      imageService.invalidateStepImageByUrl(firstStepUrl),
      ['recipe-steps/step_image_test/001.jpg']
    )
    const refreshedSteps = await imageService.hydrateRecipeStepImages(hydratedSteps)
    assert.strictEqual(refreshedSteps.steps[0].images[0], 'https://example.test/cover-4.jpg')
    assert.strictEqual(requestCount, 4)
    assert.strictEqual(imageService.getRecipeInitialImage(BUILTIN_RECIPES[0]).startsWith('/assets/'), true)
  } finally {
    global.wx = previousWx
  }
}

function testIngredientPreparationCopy() {
  const tomatoEgg = FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '番茄炒蛋')
  const tomato = tomatoEgg.ingredients.find(item => item.name === '西红柿')
  const egg = tomatoEgg.ingredients.find(item => item.name === '鸡蛋')
  const oil = tomatoEgg.ingredients.find(item => item.name === '食用油')
  assert(tomato.note.includes('洗净'))
  assert(tomato.note.includes('去蒂'))
  assert(egg.note.includes('打入碗中'))
  assert.strictEqual(oil.note, '')

  const mapoTofu = FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '麻婆豆腐')
  assert(mapoTofu.ingredients.find(item => item.name === '大蒜').note.includes('切碎'))
  const kungPao = FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '宫保鸡丁')
  assert.strictEqual(kungPao.ingredients.find(item => item.name === '鸡精').note, '')

  const eggTart = FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '烤蛋挞')
  assert.strictEqual(eggTart.ingredients.find(item => item.name === '牛奶').note, '')

  const steamedFish = FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '清蒸鲈鱼')
  assert(steamedFish.ingredients.find(item => item.name === '鲈鱼').note.includes('擦干'))
  const usefulNoteCount = FULL_BUILTIN_RECIPES.reduce((total, recipe) =>
    total + recipe.ingredients.filter(item => item.note).length, 0)
  const templateNoteCount = FULL_BUILTIN_RECIPES.reduce((total, recipe) =>
    total + recipe.ingredients.filter(item => /按来源配方准备|按来源配方量取|与即食食材分开处理，并按步骤彻底加热/.test(item.note)).length, 0)
  const awkwardNoteCount = FULL_BUILTIN_RECIPES.reduce((total, recipe) =>
    total + recipe.ingredients.filter(item => /热心摊主|拿自己的小手|随便切切|室温自然解冻\s*5\s*小时/.test(item.note)).length, 0)
  assert(usefulNoteCount > 300)
  assert.strictEqual(templateNoteCount, 0)
  assert.strictEqual(awkwardNoteCount, 0)

  const allSteps = FULL_BUILTIN_RECIPES.flatMap(recipe => recipe.steps.map(step => step.text))
  assert(allSteps.every(text => !/热心摊主|拿自己的小手|本程序员认为|随便切切|墙角、椅背、桌角/.test(text)))
  assert(FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '砂糖椰子冰沙').steps.some(step => step.text.includes('稳固台面上轻敲')))
  assert(FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '小米粥').steps.some(step => step.text.includes('煮至沸腾')))
  assert(FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '小酥肉').steps.some(step => step.text.includes('炸 3–5 分钟')))
  assert(FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '披萨饼皮').steps.some(step => step.text.includes('8–12 小时')))
  assert(FULL_BUILTIN_RECIPES.find(recipe => recipe.name === '新疆大盘鸡').steps.some(step => step.text.includes('4cm × 4cm')))
  assert(allSteps.every(text => !/\d+g\s*份数|份数\s*\d+(?:\.\d+)?\s*(?:ml|毫升)/i.test(text)))
  assert(allSteps.every(text => !/灵魂料汁|本程序员认为|务必烧开|即可享用–|干米粉/.test(text)))
}

function testNutritionRules() {
  const tomatoEgg = FULL_BUILTIN_RECIPES.find(recipe => recipe.id === 'r001')
  const analysis = nutrition.analyzeRecipe(tomatoEgg)
  assert.strictEqual(analysis.coverage, 100)
  assert(analysis.perServing.kcal > 0)
  assert(analysis.perServing.protein > 0)
  assert.strictEqual(nutrition.amountToGrams('250克', nutrition.findFoodFact('鸡胸肉')).grams, 250)
  assert.strictEqual(nutrition.amountToGrams('2个', nutrition.findFoodFact('鸡蛋')).grams, 100)

  const tofuPurchase = nutrition.estimateShoppingItem({ name: '豆腐', amount: '300克' })
  assert.strictEqual(tofuPurchase.packageCount, 1)
  assert.strictEqual(tofuPurchase.purchaseGrams, 400)
  assert.strictEqual(tofuPurchase.leftoverGrams, 100)

  assert(Object.keys(FOOD_MICROS).length >= 95)
  assert(FOOD_MICROS.盐.sodium > 30000)
  assert(FOOD_MICROS.豆腐.calcium > 100)
  const rawBroccoli = nutrition.analyzeRecipe({ name: '西兰花沙拉', mealType: '凉菜', servings: 1, ingredients: [{ name: '西兰花', amount: '100克' }], seasonings: [], steps: [] })
  const boiledBroccoli = nutrition.analyzeRecipe({ name: '水煮西兰花', mealType: '家常热菜', servings: 1, ingredients: [{ name: '西兰花', amount: '100克' }], seasonings: [], steps: [{ text: '放入水中煮熟' }] })
  assert(rawBroccoli.perServing.vitaminC > boiledBroccoli.perServing.vitaminC)
  assert.strictEqual(rawBroccoli.cookingMethod, '不加热/冷制')
  assert.strictEqual(boiledBroccoli.cookingMethod, '水煮/焯煮')

  const wellCoveredRecipes = FULL_BUILTIN_RECIPES.filter(recipe => nutrition.analyzeRecipe(recipe).coverage >= 70)
  assert(wellCoveredRecipes.length >= 80)
}

function testStorageRules() {
  const memory = {}
  const files = new Set()
  const fileSystem = {
    accessSync: path => {
      if (!files.has(path)) throw new Error('not found')
    },
    mkdirSync: path => { files.add(path) },
    saveFileSync: (source, destination) => { files.add(destination) },
    unlinkSync: path => { files.delete(path) }
  }
  global.wx = {
    getStorageSync: key => memory[key],
    setStorageSync: (key, value) => { memory[key] = JSON.parse(JSON.stringify(value)) },
    removeStorageSync: key => { delete memory[key] },
    showToast: () => {},
    env: { USER_DATA_PATH: '/tmp/today-eat-test' },
    getFileSystemManager: () => fileSystem
  }

  const storage = require('../utils/storage')
  storage.initStorage()
  assert.strictEqual(storage.SCHEMA_VERSION, 13)
  assert.strictEqual(storage.getProfile().populationType, 'adult')
  storage.saveProfile({ healthConditions: ['fattyLiver'] })
  assert.deepStrictEqual(storage.getProfile().healthConditions, ['fattyLiver'])
  assert.strictEqual(storage.normalizeCustomRecipe({ cuisine: '粤菜' }).cuisine, '家常菜')
  assert.strictEqual(storage.normalizeCustomRecipe({ cuisine: '泰菜' }).cuisine, '家常菜')
  storage.saveProfile({ heightCm: 168, adultConfirmed: true })
  storage.saveWeightRecord('2026-07-28', 60)
  storage.saveWeightRecord('2026-07-28', 61)
  assert.strictEqual(storage.getWeightRecords().length, 1)
  assert.strictEqual(storage.getWeightRecords()[0].weightKg, 61)

  const saved = storage.saveCustomRecipe({
    name: '测试菜',
    ingredients: [{ name: '白菜', amount: '1棵' }],
    steps: [{ text: '炒熟' }]
  })
  assert.strictEqual(storage.getRecipe(saved.id).source, 'custom')

  storage.replaceCommunityRecipes([{
    id: 'community_test_1',
    name: '社区测试菜',
    source: 'community',
    publisherName: '投稿人',
    ingredients: [{ name: '白菜', amount: '200克' }],
    steps: [{ text: '白菜洗净切段' }, { text: '炒熟后盛出' }],
    allergensReviewed: true
  }], { version: 3, syncedAt: 1000 })
  assert.strictEqual(storage.getCommunityRecipes().length, 1)
  assert.strictEqual(storage.getRecipe('community_test_1').source, 'community')
  assert.strictEqual(storage.getRecipe('community_test_1').publisherName, '投稿人')
  assert.strictEqual(storage.getCommunitySync().version, 3)
  storage.flushStateSync()
  assert.strictEqual(memory[storage.COMMUNITY_STORAGE_KEY].length, 1)
  assert.strictEqual(memory[storage.STORAGE_KEY].communityRecipes, undefined)
  storage.markCommunityNoticesSeen()
  assert(storage.getCommunitySync().noticeSeenAt > 0)

  const favoriteAdded = storage.toggleFavorite('r001')
  assert.strictEqual(favoriteAdded.favorite, true)
  assert.strictEqual(storage.isFavorite('r001'), true)
  assert.strictEqual(storage.getFavoriteRecipes()[0].id, 'r001')
  const favoriteRemoved = storage.toggleFavorite('r001')
  assert.strictEqual(favoriteRemoved.favorite, false)
  assert.strictEqual(storage.getFavorites().length, 0)

  const localCover = storage.saveRecipeImageFile('/tmp/selected-cover.jpg')
  assert(localCover.includes('/recipe_images/'))
  assert(files.has(localCover))
  const withCover = storage.saveCustomRecipe({
    name: '有图菜谱',
    coverImage: localCover,
    ingredients: [{ name: '青菜', amount: '1把' }],
    steps: [{ text: '炒熟' }]
  })
  storage.deleteCustomRecipe(withCover.id)
  assert(!files.has(localCover))

  const builtin = storage.getRecipe('r001')
  const overrideCover = storage.saveRecipeImageFile('/tmp/selected-builtin-cover.jpg')
  const savedOverride = storage.saveBuiltinRecipeOverride(Object.assign({}, builtin, {
    name: '我的番茄炒蛋',
    coverImage: overrideCover,
    ingredients: [{ name: '番茄', amount: '3个' }, { name: '鸡蛋', amount: '4个' }],
    steps: [{ text: '先准备食材' }, { text: '按自己的方式炒熟' }]
  }))
  assert.strictEqual(savedOverride.source, 'builtin')
  assert.strictEqual(storage.getRecipe('r001').name, '我的番茄炒蛋')
  assert.strictEqual(storage.getRecipe('r001').isLocalOverride, true)
  assert.strictEqual(storage.getCustomRecipes().some(item => item.id === 'r001'), false)
  assert.strictEqual(storage.getAllRecipes().filter(item => item.id === 'r001').length, 1)
  storage.clearBuiltinRecipeOverride('r001')
  assert.strictEqual(storage.getRecipe('r001').name, '番茄炒蛋')
  assert(!files.has(overrideCover))

  storage.addDrawHistory('r001', '全部食谱')
  assert.strictEqual(storage.getDrawHistory().length, 1)

  const pantry = storage.savePantryIngredients(['鸡蛋', '番茄', '鸡蛋', ''])
  assert.deepStrictEqual(pantry, ['鸡蛋', '番茄'])
  storage.addRecipeToMealPlan('r001', '2026-07-29')
  storage.addRecipeToMealPlan('r001', '2026-07-29')
  assert.strictEqual(storage.getMealPlan('2026-07-29').filter(item => item.id === 'r001').length, 1)
  storage.addRecipeToShoppingList(storage.getRecipe('r001'))
  assert(storage.getShoppingList().length > 0)
  const shoppingItem = storage.getShoppingList()[0]
  storage.addRecipeToShoppingList(Object.assign({}, storage.getRecipe('r001'), { name: '另一道测试菜' }))
  assert.strictEqual(storage.getShoppingList().filter(item => item.name === shoppingItem.name).length, 1)
  storage.toggleShoppingItem(shoppingItem.id)
  assert.strictEqual(storage.getShoppingList().find(item => item.id === shoppingItem.id).checked, true)
  storage.clearCheckedShoppingItems()
  assert.strictEqual(storage.getShoppingList().some(item => item.id === shoppingItem.id), false)
  storage.markRecipeCooked('r001', '2026-07-29')
  assert(storage.getState().cookedHistory.some(item => item.recipeId === 'r001' && item.date === '2026-07-29'))
  assert.strictEqual(storage.getState().priceSettings, undefined)
  assert.strictEqual(storage.getState().priceSnapshots, undefined)

  storage.clearHealthData()
  assert.strictEqual(storage.getWeightRecords().length, 0)
  assert.strictEqual(storage.getProfile().populationType, 'adult')
  assert.deepStrictEqual(storage.getProfile().healthConditions, [])
}

async function main() {
  testHealthRules()
  testRecipeIllustrationRules()
  await testImageRecoveryRules()
  testIngredientPreparationCopy()
  testNutritionRules()
  testStorageRules()
  console.log('核心逻辑测试通过')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
