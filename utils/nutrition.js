const { FOOD_FACTS } = require('../data/food-nutrition')
const { FOOD_MICROS } = require('../data/food-micros')
const { RETENTION_FACTORS } = require('../data/nutrient-retention')
const { getDefaultPackagingRule } = require('../data/packaging-rules')

const MICRO_KEYS = ['sodium', 'potassium', 'calcium', 'iron', 'vitaminA', 'vitaminC', 'vitaminE', 'folate']

function normalizeName(value) {
  return String(value || '').replace(/[\s（）()]/g, '').toLowerCase()
}

function findFoodFact(name) {
  const normalized = normalizeName(name)
  if (!normalized || /^(无|时令配菜|辅助食材|主食基底|饮用水或基底液|清水或高汤)$/.test(normalized)) return null
  const exact = FOOD_FACTS.find(item => [item.name].concat(item.aliases || []).some(alias => normalized === normalizeName(alias)))
  if (exact) return exact
  return FOOD_FACTS.find(item => [item.name].concat(item.aliases || []).some(alias => {
    const target = normalizeName(alias)
    return target.length >= 2 && (normalized.includes(target) || target.includes(normalized))
  })) || null
}

function amountToGrams(amount, fact) {
  const value = String(amount || '').trim()
  if (!value || !fact) return null
  const gramRange = value.match(/(\d+(?:\.\d+)?)\s*[-—–~～]\s*(\d+(?:\.\d+)?)\s*(?:克|g)/i)
  if (gramRange) return { grams: (Number(gramRange[1]) + Number(gramRange[2])) / 2, estimated: true }
  const explicitGrams = value.match(/(?:约)?\s*(\d+(?:\.\d+)?)\s*(?:克|g)/i)
  if (explicitGrams) return { grams: Number(explicitGrams[1]), estimated: value.includes('约') }
  const kilograms = value.match(/(\d+(?:\.\d+)?)\s*(?:千克|公斤|kg)/i)
  if (kilograms) return { grams: Number(kilograms[1]) * 1000, estimated: false }
  const milliliters = value.match(/(\d+(?:\.\d+)?)\s*(?:毫升|ml|mL)/)
  if (milliliters) return { grams: Number(milliliters[1]), estimated: true }
  const spoon = value.match(/(\d+(?:\.\d+)?)?\s*(小勺|勺)/)
  if (spoon) return { grams: Number(spoon[1] || 1) * (spoon[2] === '小勺' ? 5 : 15), estimated: true }
  if (/半勺/.test(value)) return { grams: 7.5, estimated: true }
  const count = value.match(/(\d+(?:\.\d+)?)\s*(个|根|只|朵|片|瓣|颗|棵|块|条|碗|张|份)/)
  if (count) return { grams: Number(count[1]) * fact.unitWeight, estimated: true }
  const half = value.match(/半\s*(个|根|只|朵|片|瓣|颗|棵|块|条|碗)/)
  if (half) return { grams: fact.unitWeight * 0.5, estimated: true }
  if (/较多/.test(value) && fact.name === '食用油') return { grams: 80, estimated: true }
  if (/适量/.test(value) && fact.name === '食用油') return { grams: 10, estimated: true }
  if (/少许/.test(value)) return { grams: fact.name === '食用油' ? 5 : fact.unitWeight, estimated: true }
  return null
}

function round(value, digits = 1) {
  const scale = Math.pow(10, digits)
  return Math.round(value * scale) / scale
}

function getCookingMethod(recipe) {
  const text = `${recipe && recipe.name || ''}|${recipe && recipe.mealType || ''}|${(recipe && recipe.steps || []).map(item => item.text || '').join('|')}`
  if (/凉拌|沙拉|冷泡|冰沙|奶昔|果汁|气泡|冷饮/.test(text)) return 'raw'
  if (recipe && recipe.mealType === '汤羹') return 'soup'
  if (/油炸|炸至|炸锅|炸制/.test(text)) return 'fry'
  if (/烤箱|烘烤|烤制|烤盘/.test(text)) return 'bake'
  if (/清蒸|蒸制|上锅蒸|蒸熟/.test(text)) return 'steam'
  if (/焯水|水煮|煮熟|煮开/.test(text) && !/翻炒|炒至/.test(text)) return 'boil'
  return 'stirFry'
}

function analyzeRecipe(recipe) {
  const allItems = (recipe.ingredients || []).concat(recipe.seasonings || []).filter(item => {
    if (!item || !item.name || item.name === '无') return false
    const negligible = /胡椒|花椒|八角|桂皮|肉桂|迷迭香|辣椒粉|香菜|薄荷叶|枸杞/.test(item.name)
    return !(negligible && /少许|适量|可选/.test(String(item.amount || '')))
  })
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0, vitaminA: 0, vitaminC: 0, vitaminE: 0, folate: 0 }
  const unmatched = []
  let matched = 0
  let estimatedAmounts = 0
  let microMatched = 0
  const sources = []
  allItems.forEach(item => {
    const fact = findFoodFact(item.name)
    const parsed = amountToGrams(item.amount, fact)
    if (!fact || !parsed) {
      unmatched.push(item.name)
      return
    }
    matched += 1
    if (parsed.estimated) estimatedAmounts += 1
    const ratio = parsed.grams / 100
    const measured = FOOD_MICROS[fact.name]
    ;['kcal', 'protein', 'carbs', 'fat', 'fiber'].forEach(key => {
      const value = measured && measured[key] !== null ? measured[key] : fact[key]
      totals[key] += Number(value || 0) * ratio
    })
    if (measured) {
      microMatched += 1
      MICRO_KEYS.forEach(key => {
        if (measured[key] !== null) totals[key] += Number(measured[key]) * ratio
      })
      if (!sources.some(sourceItem => sourceItem.fdcId === measured.fdcId)) sources.push({
        foodName: fact.name,
        fdcId: measured.fdcId,
        description: measured.description,
        release: measured.sourceRelease
      })
    }
  })
  const cookingMethod = getCookingMethod(recipe)
  const retention = RETENTION_FACTORS[cookingMethod] || RETENTION_FACTORS.stirFry
  MICRO_KEYS.forEach(key => { totals[key] *= retention[key] })
  const servings = Math.max(1, Number(recipe.servings) || 1)
  const coverage = allItems.length ? matched / allItems.length : 0
  const perServing = {}
  const roundedTotals = {}
  Object.keys(totals).forEach(key => {
    perServing[key] = round(totals[key] / servings)
    roundedTotals[key] = round(totals[key])
  })
  return {
    totals: roundedTotals,
    perServing,
    coverage: round(coverage * 100, 0),
    microCoverage: matched ? round(microMatched / matched * 100, 0) : 0,
    confidence: coverage >= 0.85 && estimatedAmounts <= 1 ? '较高' : coverage >= 0.65 ? '中等' : '较低',
    unmatched: Array.from(new Set(unmatched)),
    cookingMethod: retention.label,
    retentionSource: 'USDA Table of Nutrient Retention Factors Release 6',
    sources,
    source: 'USDA FoodData Central Foundation Foods 2026-04 / SR Legacy 2018-04（CC0）'
  }
}

function estimateShoppingItem(item) {
  const fact = findFoodFact(item && item.name)
  if (!fact) return { factName: '', grams: null, packageCount: 0, packageLabel: '' }
  const amountParts = String(item.amount || '').split('+')
  let totalGrams = 0
  for (const part of amountParts) {
    const multiplierMatch = part.match(/×\s*(\d+)/)
    const parsed = amountToGrams(part.replace(/×.*$/, '').trim(), fact)
    if (!parsed) return { factName: fact.name, grams: null, packageCount: 0, packageLabel: '' }
    totalGrams += parsed.grams * Number(multiplierMatch ? multiplierMatch[1] : 1)
  }
  const rule = getDefaultPackagingRule(fact.name)
  if (rule.mode === 'pantry') {
    return {
      factName: fact.name,
      grams: round(totalGrams, 0),
      purchaseGrams: 0,
      leftoverGrams: 0,
      packageCount: 0,
      packageLabel: rule.label
    }
  }
  const packageSizeG = Math.max(1, Number(rule.packageSizeG || rule.incrementG) || 500)
  const packageCount = Math.max(1, Math.ceil(totalGrams / packageSizeG))
  const purchaseGrams = packageCount * packageSizeG
  return {
    factName: fact.name,
    grams: round(totalGrams, 0),
    purchaseGrams: round(purchaseGrams, 0),
    leftoverGrams: round(Math.max(0, purchaseGrams - totalGrams), 0),
    packageCount,
    packageLabel: rule.label
  }
}

module.exports = {
  findFoodFact,
  amountToGrams,
  analyzeRecipe,
  estimateShoppingItem,
  getCookingMethod
}
