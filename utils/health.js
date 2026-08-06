function parseMeasurement(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (value === null || value === undefined) return null
  const normalized = String(value)
    .trim()
    .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 65248))
    .replace(/[，。]/g, '.')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function calculateBMI(heightCm, weightKg) {
  const height = parseMeasurement(heightCm)
  const weight = parseMeasurement(weightKg)
  if (height === null || weight === null || height <= 0 || weight <= 0) return null
  const heightM = height / 100
  const bmi = weight / (heightM * heightM)
  return Number.isFinite(bmi) ? bmi : null
}

function classifyAdultBMI(bmi) {
  if (bmi === null || bmi === undefined || Number.isNaN(Number(bmi))) return null
  if (bmi < 18.5) {
    return { key: 'underweight', label: '体重偏低', tone: 'amber', direction: '规律三餐，优先选择优质蛋白、主食和健康加餐，避免只靠高糖高油食物增加能量。' }
  }
  if (bmi < 24) {
    return { key: 'normal', label: '正常范围', tone: 'green', direction: '保持食物多样和吃动平衡，日常以蔬菜、谷物和优质蛋白合理搭配。' }
  }
  if (bmi < 28) {
    return { key: 'overweight', label: '超重', tone: 'orange', direction: '优先少油烹饪、足量蔬菜和优质蛋白，减少高糖、高油食物出现频率。' }
  }
  return { key: 'obese', label: '肥胖', tone: 'red', direction: '从规律饮食和温和、可持续的调整开始，建议结合医生或注册营养师意见制定个人方案。' }
}

const CHILD_BMI_LIMITS = [
  [6, 16.4, 17.7, 16.2, 17.5], [6.5, 16.7, 18.1, 16.5, 18.0],
  [7, 17.0, 18.7, 16.8, 18.5], [7.5, 17.4, 19.2, 17.2, 19.0],
  [8, 17.8, 19.7, 17.6, 19.4], [8.5, 18.1, 20.3, 18.1, 19.9],
  [9, 18.5, 20.8, 18.5, 20.4], [9.5, 18.9, 21.4, 19.0, 21.0],
  [10, 19.2, 21.9, 19.5, 21.5], [10.5, 19.6, 22.5, 20.0, 22.1],
  [11, 19.9, 23.0, 20.5, 22.7], [11.5, 20.3, 23.6, 21.1, 23.3],
  [12, 20.7, 24.1, 21.5, 23.9], [12.5, 21.0, 24.7, 21.9, 24.5],
  [13, 21.4, 25.2, 22.2, 25.0], [13.5, 21.9, 25.7, 22.6, 25.6],
  [14, 22.3, 26.1, 22.8, 25.9], [14.5, 22.6, 26.4, 23.0, 26.3],
  [15, 22.9, 26.6, 23.2, 26.6], [15.5, 23.1, 26.9, 23.4, 26.9],
  [16, 23.3, 27.1, 23.6, 27.1], [16.5, 23.5, 27.4, 23.7, 27.4],
  [17, 23.7, 27.6, 23.8, 27.6], [17.5, 23.8, 27.8, 23.9, 27.8]
]

const PREGNANCY_GAIN_RANGES = {
  underweight: { total: '11.0–16.0 kg', weekly: '0.46 kg/周（范围 0.37–0.56）' },
  normal: { total: '8.0–14.0 kg', weekly: '0.37 kg/周（范围 0.26–0.48）' },
  overweight: { total: '7.0–11.0 kg', weekly: '0.30 kg/周（范围 0.22–0.37）' },
  obese: { total: '5.0–9.0 kg', weekly: '0.22 kg/周（范围 0.15–0.30）' }
}

const CONDITION_GUIDANCE = {
  hypertension: { label: '高血压', text: '优先新鲜食材和清淡烹饪，减少盐、酱油、腌制品及高钠加工食品；用药和血压目标遵医嘱。', blocksRecommendation: true },
  hyperglycemia: { label: '高血糖/糖尿病', text: '规律进餐，主食定量并优先全谷杂豆，搭配蔬菜和蛋白质；药物或胰岛素使用者调整饮食前应咨询医生。', blocksRecommendation: true },
  hyperlipidemia: { label: '高脂血症', text: '减少肥肉、油炸食品和反式脂肪，增加蔬菜、全谷物及适量鱼类；复查血脂并遵循临床治疗方案。', blocksRecommendation: true },
  hyperuricemia: { label: '高尿酸/痛风', text: '避免过量饮酒和含糖饮料，急性发作期或合并肾病时应由医生制定饮食与饮水方案。', blocksRecommendation: true },
  fattyLiver: { label: '脂肪肝', text: '规律均衡饮食，减少含糖饮料、高糖高油食品并避免饮酒；如需减重应循序渐进。脂肪肝病因并不相同，请结合肝功能、影像检查、饮酒情况和代谢指标由肝病科或临床营养师评估。', blocksRecommendation: true },
  kidneyDisease: { label: '慢性肾病', text: '蛋白质、钠、钾、磷和饮水量取决于肾功能、透析及化验结果，本程序不提供自动配餐，请由肾内科或临床营养师制定方案。', blocksRecommendation: true },
  eatingDisorder: { label: '进食障碍风险', text: '不建议使用 BMI 或热量数字自行限制饮食。若出现催吐、暴食、过度节食或明显进食焦虑，请尽快联系精神心理科、营养门诊或可信赖的支持者。', blocksRecommendation: true },
  gestationalDiabetes: { label: '妊娠期糖尿病', text: '需要结合孕周、血糖监测和用药制定个体化方案；本程序不使用普通孕期体重范围替代产科或营养门诊意见。', blocksRecommendation: true }
}

function parseBirthDate(birthDate) {
  const match = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (birth.getFullYear() !== Number(match[1]) || birth.getMonth() !== Number(match[2]) - 1 || birth.getDate() !== Number(match[3])) return null
  return birth
}

function calculateAgeYears(birthDate, now = new Date()) {
  const birth = parseBirthDate(birthDate)
  if (!birth || birth > now) return null
  return (now.getTime() - birth.getTime()) / (365.2425 * 86400000)
}

function getCompletedAgeMonths(birthDate, now = new Date()) {
  const birth = parseBirthDate(birthDate)
  if (!birth || birth > now) return null
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months -= 1
  return months
}

function classifyChildBMI(bmi, birthDate, sex, now = new Date()) {
  const ageMonths = getCompletedAgeMonths(birthDate, now)
  if (bmi === null || ageMonths === null || ageMonths < 72 || ageMonths >= 216 || !['male', 'female'].includes(sex)) return null
  const halfYearAge = Math.min(17.5, Math.floor(ageMonths / 6) / 2)
  const row = CHILD_BMI_LIMITS.find(item => item[0] === halfYearAge)
  if (!row) return null
  const roundedBmi = Math.round(Number(bmi) * 10) / 10
  const overweightLimit = sex === 'male' ? row[1] : row[3]
  const obesityLimit = sex === 'male' ? row[2] : row[4]
  if (roundedBmi >= obesityLimit) return { key: 'child_obese', label: '达到肥胖筛查界值', age: halfYearAge, overweightLimit, obesityLimit, direction: '建议由儿科或儿童保健机构结合生长曲线、发育阶段和生活方式进一步评估，不自行节食。' }
  if (roundedBmi >= overweightLimit) return { key: 'child_overweight', label: '达到超重筛查界值', age: halfYearAge, overweightLimit, obesityLimit, direction: '建议关注家庭共同的规律饮食与活动，并由专业人员结合生长发育情况评估。' }
  return { key: 'child_below_overweight', label: '未达到超重筛查界值', age: halfYearAge, overweightLimit, obesityLimit, direction: '该标准只用于筛查超重和肥胖，不能据此判断偏瘦、营养不良或生长迟缓。' }
}

function assessPregnancy(profile, currentWeightKg) {
  const height = parseMeasurement(profile.heightCm)
  const preWeight = parseMeasurement(profile.prePregnancyWeightKg)
  const week = Number(profile.gestationalWeek)
  if (height === null || height < 140 || preWeight === null || preWeight > 125 || !profile.singletonPregnancyConfirmed) return null
  const preBmi = calculateBMI(height, preWeight)
  const category = classifyAdultBMI(preBmi)
  if (!category || !(week >= 1 && week <= 42) || !(currentWeightKg > 0)) return null
  const range = PREGNANCY_GAIN_RANGES[category.key]
  return {
    preBmi: Math.round(preBmi * 10) / 10,
    preBmiLabel: category.label,
    gestationalWeek: week,
    gainKg: Math.round((currentWeightKg - preWeight) * 10) / 10,
    totalRange: range.total,
    weeklyRange: week < 14 ? '孕早期总增重参考 0–2.0 kg' : range.weekly,
    direction: '仅适用于身高≥140cm、孕前体重≤125kg的单胎自然妊娠；合并症、并发症或妊娠期糖尿病应结合临床意见。'
  }
}

function getConditionGuidance(conditionKeys) {
  return (conditionKeys || []).map(key => CONDITION_GUIDANCE[key]).filter(Boolean)
}

function getPopulationLabel(type) {
  return { adult: '普通成人', child: '6–17岁儿童青少年', pregnant: '单胎妊娠期', postpartum: '产后/哺乳期' }[type] || '普通成人'
}

function buildSpecialPopulationAssessment(profile, latestWeight, now = new Date()) {
  const type = profile.populationType || 'adult'
  const bmi = calculateBMI(profile.heightCm, latestWeight && latestWeight.weightKg)
  const conditions = getConditionGuidance(profile.healthConditions)
  if (type === 'child') return { type, label: getPopulationLabel(type), bmi, bmiDisplay: bmi === null ? '' : bmi.toFixed(1), child: classifyChildBMI(bmi, profile.birthDate, profile.biologicalSex, now), conditions }
  if (type === 'pregnant') return {
    type,
    label: getPopulationLabel(type),
    bmi: null,
    pregnancy: conditions.length ? null : assessPregnancy(profile, latestWeight && latestWeight.weightKg),
    conditions,
    note: conditions.length ? '已选择需要临床评估的健康状况，暂不显示通用孕期增重范围，请结合产检结果咨询产科或临床营养师。' : ''
  }
  if (type === 'postpartum') return { type, label: getPopulationLabel(type), bmi: null, conditions, note: '产后恢复受分娩方式、哺乳、睡眠和疾病情况影响，不使用普通成人 BMI 自动推荐减重食谱。' }
  return { type: 'adult', label: getPopulationLabel('adult'), bmi, adult: classifyAdultBMI(bmi), conditions }
}

function getLatestWeight(records) {
  if (!Array.isArray(records) || records.length === 0) return null
  return records.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
}

function containsAvoidedIngredient(recipe, avoidedIngredients) {
  const searchable = []
    .concat(recipe.ingredientKeywords || [])
    .concat((recipe.ingredients || []).map(item => item.name))
    .join(' ')
    .toLowerCase()
  return (avoidedIngredients || []).some(word => word && searchable.includes(String(word).trim().toLowerCase()))
}

function getRestrictionReasons(recipe, profile) {
  const allergyHits = (recipe.allergens || []).filter(item => (profile.allergies || []).includes(item))
  const avoidedHits = (profile.avoidedIngredients || []).filter(word => containsAvoidedIngredient(recipe, [word]))
  return allergyHits.concat(avoidedHits)
}

function filterRecipesByDietaryRestrictions(recipes, profile) {
  return (recipes || []).filter(recipe => getRestrictionReasons(recipe, profile || {}).length === 0)
}

function tagsForBmi(categoryKey) {
  if (categoryKey === 'underweight') return ['增能均衡', '日常均衡', '零食加餐']
  if (categoryKey === 'normal') return ['日常均衡', '轻盈低卡', '轻享解馋']
  return ['轻盈低卡', '日常均衡']
}

const RECOMMENDATION_ITEM_LIMIT = 3

function buildMealCombination(recipes, categoryKey) {
  const desired = tagsForBmi(categoryKey)
  const candidates = (recipes || []).filter(recipe =>
    recipe.healthEligible &&
    recipe.healthTags.some(tag => desired.includes(tag)) &&
    !((categoryKey === 'overweight' || categoryKey === 'obese') && recipe.energyLevel === 'high')
  )

  function pick(types, used) {
    return candidates.find(item => types.includes(item.mealType) && !used.has(item.id)) || null
  }

  const used = new Set()
  const result = []
  const slots = [
    { label: '主食', types: ['主食', '早餐'] },
    { label: '蛋白质主菜', types: ['家常热菜'] },
    { label: '蔬菜', types: ['凉菜', '家常热菜'] },
    { label: '汤羹/加餐', types: ['汤羹', '小吃甜品', '饮品'] }
  ]
  slots.slice(0, RECOMMENDATION_ITEM_LIMIT).forEach(slot => {
    const item = pick(slot.types, used)
    if (item) {
      used.add(item.id)
      result.push({ label: slot.label, recipe: item })
    }
  })
  return result
}

function buildHealthRecommendation(recipes, profile, latestWeight, options = {}) {
  if ((profile.populationType || 'adult') !== 'adult' || getConditionGuidance(profile.healthConditions).some(item => item.blocksRecommendation)) {
    return { bmi: null, category: null, recipes: [], mealCombination: [] }
  }
  const bmi = calculateBMI(profile.heightCm, latestWeight && latestWeight.weightKg)
  const category = classifyAdultBMI(bmi)
  if (!category || !profile.adultConfirmed || !profile.healthRecommendationEnabled) {
    return { bmi, category, recipes: [], mealCombination: [] }
  }
  const safe = options.alreadyFiltered ? (recipes || []) : filterRecipesByDietaryRestrictions(recipes, profile)
  const desired = tagsForBmi(category.key)
  let recommended = safe.filter(recipe =>
    recipe.healthEligible &&
    recipe.healthTags.some(tag => desired.includes(tag)) &&
    !((category.key === 'overweight' || category.key === 'obese') && recipe.energyLevel === 'high')
  )
  if (recommended.length < RECOMMENDATION_ITEM_LIMIT) {
    recommended = safe.filter(recipe =>
      recipe.healthEligible &&
      recipe.healthTags.includes('日常均衡')
    )
  }
  return {
    bmi,
    category,
    recipes: recommended,
    mealCombination: buildMealCombination(safe, category.key)
  }
}

function getMealPeriod(now) {
  const hour = now instanceof Date ? now.getHours() : new Date().getHours()
  if (hour >= 5 && hour < 10) {
    return {
      key: 'breakfast',
      title: '早餐时段',
      greeting: '早上好，用一份主食和蛋白质开启今天会更稳。',
      slots: [
        { label: '早餐主食', types: ['早餐', '主食'] },
        { label: '优质蛋白', types: ['家常热菜'], preferProtein: true },
        { label: '饮品 / 加餐', types: ['饮品', '小吃甜品'] },
        { label: '清爽搭配', types: ['凉菜', '汤羹'] }
      ]
    }
  }
  if (hour >= 10 && hour < 14) {
    return {
      key: 'lunch',
      title: '午餐时段',
      greeting: '午餐建议搭配主食、蛋白质和蔬菜，吃得饱也吃得均衡。',
      slots: [
        { label: '主食', types: ['主食', '早餐'] },
        { label: '蛋白质主菜', types: ['家常热菜'], preferProtein: true },
        { label: '蔬菜', types: ['凉菜', '家常热菜'] },
        { label: '汤羹', types: ['汤羹'] }
      ]
    }
  }
  if (hour >= 14 && hour < 17) {
    return {
      key: 'snack',
      title: '下午加餐时段',
      greeting: '用一份轻巧加餐缓解饥饿感，避免晚餐前太饿。',
      slots: [
        { label: '轻巧加餐', types: ['小吃甜品', '饮品'] },
        { label: '均衡补给', types: ['早餐', '主食'] },
        { label: '优质蛋白', types: ['家常热菜'], preferProtein: true },
        { label: '清爽搭配', types: ['凉菜', '汤羹'] }
      ]
    }
  }
  if (hour >= 17 && hour < 21) {
    return {
      key: 'dinner',
      title: '晚餐时段',
      greeting: '晚餐以适量主食、优质蛋白和蔬菜为主，避免太油太撑。',
      slots: [
        { label: '主食', types: ['主食', '早餐'] },
        { label: '蛋白质主菜', types: ['家常热菜'], preferProtein: true },
        { label: '蔬菜', types: ['凉菜', '家常热菜'] },
        { label: '清爽汤羹', types: ['汤羹'] }
      ]
    }
  }
  return {
    key: 'late',
    title: '夜间轻食时段',
    greeting: '夜间如确有饥饿感，可选择清淡少量食物，避免高油高糖宵夜。',
    slots: [
      { label: '清爽选择', types: ['汤羹', '凉菜'] },
      { label: '少量主食', types: ['早餐', '主食'] },
      { label: '优质蛋白', types: ['家常热菜'], preferProtein: true },
      { label: '少量饮品 / 加餐', types: ['饮品', '小吃甜品'] }
    ]
  }
}

function recommendationSeed(recipeId, seed) {
  const text = `${recipeId}|${seed}`
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) >>> 0
  }
  return value
}

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isProteinFocusedRecipe(recipe) {
  const text = [
    recipe.name,
    ...(recipe.ingredientKeywords || []),
    ...(recipe.ingredients || []).map(item => item.name)
  ].join(' ')
  return /鸡|牛|猪|羊|鱼|虾|蟹|贝|蛋|豆腐|豆干|豆皮|豆花|肉|排骨|腊|里脊|猪肝|猪蹄|肉丸|肥肠/.test(text)
}

function buildTimeBasedRecommendation(recipes, profile, latestWeight, now = new Date(), rotation = 0, baseRecommendation = null) {
  const base = baseRecommendation || buildHealthRecommendation(recipes, profile, latestWeight)
  if (!base.category) return Object.assign(base, { period: null, items: [] })

  const period = getMealPeriod(now)
  const seed = `${localDateKey(now)}|${period.key}|${base.category.key}`
  const offset = Math.max(0, Number(rotation) || 0)
  const candidates = base.recipes.slice()
  const used = new Set()
  const items = []

  period.slots.slice(0, RECOMMENDATION_ITEM_LIMIT).forEach((slot, slotIndex) => {
    const typed = candidates.filter(recipe => slot.types.includes(recipe.mealType) && !used.has(recipe.id))
    const proteinPreferred = slot.preferProtein ? typed.filter(isProteinFocusedRecipe) : []
    const pool = proteinPreferred.length
      ? proteinPreferred
      : typed.length
        ? typed
        : candidates.filter(recipe => !used.has(recipe.id))
    if (!pool.length) return
    const ordered = pool.slice().sort((a, b) => {
      const aRank = recommendationSeed(a.id, `${seed}|${slotIndex}`)
      const bRank = recommendationSeed(b.id, `${seed}|${slotIndex}`)
      return aRank - bRank
    })
    const recipe = ordered[offset % ordered.length]
    used.add(recipe.id)
    items.push({ label: slot.label, recipe })
  })

  return Object.assign(base, { period, items })
}

function drawRandomRecipe(recipes, pool, profile, recentHistory) {
  let candidates = filterRecipesByDietaryRestrictions(recipes, profile)
  if (pool === '我的菜谱') candidates = candidates.filter(item => item.source === 'custom')
  else if (pool !== '全部食谱') candidates = candidates.filter(item => (item.drawPools || []).includes(pool))
  if (candidates.length === 0) return null
  if (candidates.length > 3) {
    const recentIds = (recentHistory || []).slice(0, 3).map(item => item.recipeId)
    const fresh = candidates.filter(item => !recentIds.includes(item.id))
    if (fresh.length) candidates = fresh
  }
  return candidates[Math.floor(Math.random() * candidates.length)]
}

module.exports = {
  parseMeasurement,
  calculateBMI,
  classifyAdultBMI,
  calculateAgeYears,
  classifyChildBMI,
  assessPregnancy,
  getConditionGuidance,
  getPopulationLabel,
  buildSpecialPopulationAssessment,
  getLatestWeight,
  getRestrictionReasons,
  filterRecipesByDietaryRestrictions,
  buildMealCombination,
  buildHealthRecommendation,
  getMealPeriod,
  buildTimeBasedRecommendation,
  drawRandomRecipe
}
