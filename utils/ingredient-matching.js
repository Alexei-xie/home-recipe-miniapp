// 仅做常见同义名称归一，不推断食品是否绝对无过敏原。
const ALIASES = [
  [/西红柿/g, '番茄'], [/芫荽/g, '香菜'], [/西蓝花/g, '西兰花'],
  [/马铃薯/g, '土豆'], [/番薯|甘薯/g, '红薯'], [/洋白菜|圆白菜|卷心菜/g, '包菜'],
  [/蒜瓣|蒜末|蒜蓉|大蒜/g, '蒜'], [/姜末|姜片|姜丝|生姜/g, '姜'],
  [/香葱|小葱|葱花/g, '葱'], [/花生米/g, '花生']
]

function normalizeIngredient(value) {
  return ALIASES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement),
    String(value || '').trim().toLowerCase())
}

function ingredientKeywords(recipe) {
  return Array.from(new Set([].concat(recipe.ingredientKeywords || [],
    (recipe.ingredients || []).filter(Boolean).map(item => item.name),
    (recipe.seasonings || []).filter(Boolean).map(item => item.name)).filter(Boolean)))
}

function containsIngredient(recipe, keyword) {
  const target = normalizeIngredient(keyword)
  return Boolean(target && ingredientKeywords(recipe).some(name => normalizeIngredient(name).includes(target)))
}

module.exports = { normalizeIngredient, ingredientKeywords, containsIngredient }
