// 非 GitHub 开放来源菜谱。中文步骤按原始方法翻译并适配家庭厨房；
// 每道菜保留来源页面与许可，详情页可查看原始出处。

const CREATED_AT = 1785926400000

function recipe(config) {
  return {
    id: config.id,
    source: 'builtin',
    name: config.name,
    description: config.description,
    mealType: config.mealType,
    cuisine: '家常菜',
    healthTags: config.healthTags,
    drawPools: config.drawPools,
    healthEligible: false,
    energyLevel: config.energyLevel,
    estimatedKcalPerServing: config.kcal,
    servings: config.servings || 2,
    durationMinutes: config.duration,
    difficulty: config.difficulty,
    ingredients: config.ingredients.map(item => ({
      name: item[0],
      amount: item[1],
      note: item[2] || '',
      noteKind: item[2] ? 'prep' : ''
    })),
    seasonings: [],
    allergens: config.allergens,
    ingredientKeywords: config.ingredients.map(item => item[0]),
    steps: config.steps.map((text, index) => ({
      id: `${config.id}_s${index + 1}`,
      order: index + 1,
      text,
      image: '',
      imageCloudPaths: []
    })),
    processImageCloudPaths: [],
    sourceCoverCloudPath: '',
    processImages: [],
    tips: config.tips || [],
    coverImage: '',
    coverEmoji: config.emoji,
    videoUrl: '',
    tutorialLinks: [],
    imageQuery: config.name,
    referenceName: config.referenceName || 'Wikibooks Cookbook（CC BY-SA 4.0）',
    referenceUrl: config.referenceUrl,
    sourceLicense: config.sourceLicense || 'CC BY-SA 4.0',
    methodVerified: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  }
}

module.exports = [
  recipe({
    id: 'w001',
    name: '沙克舒卡',
    description: '番茄和彩椒慢煮成浓酱，再直接卧入鸡蛋焖熟的一锅早餐。',
    mealType: '早餐',
    healthTags: ['日常均衡', '常见家常'],
    drawPools: ['均衡健康', '家常快手'],
    energyLevel: 'medium',
    kcal: 330,
    servings: 3,
    duration: 35,
    difficulty: '中等',
    emoji: '🍳',
    ingredients: [
      ['橄榄油', '25ml'], ['洋葱', '1个，切丁'], ['红彩椒', '1个，切丁'], ['绿彩椒', '1个，切丁'],
      ['大蒜', '4瓣，切末'], ['孜然粉', '3g'], ['甜椒粉', '3g'], ['辣椒粉', '1g'],
      ['碎番茄', '800g'], ['鸡蛋', '6个'], ['菲达奶酪', '60g'], ['欧芹或香菜', '10g'],
      ['皮塔饼或面包', '3份'], ['盐', '3g'], ['黑胡椒', '1g']
    ],
    allergens: ['蛋', '奶', '小麦或麸质'],
    steps: [
      '深煎锅中加入橄榄油，中火加热；放入洋葱丁和两种彩椒丁，翻炒约 8 分钟，至蔬菜变软但不焦黑。',
      '加入蒜末、孜然粉、甜椒粉和辣椒粉，持续翻炒约 1 分钟，让香料受热出香。',
      '倒入碎番茄，加入盐和黑胡椒拌匀；煮开后转中小火，不加盖慢煮约 10 分钟，期间搅拌 2–3 次，煮至酱汁略浓。',
      '用勺背在番茄酱中压出 6 个浅窝，将鸡蛋逐个磕入小碗检查后放入浅窝，避免蛋壳落入锅中。',
      '盖上锅盖焖 6–8 分钟，确认蛋白完全凝固；喜欢全熟蛋黄可再焖 2–3 分钟。',
      '关火后撒上菲达奶酪碎和欧芹或香菜，配烤热的皮塔饼或面包食用。'
    ],
    tips: ['鸡蛋属于高风险食材，老人、孕妇或免疫力较低人群建议将蛋黄也彻底加热。'],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Shakshuka'
  }),
  recipe({
    id: 'w002',
    name: '炸鹰嘴豆丸子',
    description: '浸泡鹰嘴豆与香草、香料打碎成馅，炸至外壳酥脆、内部松软。',
    mealType: '小吃甜品',
    healthTags: ['轻享解馋', '常见家常'],
    drawPools: ['轻享解馋', '零食加餐'],
    energyLevel: 'high',
    kcal: 480,
    servings: 4,
    duration: 55,
    difficulty: '中等',
    emoji: '🧆',
    ingredients: [
      ['干鹰嘴豆', '240g，提前浸泡'], ['大蒜', '4瓣'], ['欧芹', '15g，切碎'], ['洋葱', '1个，切块'],
      ['芫荽籽粉', '2g'], ['孜然粉', '2g'], ['辣椒粉', '1g'], ['泡打粉', '4g'],
      ['中筋面粉', '45g'], ['植物油', '约500ml，按锅具调整'], ['盐', '3g']
    ],
    allergens: ['小麦或麸质'],
    steps: [
      '干鹰嘴豆提前 8–12 小时用足量冷水浸泡，水面至少高出豆子 5cm；泡好后冲洗并充分沥干。不要用煮熟的罐头鹰嘴豆代替。',
      '将鹰嘴豆、大蒜、欧芹和洋葱分批放入料理机，间歇搅打成细碎颗粒；保持略有颗粒感，不要打成流动泥糊。',
      '加入芫荽籽粉、孜然粉、辣椒粉、泡打粉、盐和面粉拌匀，静置 15 分钟，让面粉吸收水分。',
      '取约一汤匙馅料攥紧并搓成直径约 3cm 的丸子；若无法成形，再少量加入面粉，每次不超过 5g。',
      '小锅加油至能浸没丸子一半以上，加热至约 175°C；先放一颗试炸，能稳定冒小泡且不散开再分批下锅。',
      '每批炸约 3–4 分钟，期间翻面，至各面深金黄色；捞出放在厨房纸或沥油架上，静置 2 分钟后食用。'
    ],
    tips: ['油炸时锅内食材不要超过油面面积的一半，避免油温骤降和溢锅。'],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Falafel'
  }),
  recipe({
    id: 'w003',
    name: '西班牙冷汤',
    description: '番茄、彩椒和黄瓜打成带颗粒的冰凉蔬菜汤，适合炎热天气。',
    mealType: '汤羹',
    healthTags: ['轻盈低卡', '日常均衡'],
    drawPools: ['轻盈低卡', '均衡健康'],
    energyLevel: 'low',
    kcal: 180,
    servings: 3,
    duration: 45,
    difficulty: '简单',
    emoji: '🥣',
    ingredients: [
      ['番茄', '450g，去蒂切块'], ['绿彩椒', '225g，去籽切块'], ['黄瓜', '半根，去皮切块'],
      ['洋葱', '半个，切块'], ['大蒜', '1瓣'], ['隔夜白面包', '50g，可选'], ['葡萄酒醋', '15ml'],
      ['橄榄油', '30ml'], ['冰水', '240ml'], ['盐', '3g'], ['黑胡椒', '1g']
    ],
    allergens: ['小麦或麸质'],
    steps: [
      '如使用面包，将面包撕成小块，用冷水浸泡 30 分钟后挤干；不放面包可得到更清爽、稀薄的汤。',
      '番茄洗净去蒂，彩椒去籽，黄瓜去皮；洋葱和大蒜去皮，所有蔬菜切成便于搅打的小块。',
      '将面包、番茄、彩椒、黄瓜、洋葱、大蒜、葡萄酒醋、橄榄油和一半冰水放入搅拌机。',
      '间歇搅打至蔬菜细碎但仍保留少量颗粒；根据浓稠度逐步加入剩余冰水，避免一次加得过多。',
      '加入盐和黑胡椒调味，装入带盖容器冷藏至少 30 分钟，使汤充分降温并融合味道。',
      '食用前搅匀并尝味，可搭配少量番茄丁、黄瓜丁和彩椒丁；冷藏后 24 小时内饮用完毕。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Gazpacho'
  }),
  recipe({
    id: 'w004',
    name: '法式洋葱汤',
    description: '洋葱慢炒至金黄，用高汤煨出甜味，再覆盖面包和奶酪焗香。',
    mealType: '汤羹',
    healthTags: ['轻享解馋', '常见家常'],
    drawPools: ['轻享解馋'],
    energyLevel: 'medium',
    kcal: 390,
    servings: 4,
    duration: 55,
    difficulty: '中等',
    emoji: '🥣',
    ingredients: [
      ['洋葱', '500g，切薄片'], ['黄油', '25g'], ['中筋面粉', '15g'], ['牛肉高汤', '1.5L'],
      ['月桂叶', '1片'], ['百里香', '2枝'], ['法棍面包', '4片'], ['格鲁耶尔奶酪', '125g，擦丝'],
      ['肉豆蔻粉', '少许'], ['盐', '3g'], ['黑胡椒', '1g']
    ],
    allergens: ['奶', '小麦或麸质'],
    steps: [
      '厚底汤锅小火融化黄油，加入洋葱片拌匀；以中小火炒 20–25 分钟，每 2–3 分钟翻动一次，至洋葱柔软、呈均匀金黄色。',
      '撒入面粉，继续小火翻炒 3–4 分钟，让面粉与黄油完全混合并去除生粉味；刮起锅底褐色焦化物增加风味。',
      '先倒入约三分之二高汤，边倒边搅拌避免结块；加入月桂叶和百里香，煮开后再加入剩余高汤。',
      '转小火保持微沸 15 分钟，加入盐、黑胡椒和少量肉豆蔻粉；捞出月桂叶和百里香。',
      '法棍片烤至表面干脆；将热汤分装进可耐高温的汤碗，每碗放一片面包并覆盖奶酪丝。',
      '放入烤箱上层，用上火或烧烤模式焗约 5–8 分钟，至奶酪完全融化并出现褐色斑点；取出后静置 2 分钟再食用。'
    ],
    tips: ['汤碗必须明确标注可进烤箱；取出后碗沿和把手都很烫。'],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:French_Onion_Soup'
  }),
  recipe({
    id: 'w005',
    name: '鹰嘴豆泥',
    description: '鹰嘴豆煮至绵软后与芝麻酱、蒜和孜然打成顺滑蘸酱。',
    mealType: '凉菜',
    healthTags: ['日常均衡', '零食加餐'],
    drawPools: ['均衡健康', '零食加餐'],
    energyLevel: 'medium',
    kcal: 260,
    servings: 4,
    duration: 160,
    difficulty: '中等',
    emoji: '🥗',
    ingredients: [
      ['干鹰嘴豆', '200g'], ['小苏打', '4g'], ['大蒜', '2瓣'], ['芝麻酱', '60g'],
      ['柠檬汁', '30ml'], ['孜然粉', '2g'], ['橄榄油', '15ml'], ['盐', '3g'], ['清水', '适量']
    ],
    allergens: ['芝麻'],
    steps: [
      '干鹰嘴豆加入至少 3 倍体积冷水和小苏打，浸泡 8–12 小时；泡好后冲洗 2–3 遍。',
      '鹰嘴豆放入锅中，加入大蒜和没过豆子约 5cm 的清水，煮开后撇去浮沫。',
      '转小火加盖煮约 90–120 分钟，至鹰嘴豆用手指轻压即可成泥；水量不足时补充热水。',
      '沥出鹰嘴豆并保留一杯煮豆水；趁温热放入料理机，先搅打 1 分钟。',
      '加入芝麻酱、柠檬汁、孜然粉和盐，继续搅打；分次加入煮豆水，每次约 15ml，调到细腻可流动但不稀薄的状态。',
      '装盘后用勺背划出浅沟，淋橄榄油；完全冷却后密封冷藏，建议 3 天内食用。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Hummus_I'
  }),
  recipe({
    id: 'w006',
    name: '日式饭团',
    description: '短粒米包入熟三文鱼馅，捏成三角并用海苔包裹的便携主食。',
    mealType: '主食',
    healthTags: ['日常均衡', '常见家常'],
    drawPools: ['均衡健康', '家常快手'],
    energyLevel: 'medium',
    kcal: 310,
    servings: 2,
    duration: 45,
    difficulty: '中等',
    emoji: '🍙',
    ingredients: [
      ['日式短粒米', '200g'], ['清水', '按电饭煲刻度'], ['三文鱼', '100g，彻底煎熟'],
      ['海苔', '2张'], ['盐', '2g'], ['熟白芝麻', '5g，可选']
    ],
    allergens: ['鱼类', '芝麻'],
    steps: [
      '短粒米淘洗至水基本清澈，按电饭煲刻度加水；煮熟后焖 10 分钟，再用饭勺翻松散热。',
      '煮饭期间将三文鱼擦干，小火煎至中心完全变色且能轻易拨散；去皮去刺后压成小块，可拌入少量熟芝麻。',
      '准备一碗凉开水并加入盐。米饭降温至手能承受但仍温热时，双手蘸盐水防粘。',
      '取约四分之一米饭放在掌心压成厚圆片，中间放一勺三文鱼，边缘向中间合拢，确保馅料完全被米饭包住。',
      '双手轻轻收拢饭团，转动并整理成三角形；不要过度用力挤压，以免口感过实。重复制作其余饭团。',
      '饭团表面不再冒热气后包上海苔。建议现做现吃；如需携带，应使用保冷袋并避免长时间处于室温。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Onigiri'
  }),
  recipe({
    id: 'w007',
    name: '味噌豆腐汤',
    description: '味噌、豆腐、海带芽和菌菇组成的简洁日式汤羹。',
    mealType: '汤羹',
    healthTags: ['轻盈低卡', '日常均衡'],
    drawPools: ['轻盈低卡', '均衡健康', '家常快手'],
    energyLevel: 'low',
    kcal: 120,
    servings: 2,
    duration: 20,
    difficulty: '简单',
    emoji: '🥣',
    ingredients: [
      ['味噌', '35g'], ['嫩豆腐', '200g，切1.5cm块'], ['鲜香菇', '3朵，切片'],
      ['干海带芽', '3g'], ['小葱', '1根，切末'], ['芝麻油', '2ml'], ['清水', '700ml']
    ],
    allergens: ['豆制品', '芝麻'],
    steps: [
      '干海带芽用冷水浸泡 5 分钟，泡开后冲洗并挤去多余水分；豆腐切块，香菇切片，小葱切末。',
      '小锅加入芝麻油和葱白，小火翻炒约 1 分钟；倒入 600ml 清水并煮开。',
      '加入香菇，中小火煮 3–4 分钟；再加入豆腐和海带芽，小火加热 2 分钟，避免大力搅拌弄碎豆腐。',
      '味噌放入小碗，加入剩余 100ml 温水搅至没有结块。',
      '将锅调至最小火，倒入味噌水轻轻拌匀；看到锅边出现细小气泡即可关火，不要长时间沸腾。',
      '盛入碗中撒葱绿，趁热食用；味噌咸度差异较大，先尝味再决定是否额外加盐。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Miso_Soup'
  }),
  recipe({
    id: 'w008',
    name: '照烧三文鱼',
    description: '三文鱼短时腌渍后煎烤成熟，表面带有姜蒜与酱油的照烧风味。',
    mealType: '家常热菜',
    healthTags: ['日常均衡', '常见家常'],
    drawPools: ['均衡健康', '家常快手'],
    energyLevel: 'medium',
    kcal: 420,
    servings: 2,
    duration: 35,
    difficulty: '中等',
    emoji: '🐟',
    ingredients: [
      ['带皮三文鱼排', '2块，共约340g'], ['生抽', '45ml'], ['姜', '10g，切末'], ['大蒜', '2瓣，切末'],
      ['米醋', '15ml'], ['柠檬皮屑', '2g'], ['红糖', '12g'], ['芝麻油', '5ml'], ['食用油', '10ml']
    ],
    allergens: ['鱼类', '豆制品', '小麦或麸质', '芝麻'],
    steps: [
      '检查三文鱼并用镊子拔除残留鱼刺，表面用厨房纸擦干；生熟食材使用不同砧板和容器。',
      '将生抽、姜末、蒜末、米醋、柠檬皮屑、红糖和芝麻油搅匀，倒入密封袋，放入三文鱼并排出空气。',
      '放入冰箱冷藏腌制 30 分钟，最多不超过 4 小时；取出后丢弃接触过生鱼的腌汁，并把鱼表面擦干。',
      '平底锅中火预热，加入食用油；先将三文鱼皮面朝下放入，用锅铲轻压 20 秒防止卷曲。',
      '皮面煎 4–5 分钟至酥脆，翻面后再煎 3–4 分钟；厚鱼排可将侧面各煎约 30 秒。',
      '确认鱼肉中心达到安全熟度且能呈片状剥离，盛出静置 3 分钟后食用。'
    ],
    tips: ['腌过生鱼的料汁不要直接作为淋汁使用；如需酱汁，应另取一份未接触生食的调味汁煮沸收浓。'],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Teriyaki_Salmon'
  }),
  recipe({
    id: 'w009',
    name: '泰式炒河粉',
    description: '河粉与虾、鸡蛋、豆芽同炒，以罗望子、鱼露和糖调出酸甜咸味。',
    mealType: '主食',
    healthTags: ['轻享解馋', '常见家常'],
    drawPools: ['轻享解馋'],
    energyLevel: 'high',
    kcal: 720,
    servings: 3,
    duration: 35,
    difficulty: '较难',
    emoji: '🍜',
    ingredients: [
      ['干河粉', '225g'], ['鲜虾', '225g，去壳去虾线'], ['鸡蛋', '2个'], ['豆芽', '300g'],
      ['胡萝卜', '80g，切丝'], ['洋葱', '80g，切丝'], ['小葱', '4根，切段'], ['大蒜', '2瓣，切末'],
      ['鱼露', '45ml'], ['米醋', '35ml'], ['罗望子汁', '60ml'], ['棕榈糖或白糖', '55g'],
      ['植物油', '45ml'], ['花生碎', '60g'], ['辣椒碎', '适量'], ['青柠', '1个，切角']
    ],
    allergens: ['蛋', '鱼类', '甲壳及贝类', '花生与坚果'],
    steps: [
      '干河粉用温水浸泡约 20 分钟，泡至能弯曲但中心仍有韧性，立即沥干；不要泡到完全软熟。',
      '鱼露、米醋、罗望子汁和糖放入碗中搅拌，静置至糖基本溶解；鲜虾去壳去虾线并擦干。',
      '炒锅大火烧热后加入一半植物油，放入蒜末和少量辣椒碎炒约 20 秒；加入鲜虾炒至两面变色、中心刚熟，先盛出。',
      '锅中补入剩余油，放入洋葱丝和胡萝卜丝炒 1–2 分钟；加入河粉，用锅铲和筷子快速挑散。',
      '把河粉拨到锅边，空处磕入鸡蛋，待底部凝固后划散，再与河粉翻匀。',
      '沿锅边倒入调味汁，保持中大火翻炒约 2 分钟，让河粉吸收汤汁；若河粉仍硬，可沿锅边加 15–30ml 热水。',
      '放回鲜虾，加入豆芽和小葱段，继续翻炒 1–2 分钟；确认虾完全熟透后关火。',
      '装盘后撒花生碎，搭配青柠角；食用前挤入青柠汁。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Pad_Thai'
  }),
  recipe({
    id: 'w010',
    name: '塔布勒沙拉',
    description: '布格麦与番茄、彩椒、欧芹和柠檬汁拌成清新的中东谷物沙拉。',
    mealType: '凉菜',
    healthTags: ['轻盈低卡', '日常均衡'],
    drawPools: ['轻盈低卡', '均衡健康'],
    energyLevel: 'medium',
    kcal: 290,
    servings: 4,
    duration: 35,
    difficulty: '简单',
    emoji: '🥗',
    ingredients: [
      ['布格麦', '120g'], ['柠檬汁', '60ml'], ['橄榄油', '60ml'], ['欧芹', '1大把，切碎'],
      ['红彩椒', '半个，切小丁'], ['绿彩椒', '半个，切小丁'], ['番茄', '3个'],
      ['盐', '4g'], ['黑胡椒', '1g'], ['薄荷叶', '10g，可选']
    ],
    allergens: ['小麦或麸质'],
    steps: [
      '布格麦放入耐热碗，倒入足量沸水浸泡 5 分钟；尝一粒确认中心没有硬芯后沥干，并轻压去除多余水分。',
      '趁布格麦温热加入柠檬汁、橄榄油、盐和黑胡椒拌匀，放入冰箱冷藏降温。',
      '彩椒去籽后切成约 5mm 小丁；欧芹去掉粗硬茎后切碎，薄荷叶如使用也切碎。',
      '番茄表皮划浅十字，放入沸水约 20 秒后转入冷水，撕去外皮；切成四瓣，去籽后切小丁。',
      '将彩椒、欧芹、薄荷和番茄加入布格麦中轻轻拌匀，尝味后调整盐和柠檬汁。',
      '密封冷藏至少 1 小时再食用；原来源建议更长时间冷藏，家庭制作建议当天吃完以保持蔬菜口感。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Tabbouleh_I'
  }),
  recipe({
    id: 'w011',
    name: '大阪烧',
    description: '卷心菜、鸡蛋和面糊煎成厚实咸味饼，表面搭配海苔与木鱼花。',
    mealType: '主食',
    healthTags: ['轻享解馋', '常见家常'],
    drawPools: ['轻享解馋', '家常快手'],
    energyLevel: 'high',
    kcal: 650,
    servings: 3,
    duration: 35,
    difficulty: '中等',
    emoji: '🥞',
    ingredients: [
      ['中筋面粉', '120g'], ['清水或高汤', '240ml'], ['鸡蛋', '2个'], ['卷心菜', '180g，切细丝'],
      ['小葱', '3根，切圈'], ['培根', '100g，切短片'], ['食用油', '15ml'],
      ['大阪烧酱', '30g'], ['海苔粉', '3g'], ['木鱼花', '10g']
    ],
    allergens: ['蛋', '小麦或麸质', '鱼类'],
    steps: [
      '卷心菜洗净沥干，去掉硬梗后切成约 3mm 细丝；小葱切圈，培根切成便于分食的短片。',
      '面粉、清水或高汤和鸡蛋放入大碗，用蛋抽搅拌约 25–30 下，刚好无明显干粉即可，避免过度搅拌起筋。',
      '加入卷心菜丝和小葱，用刮刀从底部向上翻拌，使蔬菜均匀裹上面糊。',
      '平底不粘锅中火预热，加入少量油；舀入三分之一面糊，整理成厚约 1.5cm 的圆饼，表面铺培根片。',
      '煎 3 分钟至底部金黄定型，用宽锅铲托住翻面；转中小火加盖煎约 5 分钟，确认培根和饼芯熟透。',
      '再次翻面，开盖煎 1 分钟收干表面；其余面糊按相同步骤完成。',
      '装盘后刷大阪烧酱，撒海苔粉和木鱼花；趁热切块食用。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Okonomiyaki_(Japanese_Savory_Pancake)'
  }),
  recipe({
    id: 'w012',
    name: '泰式绿咖喱鸡',
    description: '绿咖喱酱、椰奶和香茅慢煮鸡肉，酸香、辛辣且带椰奶的浓郁口感。',
    mealType: '家常热菜',
    healthTags: ['轻享解馋', '常见家常'],
    drawPools: ['轻享解馋'],
    energyLevel: 'high',
    kcal: 610,
    servings: 4,
    duration: 45,
    difficulty: '中等',
    emoji: '🍛',
    ingredients: [
      ['去骨鸡腿肉', '750g，切3cm块'], ['泰式绿咖喱酱', '30g'], ['椰奶', '400ml'], ['植物油', '15ml'],
      ['红糖', '12g'], ['香茅', '1根，拍裂'], ['青柠叶', '6片，撕开'], ['鱼露', '15ml'],
      ['青柠汁', '20ml'], ['香菜', '15g，切碎'], ['泰国香米饭', '4份']
    ],
    allergens: ['鱼类'],
    steps: [
      '鸡腿肉擦干后切成约 3cm 块；生鸡肉与即食食材分开处理，刀具、砧板和双手及时清洗。',
      '炒锅中火加热植物油，放入绿咖喱酱和红糖，以锅铲不断翻炒约 1 分钟；加入拍裂的香茅炒出香味。',
      '放入鸡肉块和青柠叶，翻炒 2–3 分钟，使每块鸡肉均匀裹上咖喱酱，表面开始变白。',
      '倒入椰奶和鱼露搅匀，煮至锅边出现气泡后转小火；保持轻微沸腾煮 25–30 分钟，期间翻动数次。',
      '确认最大鸡肉块中心完全熟透、没有粉红色，酱汁略微浓稠；夹出香茅。',
      '关火后加入青柠汁和香菜拌匀，静置 3 分钟再尝味；需要更咸时少量补鱼露。',
      '搭配刚煮好的泰国香米饭食用；咖喱较浓，可按需要淋少量酱汁。'
    ],
    referenceUrl: 'https://en.wikibooks.org/wiki/Cookbook:Thai_Green_Curry_with_Chicken'
  })
]
