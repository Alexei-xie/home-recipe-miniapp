// 仅测 Node 逻辑与 setData 模拟载荷，不代表手机启动、图片解码或真实布局性能。
const assert = require('assert')
const { performance } = require('perf_hooks')
const { BUILTIN_RECIPES } = require('../data/recipes')
const { localStore, makePage } = require('./test-local-reliability')

const rows = []
for (const count of [BUILTIN_RECIPES.length, 1000, 5000]) {
  const recipes = Array.from({ length: count }, (_, index) => Object.assign({}, BUILTIN_RECIPES[index % BUILTIN_RECIPES.length], { id: `bench_${index}` }))
  const times = []
  let packetBytes = 0
  let maxCards = 0
  for (let repeat = 0; repeat < 6; repeat++) {
    const store = localStore()
    const storage = store.open(); storage.initStorage()
    const home = makePage('pages/index/index.js', {
      '../../utils/storage': Object.assign({}, storage, { getAllRecipes: () => recipes }),
      '../../utils/share': { enableShareMenu() {} },
      '../../utils/image-service': { getRecipeInitialImage: () => '', hydrateRecipeCovers: async list => list }
    })
    const start = performance.now()
    home.onShow()
    const elapsed = performance.now() - start
    if (repeat) times.push(elapsed) // 首次预热不纳入中位数。
    assert.strictEqual(home.data.visibleRecipes.length, 16)
    packetBytes = Math.max(packetBytes, Buffer.byteLength(JSON.stringify(home.patches)))
    maxCards = Math.max(maxCards, home.data.visibleRecipes.length)
  }
  times.sort((a, b) => a - b)
  rows.push({ recipes: count, logicMedianMs: Number(times[Math.floor(times.length / 2)].toFixed(2)),
    firstScreenCards: maxCards, initialSetDataBytes: packetBytes })
}
console.table(rows)
console.log('首屏卡片保持16张。长时间滚动的节点/内存仍需在微信真机性能面板验证；本结果不能替代真机数据。')
