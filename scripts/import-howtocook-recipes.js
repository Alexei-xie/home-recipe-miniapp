const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const sourceRoot = path.resolve(process.argv[2] || '/private/tmp/howtocook-source')
const dishesRoot = path.join(sourceRoot, 'dishes')
const outputPath = path.join(projectRoot, 'data', 'verified-recipes.js')
const imageManifestPath = path.join(projectRoot, 'scripts', 'step-image-manifest.json')
const coverManifestPath = path.join(projectRoot, 'scripts', 'source-cover-manifest.json')
const existingRecipes = require('../data/verified-recipes')
const legacyRecipes = existingRecipes.map(item => Array.isArray(item)
  ? { id: item[0], name: item[1], cuisine: item[4] }
  : item)

const EXCLUDED_SECTIONS = new Set(['template', 'semi-finished'])
const MEAL_TYPE_BY_SECTION = {
  aquatic: '家常热菜',
  breakfast: '早餐',
  condiment: '小吃甜品',
  dessert: '小吃甜品',
  drink: '饮品',
  meat_dish: '家常热菜',
  soup: '汤羹',
  staple: '主食',
  vegetable_dish: '家常热菜'
}
const EMOJIS = {
  家常热菜: '🍲',
  凉菜: '🥗',
  汤羹: '🥣',
  主食: '🍚',
  早餐: '🍳',
  小吃甜品: '🍰',
  饮品: '🥛'
}
const TITLE_ALIASES = {
  西红柿炒鸡蛋: '番茄炒蛋'
}
const STABLE_ID_OVERRIDES = {
  番茄炒蛋: 'r001'
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(fullPath) : (entry.name.endsWith('.md') ? [fullPath] : [])
  })
}

function section(text, heading) {
  const match = text.match(new RegExp(`##\\s*(?:${heading})\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`))
  return match ? match[1].trim() : ''
}

function cleanMarkdown(text) {
  return removeMarkdownImages(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(\d)\s*\*\s*(\d)/g, '$1 × $2')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMarkdownImages(text) {
  const images = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('![', cursor)
    if (start < 0) break
    const labelEnd = text.indexOf('](', start + 2)
    if (labelEnd < 0) break
    let depth = 1
    let end = labelEnd + 2
    while (end < text.length && depth > 0) {
      if (text[end] === '(') depth += 1
      else if (text[end] === ')') depth -= 1
      end += 1
    }
    if (depth !== 0) break
    images.push({
      alt: text.slice(start + 2, labelEnd),
      source: text.slice(labelEnd + 2, end - 1).trim(),
      index: start,
      end
    })
    cursor = end
  }
  return images
}

function removeMarkdownImages(text) {
  const images = parseMarkdownImages(text)
  if (!images.length) return text
  let cursor = 0
  let result = ''
  images.forEach(image => {
    result += text.slice(cursor, image.index)
    cursor = image.end
  })
  return result + text.slice(cursor)
}

function getTitle(text, filePath) {
  const match = text.match(/^#\s+(.+?)(?:的做法)?\s*$/m)
  const title = cleanMarkdown(match ? match[1] : path.basename(filePath, '.md'))
  return TITLE_ALIASES[title] || title
}

function getRawTitle(text, filePath) {
  const match = text.match(/^#\s+(.+?)(?:的做法)?\s*$/m)
  return cleanMarkdown(match ? match[1] : path.basename(filePath, '.md'))
}

function normalizeImageLabel(value) {
  return cleanMarkdown(value).replace(/[\s·・，,。.!！?？:：()（）《》【】\[\]_-]/g, '')
}

function getMarkdownImages(text) {
  return parseMarkdownImages(text).map(image => ({
    alt: cleanMarkdown(image.alt),
    source: image.source,
    index: image.index
  }))
}

// 只把原文明示为成品/预览，或图名与菜名明确一致的图片用作列表封面。
// 无法确定是成品还是备菜过程时宁可不选，继续使用应用内插画。
function getSourceCover(text, filePath, displayName) {
  const images = getMarkdownImages(text)
  if (!images.length) return null
  const rawName = getRawTitle(text, filePath)
  const names = new Set([displayName, rawName].map(normalizeImageLabel).filter(Boolean))
  const normalized = images.map(image => Object.assign({}, image, { normalizedAlt: normalizeImageLabel(image.alt) }))
  const last = values => values.length ? values[values.length - 1] : null
  const explicitFinished = last(normalized.filter(image => /成品|效果图|封面|做好|完成/.test(image.alt)))
  if (explicitFinished) return explicitFinished
  const exactName = last(normalized.filter(image => names.has(image.normalizedAlt)))
  if (exactName) return exactName
  const operationMatch = text.match(/##\s*(?:操作|制作|做法)/)
  const operationIndex = operationMatch ? operationMatch.index : text.length
  const namedHeader = last(normalized.filter(image =>
    image.index < operationIndex && [...names].some(name => name && image.normalizedAlt.includes(name))
  ))
  if (namedHeader) return namedHeader
  return last(normalized.filter(image => /预览/.test(image.alt)))
}

function getDescription(text, title) {
  const beforeDifficulty = text.split(/预估烹饪难度|##\s*必备原料/)[0]
  const paragraphs = beforeDifficulty.split(/\n\s*\n/).map(cleanMarkdown).filter(Boolean)
  return paragraphs.find(item => !item.startsWith('#') && item !== title) || `${title}的家庭制作方法。`
}

function getListItems(block, ordered) {
  const matcher = ordered ? /^\s*\d+[.、)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/
  const result = []
  block.split('\n').forEach(line => {
    const match = line.match(matcher)
    if (match) result.push(cleanMarkdown(match[1]))
    else if (result.length && /^\s{2,}\S/.test(line) && !/^\s*[-*+]\s+/.test(line)) {
      result[result.length - 1] += ` ${cleanMarkdown(line)}`
    }
  })
  return result.filter(Boolean)
}

function normalizeIngredientName(value) {
  return cleanMarkdown(value)
    .replace(/[🍅🍌🍋🥚🥛🥩🍗🍚🥔🌽🥕]/g, '')
    .replace(/^总量[：:]?\s*/, '')
    .replace(/^每份[：:]?\s*/, '')
    .replace(/[（(](?:可选|推荐|用于|约|切|去|装饰)[^）)]*[）)]/g, '')
    .replace(/的数量$/, '')
    .replace(/^(?:准备|需要)\s*/, '')
    .trim()
}

function isKitchenTool(value) {
  return /锅|刀|盆|碗|烤箱|空气炸锅|搅拌机|模具|滤网|筛网|工具|容器|厨房纸|竹签|保鲜膜|雪克|克称|秤|簸箕|杯子/.test(value)
}

function extractAmount(value) {
  const normalized = cleanMarkdown(value).replace(/[。；;]$/, '')
  const equals = normalized.match(/[=＝]\s*(.+)$/)
  if (equals) return equals[1].trim()
  const match = normalized.match(/((?:约|大约|至少|不超过)?\s*\d[\d./~～-]*(?:\s*[—–-]\s*\d[\d./]*)?\s*(?:g|kg|ml|mL|L|克|千克|毫升|升|个|只|颗|枚|根|片|瓣|勺|茶匙|汤匙|杯|碗|盒|包|块|张|株|滴|撮|份|罐|瓶|节|段|把|斤|朵|粒)(?:\s*[（(][^）)]{0,40}[）)])?)/i)
  return match ? match[1].trim() : ''
}

function parseRequiredIngredient(line) {
  const raw = normalizeIngredientName(line)
  if (!raw || isKitchenTool(raw)) return null
  const amount = extractAmount(raw)
  let name = raw
  if (amount) name = raw.slice(0, raw.indexOf(amount)).replace(/[：:,，\s]+$/, '').trim()
  name = name.replace(/[（(][^）)]*[）)]/g, '').replace(/[：:,，\s]+$/, '').trim()
  return name ? { name, amount: amount || '' } : null
}

function getIngredients(text) {
  const required = getListItems(section(text, '必备原料和工具'), false).map(parseRequiredIngredient).filter(Boolean)
  const calculations = getListItems(section(text, '计算'), false).map(cleanMarkdown)
  return required
    .map(item => {
      if (item.amount) return item
      const calculation = calculations.find(line => {
        const normalizedLine = normalizeIngredientName(line)
        return normalizedLine.startsWith(item.name) || item.name.startsWith(normalizedLine.split(/[：:=＝\d]/)[0].trim())
      })
      return Object.assign(item, { amount: calculation ? (extractAmount(calculation) || '按来源中的份数公式换算') : '按实际份数适量' })
    })
    .filter((item, index, all) => item.name && all.findIndex(other => other.name === item.name) === index)
}

function getSteps(text) {
  const parsed = []
  const processImages = []
  let pendingImages = []
  section(text, '操作|制作|做法').split('\n').forEach(line => {
    const imageRefs = parseMarkdownImages(line).map(image => ({
      alt: cleanMarkdown(image.alt),
      source: image.source
    }))
    const lineWithoutImages = removeMarkdownImages(line).trimEnd()
    const topLevel = lineWithoutImages.match(/^\d+[.、)]\s+(.+)$/)
    const nested = lineWithoutImages.match(/^\s+(?:[-*+]|\d+[.、)])\s+(.+)$/)
    if (topLevel) {
      if (pendingImages.length && parsed.length) {
        parsed[parsed.length - 1].images.push(...pendingImages)
        pendingImages = []
      }
      parsed.push({ text: cleanMarkdown(topLevel[1]), images: imageRefs })
    } else if (nested && parsed.length && !nested[1].startsWith('![')) {
      parsed[parsed.length - 1].text += `；${cleanMarkdown(nested[1])}`
      parsed[parsed.length - 1].images.push(...imageRefs)
    } else if (imageRefs.length) {
      pendingImages.push(...imageRefs)
    }
  })
  // 文末连续图片在原文中没有声明与单一步骤的对应关系，保留为按原文顺序的步骤参考图。
  processImages.push(...pendingImages)
  const normalized = parsed.filter(step => step.text && !step.text.startsWith('!['))
  const merged = []
  normalized.forEach((step, sourceIndex) => {
    if (step.text.length <= 6 && /火|制作|炖煮|烘烤|备菜/.test(step.text) && normalized[sourceIndex + 1]) {
      normalized[sourceIndex + 1].text = `${step.text}：${normalized[sourceIndex + 1].text}`
      normalized[sourceIndex + 1].images.unshift(...step.images)
    } else if (step.text.length <= 6 && merged.length) {
      merged[merged.length - 1].text += `；${step.text}`
      merged[merged.length - 1].images.push(...step.images)
    } else {
      merged.push(step)
    }
  })
  return {
    steps: merged.map((step, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    text: step.text
      .replace(/到入/g, '倒入')
      .replace(/乘出/g, '盛出')
      .replace(/奥奥/g, '奥利奥饼干')
      .replace(/去除利利（夹心）/g, '去除夹心')
      .replace(/[。；;]?$/, '。'),
    imageSources: step.images
    })),
    processImages
  }
}

function getTips(text) {
  return getListItems(section(text, '附加内容|小贴士|注意事项'), false)
    .filter(item => !/Issue|Pull request|参考资料|如果您遵循|贡献/.test(item))
    .slice(0, 5)
}

function inferMealType(sourceSection, name) {
  if (/汤|羹|粥/.test(name)) return '汤羹'
  if (/凉拌|冷盘|沙拉|拍黄瓜|口水鸡|夫妻肺片|白切鸡|醉鸡|拌三丝|糖拌西红柿|芹菜拌茶树菇/.test(name)) return '凉菜'
  return MEAL_TYPE_BY_SECTION[sourceSection] || '家常热菜'
}

function inferCuisine(name, legacy) {
  if (legacy && ['东北菜', '湘菜', '川菜', '傣菜'].includes(legacy.cuisine)) return legacy.cuisine
  if (/东北|锅包肉|小鸡炖蘑菇|地三鲜|猪肉炖粉条|酸菜白肉|大拉皮|酱骨/.test(name)) return '东北菜'
  if (/湘|剁椒|小炒黄牛肉|辣椒炒肉|擂椒|农家小炒/.test(name)) return '湘菜'
  if (/川|麻婆|宫保|鱼香|水煮|口水鸡|夫妻肺片|辣子鸡|回锅肉|担担|红油抄手|酸菜鱼|毛血旺|蒜泥白肉/.test(name)) return '川菜'
  if (/傣|香茅|酸笋|撒撇|喃咪|舂鸡脚/.test(name)) return '傣菜'
  return '家常菜'
}

function inferAllergens(ingredients) {
  const text = ingredients.map(item => item.name).join(' ')
  const rules = [
    ['蛋', /蛋/], ['奶', /奶|黄油|芝士|乳酪|炼乳/], ['花生与坚果', /花生|核桃|腰果|杏仁|松仁|榛子/],
    ['豆制品', /豆腐|豆浆|豆皮|腐竹|香干|豆豉|黄豆|豆瓣/], ['小麦或麸质', /面粉|面条|面包|吐司|馒头|饺子皮|馄饨皮|河粉|乌冬|酱油|生抽|老抽/],
    ['鱼类', /鱼|鳗|鳕|鲈|鲫|鲤|鳊|金枪|鲳|带鱼/], ['甲壳及贝类', /虾|蟹|蛤|贝|蚝|螺|蛏/], ['芝麻', /芝麻|香油|麻油/]
  ]
  return rules.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
}

function inferNutrition(name, mealType, kcal) {
  const high = /炸|油条|肥|五花|红烧肉|甜|糖|蛋糕|饼干|奶茶|冰淇淋|拔丝|酥|锅包肉|咕噜肉/.test(name) || kcal >= 550
  const low = /清蒸|白灼|凉拌|蔬菜|青菜|黄瓜|冬瓜|西兰花|饮/.test(name) || (kcal > 0 && kcal <= 250)
  if (high) return { tags: ['轻享解馋', '常见家常'], pools: ['轻享解馋', '放纵高热量'], energy: 'high', eligible: false }
  if (low) return { tags: ['轻盈低卡', '日常均衡'], pools: ['轻盈低卡', '均衡健康', '家常快手'], energy: 'low', eligible: true }
  return { tags: ['日常均衡', '常见家常'], pools: ['均衡健康', '家常快手'], energy: 'medium', eligible: true }
}

function getDuration(text, mealType) {
  const values = [...text.matchAll(/(?:大约|约|只需|需要|全程|一般)?\s*(\d{1,3})\s*分钟/g)].map(match => Number(match[1])).filter(value => value >= 5 && value <= 240)
  return values.length ? values[0] : (mealType === '汤羹' ? 40 : 25)
}

function getServings(text) {
  const match = section(text, '计算').match(/(?:按照|以|够|适合)?\s*(\d{1,2})\s*(?:人|份)/)
  return match ? Math.max(1, Math.min(10, Number(match[1]))) : 2
}

function githubUrl(filePath) {
  const relative = path.relative(sourceRoot, filePath).split(path.sep).map(encodeURIComponent).join('/')
  return `https://github.com/Anduin2017/HowToCook/blob/master/${relative}`
}

function getRepositoryImageUrl(sourceDirectory, imageSource) {
  const sourcePath = path.posix.normalize(path.posix.join(sourceDirectory, decodeURIComponent(imageSource.split('#')[0])))
  return `https://media.githubusercontent.com/media/Anduin2017/HowToCook/master/${sourcePath.split('/').map(encodeURIComponent).join('/')}`
}

function getLocalCoverFallback(sourceDirectory, recipeName) {
  const directory = path.join(sourceRoot, sourceDirectory)
  if (!fs.existsSync(directory)) return ''
  const normalizedName = normalizeImageLabel(recipeName)
  const filename = fs.readdirSync(directory).find(item =>
    /\.(?:jpe?g|png|webp)$/i.test(item) && normalizeImageLabel(path.basename(item, path.extname(item))) === normalizedName
  )
  return filename ? `./${filename}` : ''
}

function buildRecipe(filePath, index, legacyByName) {
  const text = fs.readFileSync(filePath, 'utf8')
  const name = getTitle(text, filePath)
  const legacy = legacyByName.get(name)
  const sourceSection = path.relative(dishesRoot, filePath).split(path.sep)[0]
  const mealType = inferMealType(sourceSection, name)
  const ingredients = getIngredients(text)
  const parsedSteps = getSteps(text)
  const steps = parsedSteps.steps
  const kcalMatch = text.match(/预估卡路里[：:]\s*(\d+)/)
  const kcal = kcalMatch ? Number(kcalMatch[1]) : null
  const nutrition = inferNutrition(name, mealType, kcal || 0)
  const stars = (text.match(/预估烹饪难度[：:]\s*([^\n]+)/) || [])[1] || ''
  const difficulty = stars.includes('★★★') ? '较难' : (stars.includes('★★') ? '中等' : '简单')
  const tips = getTips(text)
  const allIngredients = ingredients.map(item => item.name)
  const recipeId = STABLE_ID_OVERRIDES[name] || (legacy ? legacy.id : `v${String(index + 1).padStart(3, '0')}`)
  const sourceCoverSource = getSourceCover(text, filePath, name)
  return {
    id: recipeId,
    source: 'builtin',
    name,
    description: getDescription(text, name),
    mealType,
    cuisine: inferCuisine(name, legacy),
    healthTags: nutrition.tags,
    drawPools: nutrition.pools,
    healthEligible: nutrition.eligible,
    energyLevel: nutrition.energy,
    estimatedKcalPerServing: kcal,
    servings: getServings(text),
    durationMinutes: getDuration(text, mealType),
    difficulty,
    ingredients,
    seasonings: [],
    allergens: inferAllergens(ingredients),
    ingredientKeywords: allIngredients,
    steps,
    processImageSources: parsedSteps.processImages,
    sourceCoverSource,
    tips: tips.length ? tips : ['首次制作建议按来源步骤与用量操作，再根据实际火力微调时间。'],
    coverImage: '',
    coverEmoji: EMOJIS[mealType] || '🍽️',
    videoUrl: '',
    tutorialLinks: [],
    imageQuery: name,
    referenceName: 'HowToCook 社区菜谱（Unlicense）',
    referenceUrl: githubUrl(filePath),
    sourceLicense: 'Unlicense',
    methodVerified: true,
    createdAt: 1704067200000,
    updatedAt: 1785859200000
  }
}

if (!fs.existsSync(dishesRoot)) {
  throw new Error(`未找到 HowToCook 数据目录：${dishesRoot}`)
}

const legacyByName = new Map(legacyRecipes.map(item => [item.name, item]))
const candidates = walk(dishesRoot).filter(filePath => {
  const sourceSection = path.relative(dishesRoot, filePath).split(path.sep)[0]
  return !EXCLUDED_SECTIONS.has(sourceSection)
})

// 同名食谱选择步骤更多、内容更完整的一份，避免重复展示。
const bestFileByName = new Map()
candidates.forEach(filePath => {
  const text = fs.readFileSync(filePath, 'utf8')
  const name = getTitle(text, filePath)
  const score = getSteps(text).steps.length * 1000 + text.length
  const current = bestFileByName.get(name)
  if (!current || score > current.score) bestFileByName.set(name, { filePath, score })
})

const recipes = [...bestFileByName.values()]
  .map((entry, index) => buildRecipe(entry.filePath, index, legacyByName))
  .filter(recipe => recipe.ingredients.length && recipe.steps.length >= 2)
  .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

const stepImageManifest = []
const sourceCoverManifest = []
recipes.forEach(recipe => {
  const recipeFile = new URL(recipe.referenceUrl).pathname.split('/blob/master/')[1]
  const sourceDirectory = path.posix.dirname(decodeURIComponent(recipeFile))
  let recipeImageCounter = 0
  const registerImages = (sources, target) => {
    sources.forEach((imageSource) => {
      recipeImageCounter += 1
      const cloudPath = `recipe-steps/${recipe.id}/${String(recipeImageCounter).padStart(3, '0')}.jpg`
      const sourceUrl = /^https?:\/\//.test(imageSource.source)
        ? imageSource.source
        : getRepositoryImageUrl(sourceDirectory, imageSource.source)
      target.push(cloudPath)
      stepImageManifest.push({ recipeId: recipe.id, recipeName: recipe.name, alt: imageSource.alt, cloudPath, sourceUrl })
    })
  }
  recipe.steps.forEach(step => {
    step.imageCloudPaths = []
    registerImages(step.imageSources || [], step.imageCloudPaths)
    delete step.imageSources
  })
  recipe.processImageCloudPaths = []
  registerImages(recipe.processImageSources || [], recipe.processImageCloudPaths)
  delete recipe.processImageSources
  recipe.sourceCoverCloudPath = ''
  if (recipe.sourceCoverSource) {
    const imageSource = recipe.sourceCoverSource
    const coverSource = /^https?:\/\//.test(imageSource.source)
      ? getLocalCoverFallback(sourceDirectory, recipe.name)
      : imageSource.source
    if (coverSource) {
      const cloudPath = `recipe-source-covers/${recipe.id}.jpg`
      const sourceUrl = getRepositoryImageUrl(sourceDirectory, coverSource)
      recipe.sourceCoverCloudPath = cloudPath
      sourceCoverManifest.push({ recipeId: recipe.id, recipeName: recipe.name, alt: imageSource.alt, cloudPath, sourceUrl })
    }
  }
  delete recipe.sourceCoverSource
})

// 发布包采用紧凑数组，公共字段和说明在 data/recipes.js 中恢复，避免重复键名使主包膨胀。
const compactRecipes = recipes.map(recipe => [
  recipe.id,
  recipe.name,
  recipe.mealType,
  recipe.cuisine,
  recipe.healthTags,
  recipe.drawPools,
  recipe.healthEligible ? 1 : 0,
  recipe.energyLevel,
  recipe.estimatedKcalPerServing,
  recipe.servings,
  recipe.durationMinutes,
  recipe.difficulty,
  recipe.ingredients.map(item => [item.name, item.amount]),
  recipe.allergens,
  recipe.steps.map(item => item.imageCloudPaths.length ? [item.text, item.imageCloudPaths] : item.text),
  recipe.tips,
  recipe.referenceUrl,
  recipe.processImageCloudPaths,
  recipe.sourceCoverCloudPath
])
const banner = `// 此文件由 scripts/import-howtocook-recipes.js 自动生成。\n// 方法来源：Anduin2017/HowToCook（Unlicense）；不要手工编辑。\n`
fs.writeFileSync(outputPath, `${banner}module.exports=[\n${compactRecipes.map(item => JSON.stringify(item)).join(',\n')}\n]\n`)
fs.writeFileSync(imageManifestPath, `${JSON.stringify(stepImageManifest, null, 2)}\n`)
fs.writeFileSync(coverManifestPath, `${JSON.stringify(sourceCoverManifest, null, 2)}\n`)
console.log(`已生成 ${recipes.length} 道有来源菜谱：${outputPath}`)
console.log(`已生成 ${stepImageManifest.length} 张步骤图清单：${imageManifestPath}`)
console.log(`已生成 ${sourceCoverManifest.length} 张来源成品封面清单：${coverManifestPath}`)
