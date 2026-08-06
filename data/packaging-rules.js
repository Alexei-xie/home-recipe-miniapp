// 常见零售包装/起购规格。fresh 表示散称，incrementG 是常见最小称重步进；
// packaged 表示需购买完整包装；用于采购清单的数量换算，不涉及价格。
const EXACT_PACKAGING_RULES = {
  鸡蛋: { mode: 'packaged', packageSizeG: 500, unitsPerPackage: 10, label: '10枚装（约500克）' },
  牛奶: { mode: 'packaged', packageSizeG: 250, label: '250毫升/盒' },
  酸奶: { mode: 'packaged', packageSizeG: 150, label: '150克/杯' },
  豆腐: { mode: 'packaged', packageSizeG: 400, label: '400克/盒' },
  腐竹: { mode: 'packaged', packageSizeG: 250, label: '250克/袋' },
  木耳: { mode: 'packaged', packageSizeG: 100, label: '100克/袋' },
  海带: { mode: 'packaged', packageSizeG: 100, label: '100克/袋' },
  大米: { mode: 'packaged', packageSizeG: 2500, label: '2.5千克/袋' },
  小米: { mode: 'packaged', packageSizeG: 500, label: '500克/袋' },
  燕麦: { mode: 'packaged', packageSizeG: 500, label: '500克/袋' },
  面条: { mode: 'packaged', packageSizeG: 500, label: '500克/袋' },
  面粉: { mode: 'packaged', packageSizeG: 1000, label: '1千克/袋' },
  粉丝: { mode: 'packaged', packageSizeG: 200, label: '200克/袋' },
  全麦面包: { mode: 'packaged', packageSizeG: 350, label: '350克/袋' },
  椰奶: { mode: 'packaged', packageSizeG: 400, label: '400毫升/罐' },
  可可粉: { mode: 'packaged', packageSizeG: 100, label: '100克/袋' },
  炼乳: { mode: 'packaged', packageSizeG: 185, label: '185克/罐' },
  可乐: { mode: 'packaged', packageSizeG: 330, label: '330毫升/罐' },
  豆浆: { mode: 'packaged', packageSizeG: 250, label: '250毫升/盒' },
  糯米粉: { mode: 'packaged', packageSizeG: 500, label: '500克/袋' },
  淡奶油: { mode: 'packaged', packageSizeG: 250, label: '250毫升/盒' },
  冰粉粉: { mode: 'packaged', packageSizeG: 40, label: '40克/袋' },
  黑巧克力: { mode: 'packaged', packageSizeG: 100, label: '100克/块' },
  黄油: { mode: 'packaged', packageSizeG: 200, label: '200克/盒' },
  咖啡: { mode: 'packaged', packageSizeG: 30, label: '单杯份' },
  乌龙茶: { mode: 'packaged', packageSizeG: 50, label: '50克/袋' },
  啤酒: { mode: 'packaged', packageSizeG: 330, label: '330毫升/罐' },
  花生: { mode: 'packaged', packageSizeG: 250, label: '250克/袋' },
  核桃: { mode: 'packaged', packageSizeG: 200, label: '200克/袋' },
  芝麻: { mode: 'packaged', packageSizeG: 100, label: '100克/袋' },
  食用油: { mode: 'packaged', packageSizeG: 900, label: '1升/瓶（约900克）' },
  白糖: { mode: 'packaged', packageSizeG: 500, label: '500克/袋' },
  淀粉: { mode: 'packaged', packageSizeG: 200, label: '200克/袋' },
  生抽: { mode: 'packaged', packageSizeG: 500, label: '500毫升/瓶' },
  醋: { mode: 'packaged', packageSizeG: 500, label: '500毫升/瓶' },
  盐: { mode: 'packaged', packageSizeG: 400, label: '400克/袋' },
  清水: { mode: 'pantry', packageSizeG: 0, label: '家中常备' }
}

const MEAT_AND_SEAFOOD = new Set(['鸡胸肉', '鸡腿肉', '鸡翅', '猪瘦肉', '五花肉', '牛瘦肉', '牛腩', '羊肉', '排骨', '鲈鱼', '虾仁', '贝类'])

function getDefaultPackagingRule(foodName) {
  if (EXACT_PACKAGING_RULES[foodName]) return Object.assign({}, EXACT_PACKAGING_RULES[foodName])
  if (MEAT_AND_SEAFOOD.has(foodName)) {
    return { mode: 'fresh', incrementG: 250, packageSizeG: 250, label: '散称，按250克起购' }
  }
  return { mode: 'fresh', incrementG: 50, packageSizeG: 50, label: '散称，按50克起购' }
}

module.exports = { EXACT_PACKAGING_RULES, getDefaultPackagingRule }
