const COMPACT_RECIPES = require('./verified-recipes')
const OPEN_RECIPES = require('./open-recipes')

const MEAL_TYPES = ['家常热菜', '凉菜', '汤羹', '主食', '早餐', '小吃甜品', '饮品']
const CUISINES = ['家常菜', '东北菜', '湘菜', '川菜', '傣菜']
const HEALTH_TAGS = ['增能均衡', '日常均衡', '轻盈低卡', '轻享解馋', '放纵高热量', '零食加餐', '常见家常']
const DRAW_POOLS = ['轻盈低卡', '均衡健康', '家常快手', '轻享解馋', '放纵高热量', '零食加餐']
const ALLERGENS = ['蛋', '奶', '花生与坚果', '豆制品', '小麦或麸质', '鱼类', '甲壳及贝类', '芝麻']
const EMOJIS = {
  家常热菜: '🍲',
  凉菜: '🥗',
  汤羹: '🥣',
  主食: '🍚',
  早餐: '🍳',
  小吃甜品: '🍰',
  饮品: '🥛'
}

const PREPARATION_ACTION = /洗净|冲洗|浸泡|泡发|解冻|去骨|去皮|削皮|剥皮|去壳|开背|去虾线|去鳞|去鳃|去内脏|去蒂|去籽|去核|去筋|去膜|去腥|焯水|汆水|冷水(?:锅|下锅|中)|沥干|控干|擦干|切(?:片|块|段|丝|丁|条|碎|末|花|圈)|剁(?:碎|成)|拍碎|掰断|撕成|打散|搅匀|腌制|腌渍|挤干|分离蛋清|取蛋黄/
const SEASONING_NAME = /盐|糖|油|酱|醋|料酒|黄酒|白酒|啤酒|胡椒|花椒|辣椒粉|淀粉|蜂蜜|味精|鸡精|蚝油|豉油|豆瓣|腐乳|香料|桂皮|八角|香叶|孜然|五香粉|十三香|泡打粉|酵母|苏打/
const RAW_ANIMAL_FOOD = /(?:鸡(?!精|蛋)|鸭(?!蛋)|鹅(?!蛋)|猪|牛(?!奶)|羊(?!奶)|鱼|虾|蟹|蛤|贝|蚝|肉|排骨|猪蹄|牛腩|内脏|肝|肚|肠|鱿鱼|海参)/

function getIngredientAliases(name) {
  const value = String(name || '').replace(/[（(].*?[）)]/g, '').trim()
  const aliases = [value]
  const normalized = value
    .replace(/^(?:新鲜|冷冻|速冻|熟制|生|干)/, '')
    .replace(/(?:品牌不限|适量)$/, '')
    .trim()
  if (normalized && normalized !== value) aliases.push(normalized)
  const replacements = {
    西红柿: '番茄', 番茄: '西红柿', 大蒜: '蒜', 蒜瓣: '蒜', 生姜: '姜',
    香葱: '葱', 小葱: '葱', 葱花: '葱', 食用盐: '盐', 食盐: '盐',
    白砂糖: '糖', 食用油: '油', 植物油: '油'
  }
  Object.keys(replacements).forEach(key => {
    if (value.includes(key)) aliases.push(replacements[key])
  })
  return [...new Set(aliases.filter(item => item && item.length >= 1))]
}

function cleanPreparationClause(text) {
  return String(text || '')
    .replace(/^\s*(?:首先|然后|随后|接着|再|将|把)\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:g|克|ml|毫升)?\s*份数\s*(?:的)?/gi, '适量')
    .replace(/[，,]?\s*即为\s*[^，,。；;]+$/, '')
    .replace(/热心摊主/g, '摊主')
    .replace(/拿自己的小手/g, '用筷子或戴手套')
    .replace(/切成自己喜欢的大小/g, '切成大小均匀的块')
    .replace(/[（(][^）)]*(?:个人建议|根据自己刀工|随便切|自己的小手)[^）)]*[）)]/g, '')
    .replace(/如果着急可以用热水泡发/g, '用冷水充分泡发后沥干')
    .replace(/若是从冷冻柜里取出，需要放室温自然解冻\s*5\s*小时/g, '如为冷冻食材，提前放入冰箱冷藏室解冻')
    .replace(/可以求助摊主/g, '可在购买时请摊主代为切块')
    .replace(/随便切切就行了，主要是需要去腥味/g, '切段或切片用于去腥')
    .replace(/撇成薄片/g, '片成薄片')
    .replace(/头部滑十字/g, '表皮划十字')
    .replace(/加入\s+适量/g, '加入适量')
    .replace(/\s+([，,。；;])/g, '$1')
    .replace(/[，,]?\s*备用\s*$/, '')
    .replace(/[；;。]+$/, '')
    .trim()
}

function clauseHasPreparation(clause, aliases) {
  return aliases.some(alias => {
    let position = clause.indexOf(alias)
    while (position >= 0) {
      const nearby = clause.slice(Math.max(0, position - 20), Math.min(clause.length, position + alias.length + 36))
      if (PREPARATION_ACTION.test(nearby)) return true
      position = clause.indexOf(alias, position + alias.length)
    }
    return false
  })
}

function getIngredientNote(name, steps) {
  const ingredientName = String(name || '').trim()
  if (!ingredientName || SEASONING_NAME.test(ingredientName)) return ''
  const aliases = getIngredientAliases(ingredientName)
  const matches = []
  ;(steps || []).some(step => {
    const clauses = String(step && step.text || '').split(/[。；;]/)
    clauses.forEach(clause => {
      if (!clauseHasPreparation(clause, aliases)) return
      const cleaned = cleanPreparationClause(clause)
      if (cleaned && !matches.includes(cleaned)) matches.push(cleaned)
    })
    return matches.length >= 2
  })
  if (matches.length) {
    const first = matches[0]
    const combined = matches.length > 1 ? `${first}；${matches[1]}` : first
    return combined.length <= 96 ? `${combined}。` : `${first.slice(0, 94)}…。`
  }
  if (/鸡蛋|鸭蛋|鹅蛋|蛋黄|蛋清/.test(ingredientName)) return '先磕入单独小碗检查，再按步骤打散或分离蛋清、蛋黄。'
  if (RAW_ANIMAL_FOOD.test(ingredientName)) return '与即食食材分开处理，接触生食的刀具、案板和双手及时清洁。'
  return ''
}

function polishStepText(text) {
  let value = String(text || '')
    .replace(/热心摊主/g, '摊主')
    .replace(/拿自己的小手/g, '用筷子或戴手套')
    .replace(/本程序员认为的灵魂操作/g, '用于增香')
    .replace(/灵魂料汁/g, '料汁')
    .replace(/灵魂汁子/g, '蘸汁')
    .replace(/田螺酿的灵魂/g, '田螺酿的关键馅料')
    .replace(/切成自己喜欢的大小/g, '切成大小均匀的块')
    .replace(/用差不多三倍大面团的容器/g, '使用容量约为面团 3 倍的容器')
    .replace(/一般晚上做第二天就可以用/g, '可隔夜冷藏发酵')
    .replace(/根据个人口味喜好/g, '按口味')
    .replace(/根据个人口味/g, '按口味')
    .replace(/自己喜欢的调味料/g, '所需调味料')
    .replace(/自己喜欢的酱/g, '喜欢的酱料')
    .replace(/捋成自己喜欢的形状/g, '整理成大小相近的条状')
    .replace(/按照模具纹路切块，或切成大小均匀的块/g, '切成大小均匀的块')
    .replace(/[（(]心急的小伙伴可以提早拿出来[）)]/g, '')
    .replace(/随便切切就行了，主要是需要去腥味/g, '切段或切片用于去腥')
    .replace(/可以求助摊主/g, '可在购买时请摊主代为切块')
    .replace(/若是从冷冻柜里取出，需要放室温自然解冻\s*5\s*小时/g, '如为冷冻食材，提前放入冰箱冷藏室解冻')
    .replace(/切记不可以/g, '不要')
    .replace(/切记不可/g, '注意不要')
    .replace(/切记不要/g, '避免')
    .replace(/务必是热水/g, '使用热水')
    .replace(/务必烧开[！!。]*/g, '煮至沸腾')
    .replace(/小心烫/g, '操作时注意防烫')
    .replace(/用到在/g, '用刀在')
    .replace(/\b2\s*mm\s+2\s*mm\b/gi, '2mm × 2mm')
    .replace(/(\d+\s*cm)\s*(\d+\s*cm)/gi, '$1 × $2')
    .replace(/向锅内加入油：份数\s*\d+(?:\.\d+)?\s*ml/gi, '按食材表用量向锅内加入油')
    .replace(/加入份数\s*\d+(?:\.\d+)?\s*(?:ml|毫升)\s*油/gi, '按食材表用量加入油')
    .replace(/加入份数\s*\d+(?:\.\d+)?\s*(?:ml|毫升)\s*的油/gi, '按食材表用量加入油')
    .replace(/加入[（(]份数\s*\d+(?:\.\d+)?[）)]\s*g\s*的油/g, '按食材表用量加入油')
    .replace(/加入[（(]份数\s*\d+(?:\.\d+)?[）)]\s*g\s*的盐/g, '按食材表用量加入盐')
    .replace(/加入\s*\d+(?:\.\d+)?\s*g\s*份数\s*的盐/g, '按食材表用量加入盐')
    .replace(/加入食盐\s*[（(]\d+(?:\.\d+)?g\s*份数[）)]/g, '按食材表用量加入食盐')
    .replace(/加入份数\s*\d+(?:\.\d+)?\s*ml油/gi, '按食材表用量加入油')
    .replace(/余下葱姜水不够\s*100g\s*再加一点清水（使用热水）/g, '加入余下的葱姜水，不足 100g 时用热水补足')
    .replace(/加入\s*3g\s*盐、3\s*g，最后/g, '加入 3g 盐和 3g 鸡精，最后')
    .replace(/调制料汁：生抽\s*5g\s*(?:吧)?\s*、蚝油\s*5g，加\s*3g\s*糖和\s*100g\s*清水半碗成一碗料汁/g, '调制料汁：将 5g 生抽、5g 蚝油、3g 糖和 100g 清水混合均匀')
    .replace(/开另一小锅将兑好的料汁倒入.*加入小米辣煮开/g, '将料汁倒入小锅用小火煮开，加入一半蒜末、少量姜丝和小米椒碎；如使用洋葱碎，可先用少量油将蒜末和洋葱炒香，再倒入料汁煮开')
    .replace(/料汁稍微收汁.*蒜末还是很给力的不要少蒜/g, '料汁煮沸后继续加热约 10 秒，略微收浓，再均匀淋在菜心上')
    .replace(/倒掉碗中的盐水，适当去掉香菇本身的水分（方便下一步煎炸）【可选】/g, '倒掉盐水，将香菇沥干；如不煎香菇可省略此步')
    .replace(/小火，倒入油，待油开始冒小泡（小火\s*30s，看每个锅的功率），倒入香菇，每面煎\s*10s\s*【可选】/g, '锅中倒油，小火加热约 30 秒，油面出现细小气泡后放入香菇，每面煎约 10 秒；如不煎香菇可省略此步')
    .replace(/使用容量约为面团\s*3\s*倍的容器装好，密封，冰箱冷藏（4\s*度）\s*等待\s*8–12\s*小时，可隔夜冷藏发酵/g, '将面团放入容量约为其 3 倍的容器并密封，在冰箱冷藏室（约 4°C）发酵 8–12 小时')
    .replace(/目测颜色微黄，用锅铲翻动感受倒略微有些硬了就可以/g, '炸至表面微黄、外壳定型并略微发硬')
    .replace(/土豆切成滚刀土豆，即切一刀动滚动一下/g, '土豆切滚刀块，每切一刀后转动土豆')
    .replace(/汁儿/g, '料汁')
    .replace(/浇给/g, '浇在猪蹄上')
    .replace(/；\s*吃[。.]?/g, '，即可食用。')
    .replace(/（如果是芹菜苗这一步略过）/g, '芹菜苗可省略此步。')
    .replace(/享用\s*:/g, '饮用：')
    .replace(/您可以/g, '可')
    .replace(/您需要/g, '需')
    .replace(/如果您的/g, '如果')
    .replace(/当然，/g, '')
    .replace(/随意尝试/g, '尝试')
    .replace(/大概/g, '约')
    .replace(/一点点/g, '少量')
    .replace(/差不多/g, '接近')
    .replace(/买好的/g, '准备好的')
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\s+([，,。；;：:])/g, '$1')
    .replace(/([。；;])\s*[；;]+/g, '$1')
    .replace(/；；+/g, '；')
    .replace(/。；/g, '。')
    .replace(/吧([、，,])/g, '$1')
    .replace(/(\d)\s*~\s*(\d)/g, '$1–$2')
    .replace(/~+/g, '')
    .replace(/！{2,}/g, '！')

  value = value
    .replace(/菜心洗净，去除根部比较硬或老的地方。此处还用刀刮了刮菜心根茎部分，刮掉外面那层比较硬的，菜心内部更可口，但要注意根茎白灼时长，时间太长的话根茎不脆了/g, '菜心洗净，去除老硬根部；可用刀轻刮根茎外层，焯煮时注意保持脆嫩')
    .replace(/大蒜切成蒜末，有洋葱顺便加了点洋葱/g, '大蒜切末；如使用洋葱，将洋葱切碎')
    .replace(/调制料汁：生抽\s*5g\s*、蚝油\s*5g，加\s*3g\s*糖和\s*100g\s*清水半碗成一碗(?:汁|料汁)/g, '调制料汁：将 5g 生抽、5g 蚝油、3g 糖和 100g 清水混合均匀')
    .replace(/将料汁倒入小锅用小火煮开.*再倒入料汁煮开/g, '将料汁倒入小锅用小火煮开，加入一半蒜末、少量姜丝和小米椒碎；如使用洋葱碎，可先用少量油将蒜末和洋葱炒香，再倒入料汁煮开')
    .replace(/料汁稍微收汁.*不要少蒜/g, '料汁煮沸后继续加热约 10 秒，略微收浓，再均匀淋在菜心上')
    .replace(/小火，倒入油，待油开始冒小泡（小火\s*30s\s*，?看每个锅的功率），倒入香菇，每面煎\s*10s\s*【可选】/g, '锅中倒油，小火加热约 30 秒，油面出现细小气泡后放入香菇，每面煎约 10 秒；如不煎香菇可省略此步')
    .replace(/加入\s*3\s*g\s*盐、3\s*g，最后/g, '加入 3g 盐和 3g 鸡精，最后')
    .replace(/香菇切片（每片厚度\s*0\.5–1\s*cm,厚点相对薄点更有嚼劲），放入大碗中，倒入\s*2g\s*食用盐\s*浸泡\s*15\s*分钟/g, '香菇切成 0.5–1cm 厚片，放入大碗，加入 2g 盐拌匀后静置 15 分钟')
    .replace(/生粉倒入小碗中，加入\s*50ml\s*水，搅拌生粉直至融化没有颗粒（即水淀粉）/g, '生粉放入小碗，加入 50ml 水，搅拌至无颗粒，调成水淀粉')
    .replace(/使用容量约为面团\s*3\s*倍的容器装好，密封，冰箱冷藏（4\s*度）\s*等待\s*8–12\s*小时，可隔夜冷藏发酵/g, '将面团放入容量约为其 3 倍的容器并密封，在冰箱冷藏室（约 4°C）发酵 8–12 小时')
    .replace(/观察面团醒发完毕\s*接近是原始大小大约两倍算醒发完毕/g, '面团发酵至约原体积的 2 倍')
    .replace(/案板撒稍微多一点的干面粉，准备开始揉面/g, '案板撒足量干面粉，放上面团')
    .replace(/因为是比较湿的面团，所以粘上干面粉后才没那么粘手，不用揉太多次，面团表面稍微光滑一点就可以了/g, '轻揉至面团表面基本光滑即可，避免过度揉搓')
    .replace(/用手拉扯，或者擀面杖擀平，也不一定非得擀圆，只要厚度均匀，烤箱放得进去就好/g, '用手拉伸或擀面杖擀成厚度均匀、适合烤盘大小的饼皮，不必强求圆形')
    .replace(/铺好油纸，放上饼皮，依照个人口味，把准备好的食材放上去，撒上芝士碎/g, '烤盘铺油纸，放上饼皮，按口味铺好配料并撒上芝士碎')
    .replace(/水果烤箱上\s*180\s*度，下\s*220\s*度，16\s*分钟即可/g, '制作水果披萨时，烤箱上火 180°C、下火 220°C，烤约 16 分钟')
    .replace(/肉蔬菜烤箱上\s*200\s*度，下\s*230\s*度，18\s*分钟即可/g, '制作肉类或蔬菜披萨时，烤箱上火 200°C、下火 230°C，烤约 18 分钟')
    .replace(/稍微搅拌小就好/g, '轻轻搅拌均匀')
    .replace(/干米粉/g, '干面粉')
    .replace(/根据上面的计算公式/g, '按食材表用量')
    .replace(/根据计算公式/g, '按食材表用量')
    .replace(/揉制/g, '揉拌')
    .replace(/将温加热/g, '将油温加热')
    .replace(/(\d+)°(?!C)/g, '$1°C')
    .replace(/空干水/g, '控干水分')
    .replace(/清水\+盐/g, '淡盐水')
    .replace(/肉先剁好，块状，用淡盐水浸泡\s*5\s*分钟，去除血水，去腥，然后控干水分/g, '鸡肉剁成大小均匀的块，用淡盐水浸泡 5 分钟后控干水分')
    .replace(/葱蒜辣椒土豆等洗干净，土豆削皮/g, '葱、蒜、辣椒和土豆洗净，土豆削皮')
    .replace(/葱白切长段，长度\s*4cm\s*一段，菜椒和线椒切块状/g, '葱白切成约 4cm 长段，菜椒和线椒切块')
    .replace(/将裹好粉的肉条用筷子夹入油锅中，整理成大小相近的条状，炸\s*3–5\s*分钟定型。炸至/g, '将裹好粉的肉条逐条放入油锅，炸 3–5 分钟，至')
    .replace(/将油温升至\s*180°C\s*放入/g, '将油温升至 180°C，放入')
    .replace(/调制中小火/g, '调至中小火')
    .replace(/炖到汁收的接近时可以进行翻面，将土豆与汤汁相吸/g, '汤汁收浓后轻轻翻动，使土豆均匀裹上汤汁')

  if (/若确认瓶中椰汁已彻底冻结.*墙角、椅背、桌角等坚硬表面上用力抽打/.test(value)) {
    value = '确认椰汁完全冻结后，将瓶身包入干净毛巾，在稳固台面上轻敲至形成细碎冰沙，避免撞击尖锐或易损表面。'
  }
  return value.replace(/[。；;]?$/, '。').trim()
}

function expandRecipe(row) {
  const [
    id, name, mealType, cuisine, healthTags, drawPools,
    healthEligible, energyLevel, kcal, servings, durationMinutes,
    difficulty, compactIngredients, allergens, compactSteps, tips, referenceUrl,
    processImageCloudPaths, sourceCoverCloudPath
  ] = row
  const steps = compactSteps.map((step, index) => {
    const text = polishStepText(Array.isArray(step) ? step[0] : step)
    const imageCloudPaths = Array.isArray(step) ? step[1] : []
    return { id: `s${index + 1}`, order: index + 1, text, imageCloudPaths, images: [] }
  })
  const ingredients = compactIngredients.map(([ingredientName, amount]) => {
    const note = getIngredientNote(ingredientName, steps)
    return {
      name: ingredientName,
      amount,
      note,
      noteKind: note.startsWith('与即食食材分开处理') ? 'safety' : 'prep'
    }
  })
  return {
    id,
    source: 'builtin',
    name,
    description: `${name}的做法来自公开社区菜谱，食材、火候与操作顺序均按原始方法整理。`,
    mealType,
    cuisine,
    healthTags,
    drawPools,
    healthEligible: Boolean(healthEligible),
    energyLevel,
    estimatedKcalPerServing: kcal,
    servings,
    durationMinutes,
    difficulty,
    ingredients,
    seasonings: [],
    allergens,
    ingredientKeywords: ingredients.map(item => item.name),
    steps,
    processImageCloudPaths: processImageCloudPaths || [],
    sourceCoverCloudPath: sourceCoverCloudPath || '',
    processImages: [],
    tips,
    coverImage: '',
    coverEmoji: EMOJIS[mealType] || '🍽️',
    videoUrl: '',
    tutorialLinks: [],
    imageQuery: name,
    referenceName: 'HowToCook 社区菜谱（Unlicense）',
    referenceUrl,
    sourceLicense: 'Unlicense',
    methodVerified: true,
    createdAt: 1704067200000,
    updatedAt: 1785859200000
  }
}

const BUILTIN_RECIPES = COMPACT_RECIPES.map(expandRecipe).concat(OPEN_RECIPES)

module.exports = {
  BUILTIN_RECIPES,
  MEAL_TYPES,
  CUISINES,
  HEALTH_TAGS,
  DRAW_POOLS,
  ALLERGENS,
  getIngredientNote
}
