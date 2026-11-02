const { DEFAULT_MEAL_TYPES: MEAL_TYPES, DEFAULT_CUISINES: CUISINES } = require('../utils/recipe-catalog')
const HEALTH_TAGS = ['增能均衡', '日常均衡', '轻盈低卡', '轻享解馋', '放纵高热量', '零食加餐', '常见家常']
const DRAW_POOLS = ['轻盈低卡', '均衡健康', '家常快手', '轻享解馋', '放纵高热量', '零食加餐']
const ALLERGENS = ['蛋', '奶', '花生与坚果', '豆制品', '小麦或麸质', '鱼类', '甲壳及贝类', '芝麻']

module.exports = { MEAL_TYPES, CUISINES, HEALTH_TAGS, DRAW_POOLS, ALLERGENS }
