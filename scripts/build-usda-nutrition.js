const fs = require('fs')
const path = require('path')

const sourcePath = process.argv[2]
const srSourcePath = process.argv[3]
if (!sourcePath) {
  console.error('用法：node scripts/build-usda-nutrition.js <Foundation Foods JSON> [SR Legacy JSON]')
  process.exit(1)
}

const FOOD_IDS = {
  番茄: 1999634,
  鸡蛋: 323604,
  土豆: 2346403,
  青椒: 2258588,
  大蒜: 1104647,
  香葱: 2727585,
  鸡胸肉: 2646170,
  鸡腿肉: 2646171,
  猪瘦肉: 2514745,
  牛瘦肉: 746761,
  鲈鱼: 2684442,
  虾仁: 2684443,
  牛奶: 746782,
  酸奶: 2259793,
  西兰花: 747447,
  胡萝卜: 2258586,
  黄瓜: 2346406,
  菠菜: 1999633,
  生菜: 2346391,
  大米: 2512381,
  燕麦: 2346396,
  香蕉: 1105314,
  苹果: 1750340,
  草莓: 2346409,
  芒果: 2710833,
  红薯: 2346404,
  玉米: 2710826,
  花生: 2515376,
  核桃: 2346394,
  食用油: 748278,
  白糖: 746784
}

const SR_IDS = {
  姜: 169231,
  鸡翅: 172390,
  五花肉: 167812,
  牛腩: 168664,
  羊肉: 174370,
  排骨: 167853,
  贝类: 174214,
  豆腐: 172475,
  黄豆: 174270,
  芹菜: 169988,
  冬瓜: 170069,
  山药: 170071,
  莲藕: 169250,
  茄子: 169228,
  豆角: 169961,
  西葫芦: 169291,
  香菇: 169242,
  木耳: 169237,
  小米: 169702,
  面条: 169755,
  面粉: 168936,
  蓝莓: 171711,
  柠檬: 167746,
  南瓜: 168448,
  丝瓜: 168414,
  芦笋: 168389,
  花菜: 169986,
  苦瓜: 168393,
  莴笋: 169247,
  空心菜: 169301,
  豌豆: 170419,
  韭菜: 169994,
  海带: 168457,
  绿豆: 174256,
  红豆: 173727,
  粉丝: 174258,
  全麦面包: 172688,
  百香果: 169108,
  西瓜: 167765,
  椰奶: 170172,
  红枣: 171726,
  可可粉: 169593,
  炼乳: 171275,
  可乐: 174852,
  芝麻: 170150,
  淀粉: 169698,
  生抽: 174277,
  醋: 172237,
  盐: 173468,
  清水: 173647,
  豆浆: 173768,
  西柚: 173033,
  糯米粉: 169714,
  淡奶油: 170859,
  冰粉粉: 168775,
  葡萄干: 168165,
  黑巧克力: 170273,
  黄油: 173410,
  菠萝: 169124,
  椰子水: 174831,
  咖啡: 171891,
  乌龙茶: 173227,
  水蜜桃: 169928,
  小龙虾: 174206,
  洋葱: 170000,
  啤酒: 168746,
  干辣椒: 170106,
  薄荷叶: 173474
}

const NUTRIENT_NAMES = {
  protein: ['Protein'],
  carbs: ['Carbohydrate, by difference'],
  fat: ['Total lipid (fat)'],
  fiber: ['Fiber, total dietary'],
  sodium: ['Sodium, Na'],
  potassium: ['Potassium, K'],
  calcium: ['Calcium, Ca'],
  iron: ['Iron, Fe'],
  vitaminA: ['Vitamin A, RAE'],
  vitaminC: ['Vitamin C, total ascorbic acid'],
  vitaminE: ['Vitamin E (alpha-tocopherol)'],
  folate: ['Folate, total']
}

const raw = JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8'))
const foods = (raw.FoundationFoods || []).filter(Boolean)
const srFoods = srSourcePath
  ? (JSON.parse(fs.readFileSync(path.resolve(srSourcePath), 'utf8')).SRLegacyFoods || []).filter(Boolean)
  : []
const output = {}

function extractFood(name, fdcId, sourceFoods, sourceRelease) {
  const food = sourceFoods.find(item => item.fdcId === fdcId)
  if (!food) throw new Error(`未找到 FDC ${fdcId}（${name}）`)
  const records = food.foodNutrients || []
  const findAmount = (labels, unitName) => {
    const record = records.find(item => item.nutrient && labels.includes(item.nutrient.name) && (!unitName || item.nutrient.unitName === unitName))
    return record && Number.isFinite(Number(record.amount)) ? Number(record.amount) : null
  }
  const energySpecific = findAmount(['Energy (Atwater Specific Factors)'], 'kcal')
  const energyGeneral = findAmount(['Energy (Atwater General Factors)'], 'kcal')
  const energy = energySpecific !== null ? energySpecific : (energyGeneral !== null ? energyGeneral : findAmount(['Energy'], 'kcal'))
  const nutrients = { kcal: energy }
  Object.keys(NUTRIENT_NAMES).forEach((key) => {
    nutrients[key] = findAmount(NUTRIENT_NAMES[key])
  })
  output[name] = Object.assign({
    fdcId,
    description: food.description,
    sourceRelease
  }, nutrients)
}

Object.keys(FOOD_IDS).forEach(name => extractFood(name, FOOD_IDS[name], foods, 'USDA FoodData Central Foundation Foods 2026-04-30'))
if (srFoods.length) Object.keys(SR_IDS).forEach(name => extractFood(name, SR_IDS[name], srFoods, 'USDA FoodData Central SR Legacy 2018-04'))

const target = path.resolve(__dirname, '../features/data/food-micros.js')
const content = `// 此文件由 scripts/build-usda-nutrition.js 从 USDA FoodData Central Foundation Foods / SR Legacy 生成。\n` +
  `// 数据单位均为每100克可食部；USDA FDC 数据按 CC0 发布。\n` +
  `const FOOD_MICROS = ${JSON.stringify(output, null, 2)}\n\nmodule.exports = { FOOD_MICROS }\n`
fs.writeFileSync(target, content)
console.log(`已生成 ${target}，共 ${Object.keys(output).length} 种食材`)
