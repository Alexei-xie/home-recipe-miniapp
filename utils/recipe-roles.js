const MEAL_ROLES = ['staple', 'protein', 'vegetable', 'soup', 'snack', 'drink']
const SEASONING = /油|酱|醋|料酒|胡椒|花椒|鸡精|鸡粉|味精|鱼露|高汤|浓汤|蚝油|虾皮|虾米|肉粉|牛肉粉/
const PROTEIN = /鸡蛋|鸭蛋|鹌鹑蛋|蛋白|蛋黄|豆腐|豆干|豆皮|豆花|腐竹|毛豆|鸡肉|鸡胸|鸡腿|鸡翅|整鸡|鸡块|鸭肉|牛肉|羊肉|猪肉|肉末|肉馅|瘦肉|五花肉|里脊|排骨|猪蹄|鱼|虾|蟹|贝|蛤|蚝|鲍|鱿|鳗|鳝|鱔|海参|带鱼|牛腩|牛腱|肥肠|猪肝|火腿|香肠|午餐肉/
const ANIMAL = /鸡肉|鸡胸|鸡腿|鸡翅|整鸡|鸡块|鸭|牛肉|羊肉|猪肉|肉末|肉馅|瘦肉|五花肉|里脊|排骨|猪蹄|鱼|虾|蟹|贝|蛤|蚝|鲍|鱿|鳗|鳝|鱔|海参|牛腩|牛腱|肥肠|猪肝|火腿|香肠|午餐肉/
const VEGETABLE = /白菜|青菜|菜心|油菜|油麦菜|空心菜|叶菜|蔬菜|苦菊|菠菜|芹菜|生菜|包菜|卷心菜|西蓝花|西兰花|花菜|菜花|番茄|西红柿|黄瓜|冬瓜|丝瓜|西葫芦|茄子|南瓜|苦瓜|萝卜|青椒|彩椒|菜椒|莴笋|竹笋|莲藕|豇豆|四季豆|荷兰豆|毛豆|豆角|秋葵|芦笋|韭菜|蒜苔|菌|菇|口蘑|木耳|银耳/

function getRecipeMealRoles(recipe) {
  if (!recipe) return []
  if (Array.isArray(recipe.mealRoles)) return recipe.mealRoles.filter(role => MEAL_ROLES.includes(role))
  const mealType = recipe.canonicalMealType || recipe.mealType
  if (mealType === '主食' || mealType === '早餐') return ['staple']
  if (mealType === '饮品') return ['drink', 'snack']
  if (mealType === '小吃甜品') return ['snack']
  if (mealType === '汤羹') return ['soup']
  const ingredients = (recipe.ingredients || []).map(item => item.name)
  const names = (ingredients.length ? ingredients : recipe.ingredientKeywords || [])
    .map(name => String(name || '').replace(/蟹味菇/g, '蘑菇'))
    .filter(name => !SEASONING.test(name.replace(/油麦菜/g, '青菜')))
  const roles = []
  if (names.some(name => PROTEIN.test(name))) roles.push('protein')
  // 蚝油、鸡精不算主蛋白；鱼肉菜不能因为配了葱姜就占用蔬菜位置。
  if (names.some(name => VEGETABLE.test(name)) && !names.some(name => ANIMAL.test(name))) roles.push('vegetable')
  return roles
}

module.exports = { MEAL_ROLES, getRecipeMealRoles }
