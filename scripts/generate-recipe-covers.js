/*
 * 为除川菜外的所有内置菜谱生成逐菜独立的轻量抽象封面。
 * 运行：node scripts/generate-recipe-covers.js
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { BUILTIN_RECIPES } = require('../data/recipes')
const { drawDish, writePng } = require('./generate-sichuan-covers')

// 默认写入系统临时目录，绝不写回小程序 assets，避免再次超过 2MB 主包限制。
// 上传 CloudBase 前可通过 COVER_OUTPUT_DIR 指定一个临时导出目录。
const outputDir = process.env.COVER_OUTPUT_DIR || path.join(os.tmpdir(), 'today-eat-cloud-covers')
const PALETTES = [
  ['#B9472D', '#F0B951', '#6A2C21'], ['#5B8F5A', '#E4C85A', '#365C3A'],
  ['#3F7D92', '#E7C26D', '#254D5D'], ['#8A4C79', '#F0B16B', '#512E4A'],
  ['#B56B30', '#E7D183', '#6A3F25'], ['#B82C35', '#F2C064', '#6B2026'],
  ['#6776A8', '#E8C77A', '#3B466F'], ['#7A9951', '#F0D58B', '#435A31']
]

function recipeText(recipe) {
  return [recipe.name, recipe.mealType, recipe.cuisine, ...(recipe.ingredientKeywords || []), ...(recipe.ingredients || []).map(item => item.name)].join(' ')
}

function hash(text) {
  return [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17)
}

function getKind(recipe) {
  const text = recipeText(recipe)
  if (recipe.mealType === '饮品' || /奶茶|果汁|气泡|咖啡|茶|饮|冰沙|奶昔/.test(text)) return 'drink'
  if (recipe.mealType === '小吃甜品' || /蛋糕|布丁|冰淇淋|甜|糖|酥|派|挞|团子/.test(text)) return 'pastry'
  if (/虾|鱼|蛤|贝|蟹|鱿|生蚝|鲍|扇贝|鲈|鳕|三文鱼|鲳|黄花|带鱼|鲫|石斑|马鲛|田螺|海参|蛏|墨鱼/.test(text)) return 'fish'
  if (/面|粉|饺|包|饼|粽|馒头|三明治|米线|河粉|乌冬|意面|年糕|烧麦|馄饨|面包/.test(text)) return 'noodles'
  if (/豆腐|豆花/.test(text)) return 'tofu'
  if (/凉粉/.test(text)) return 'jelly'
  if (/茄子/.test(text)) return 'eggplant'
  if (/四季豆|豆角|豇豆|荷兰豆/.test(text)) return 'beans'
  if (/藕|莲/.test(text)) return 'lotus'
  if (/鸡|凤爪|翅根|鸡翅|鸡腿/.test(text)) return 'chicken'
  if (/牛/.test(text)) return 'beef'
  if (/猪|肉|排骨|腊|里脊|猪肝|猪蹄|肉丸|肥肠|培根|火腿/.test(text)) return 'pork'
  if (/汤|羹|粥|炖|煲|锅/.test(text)) return 'hotpot'
  return 'vegetable'
}

function createDish(recipe) {
  const palette = PALETTES[hash(`${recipe.id}-${recipe.name}-${recipe.cuisine}`) % PALETTES.length]
  return [recipe.id, recipe.name, getKind(recipe), ...palette]
}

fs.mkdirSync(outputDir, { recursive: true })
BUILTIN_RECIPES.forEach(recipe => writePng(path.join(outputDir, `${recipe.id}.png`), drawDish(createDish(recipe))))
console.log(`已生成 ${BUILTIN_RECIPES.length} 张 CloudBase 待上传封面：${outputDir}`)
