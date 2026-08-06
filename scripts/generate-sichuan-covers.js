/*
 * 为川菜内置菜谱生成轻量的独立抽象插画封面。
 * 运行：node scripts/generate-sichuan-covers.js
 * 不依赖图片库或网络，输出 480px PNG，避免为 32 道菜引入大体积实拍图。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const size = 480
const outputDir = path.resolve(__dirname, '../assets/recipe-covers/sichuan')

const dishes = [
  ['r225', '水煮牛肉', 'beef', '#B21D21', '#F3B13F', '#7F151A'], ['r226', '口水鸡', 'chicken', '#C62B20', '#F2BF4E', '#761A1A'],
  ['r227', '夫妻肺片', 'sliced', '#9E281E', '#D99C47', '#58171B'], ['r228', '川北凉粉', 'jelly', '#BE3428', '#EEDB9A', '#713027'],
  ['r229', '辣子鸡', 'chicken', '#CE281F', '#E69C2F', '#75171C'], ['r230', '川味回锅肉', 'pork', '#AD3E28', '#F1B75B', '#623026'],
  ['r261', '毛血旺', 'hotpot', '#B71D22', '#D7753B', '#63151B'], ['r262', '鱼香茄子', 'eggplant', '#7A3B6D', '#E09136', '#4A2350'],
  ['r263', '水煮鸡片', 'chicken', '#D62B26', '#F3CD6A', '#7C1A1D'], ['r264', '蒜泥白肉', 'pork', '#E0B59D', '#77A867', '#9B5040'],
  ['r265', '干煸牛肉丝', 'beef', '#914127', '#D6A63F', '#5E291D'], ['r266', '豆花鱼', 'fish', '#C43A27', '#E7D6A0', '#70271F'],
  ['r325', '麻辣香锅', 'hotpot', '#B11D25', '#EF9B35', '#601920'], ['r326', '酸菜鱼', 'fish', '#B45B2A', '#C1C357', '#6C3824'],
  ['r327', '泡椒凤爪', 'claw', '#D9783A', '#D4402C', '#81422A'], ['r328', '甜水面', 'noodles', '#A95B2B', '#E2B54B', '#673D25'],
  ['r329', '担担面', 'noodles', '#B63828', '#F1C162', '#68281F'], ['r330', '红油抄手', 'wonton', '#C92424', '#F0A84D', '#721A1C'],
  ['r331', '豆瓣鲫鱼', 'fish', '#B53828', '#E7A941', '#6B251C'], ['r332', '泡椒牛肉', 'beef', '#B43A2A', '#E3B04A', '#6A281F'],
  ['r333', '灯影牛肉丝', 'beef', '#923320', '#D79138', '#582018'], ['r334', '泡菜炒肉', 'pork', '#C1532C', '#E5B846', '#713222'],
  ['r335', '川味干煸四季豆', 'beans', '#7C9A42', '#E08336', '#405929'], ['r336', '川味凉面', 'noodles', '#B33B26', '#EACB6C', '#63281D'],
  ['r337', '豆豉蒸鱼', 'fish', '#7C5530', '#BFD078', '#48341F'], ['r338', '麻辣豆腐', 'tofu', '#C42A20', '#F4D77C', '#7D1B1B'],
  ['r339', '泡椒藕带', 'lotus', '#D4AA65', '#D84A32', '#80603C'], ['r340', '川味粉蒸肉', 'pork', '#A85D32', '#E7C06D', '#63351F'],
  ['r341', '辣子田螺', 'snail', '#7B5B40', '#D52D25', '#493428'], ['r342', '川味蒜苗炒腊肉', 'pork', '#9B4B2C', '#76A154', '#5D2D1D'],
  ['r343', '伤心凉粉', 'jelly', '#C8392A', '#EEDB9A', '#6B2A25'], ['r344', '叶儿粑', 'pastry', '#7AA063', '#F0E0A7', '#46633B']
]

function hex(value) {
  const normalized = value.replace('#', '')
  return [0, 2, 4].map(index => parseInt(normalized.slice(index, index + 2), 16))
}

function hash(text) {
  return [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 17)
}

function random(seed) {
  const value = Math.sin(seed) * 10000
  return value - Math.floor(value)
}

function createCanvas() {
  return new Uint8Array(size * size * 4)
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4
  canvas[offset] = color[0]
  canvas[offset + 1] = color[1]
  canvas[offset + 2] = color[2]
  canvas[offset + 3] = 255
}

function ellipse(canvas, cx, cy, rx, ry, color) {
  const fromX = Math.max(0, Math.floor(cx - rx)); const toX = Math.min(size - 1, Math.ceil(cx + rx))
  const fromY = Math.max(0, Math.floor(cy - ry)); const toY = Math.min(size - 1, Math.ceil(cy + ry))
  for (let y = fromY; y <= toY; y += 1) for (let x = fromX; x <= toX; x += 1) {
    if (((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1) setPixel(canvas, x, y, color)
  }
}

function rect(canvas, cx, cy, width, height, color, radius = 8) {
  const fromX = Math.floor(cx - width / 2); const toX = Math.ceil(cx + width / 2)
  const fromY = Math.floor(cy - height / 2); const toY = Math.ceil(cy + height / 2)
  for (let y = fromY; y <= toY; y += 1) for (let x = fromX; x <= toX; x += 1) {
    const dx = Math.max(Math.abs(x - cx) - width / 2 + radius, 0)
    const dy = Math.max(Math.abs(y - cy) - height / 2 + radius, 0)
    if (dx * dx + dy * dy <= radius * radius) setPixel(canvas, x, y, color)
  }
}

function line(canvas, x1, y1, x2, y2, width, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
  for (let index = 0; index <= steps; index += 1) ellipse(canvas, x1 + (x2 - x1) * index / steps, y1 + (y2 - y1) * index / steps, width / 2, width / 2, color)
}

function triangle(canvas, a, b, c, color) {
  const minX = Math.floor(Math.min(a[0], b[0], c[0])); const maxX = Math.ceil(Math.max(a[0], b[0], c[0]))
  const minY = Math.floor(Math.min(a[1], b[1], c[1])); const maxY = Math.ceil(Math.max(a[1], b[1], c[1]))
  const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const s = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area
    const t = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area
    if (s >= 0 && t >= 0 && s + t <= 1) setPixel(canvas, x, y, color)
  }
}

function drawIngredient(canvas, kind, x, y, accent, highlight, index) {
  const darkGreen = [89, 133, 69]
  if (kind === 'fish') {
    ellipse(canvas, x, y, 31, 15, highlight); triangle(canvas, [x + 24, y], [x + 48, y - 18], [x + 48, y + 18], highlight); ellipse(canvas, x - 13, y - 3, 3, 3, [48, 37, 34])
  } else if (kind === 'drink') {
    rect(canvas, x, y + 6, 27, 43, highlight, 5); ellipse(canvas, x, y - 15, 13, 5, [247, 223, 157]); line(canvas, x + 8, y - 16, x + 18, y - 40, 5, [86, 135, 75])
  } else if (kind === 'noodles') {
    line(canvas, x - 32, y - 11, x + 30, y + 9, 10, highlight); line(canvas, x - 31, y + 7, x + 32, y - 12, 10, highlight)
  } else if (kind === 'wonton' || kind === 'pastry') {
    triangle(canvas, [x, y - 25], [x + 31, y + 22], [x - 31, y + 22], highlight)
  } else if (kind === 'tofu' || kind === 'jelly' || kind === 'hotpot') {
    rect(canvas, x, y, 36, 31, highlight, 6)
  } else if (kind === 'beans' || kind === 'lotus') {
    ellipse(canvas, x, y, 30, 10, highlight); if (kind === 'lotus') ellipse(canvas, x, y, 6, 6, [247, 222, 164])
  } else if (kind === 'snail') {
    ellipse(canvas, x, y, 22, 22, highlight); ellipse(canvas, x, y, 11, 11, accent); ellipse(canvas, x + 3, y - 3, 4, 4, [238, 193, 117])
  } else if (kind === 'eggplant') {
    ellipse(canvas, x, y, 15, 34, highlight); triangle(canvas, [x, y - 37], [x + 11, y - 24], [x - 11, y - 24], darkGreen)
  } else if (kind === 'claw') {
    line(canvas, x - 18, y + 15, x - 5, y - 18, 10, highlight); line(canvas, x - 5, y - 18, x + 9, y + 12, 10, highlight); line(canvas, x + 9, y + 12, x + 22, y - 14, 9, highlight)
  } else if (kind === 'vegetable') {
    ellipse(canvas, x, y, 18, 31, highlight); ellipse(canvas, x - 12, y - 9, 12, 21, [110, 160, 74]); ellipse(canvas, x + 12, y - 9, 12, 21, [110, 160, 74])
  } else {
    rect(canvas, x, y, kind === 'sliced' ? 52 : 44, 28, highlight, 10)
    if (kind === 'chicken' || kind === 'pork' || kind === 'sliced') line(canvas, x - 15, y + (index % 2 ? 5 : -4), x + 15, y + (index % 2 ? 5 : -4), 3, [248, 211, 126])
  }
}

function drawDish(dish) {
  const [id, name, kind, accentValue, highlightValue, darkValue] = dish
  const seed = hash(`${id}-${name}`); const accent = hex(accentValue); const highlight = hex(highlightValue); const dark = hex(darkValue)
  const canvas = createCanvas(); const creamA = [255, 241, 203]; const creamB = [243, 216, 151]
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const amount = (x + y) / (size * 2); setPixel(canvas, x, y, creamA.map((value, index) => Math.round(value * (1 - amount) + creamB[index] * amount)))
  }
  for (let index = 0; index < 28; index += 1) {
    const x = Math.round(random(seed + index * 7) * size); const y = Math.round(random(seed + index * 11) * size)
    ellipse(canvas, x, y, 3 + random(seed + index) * 8, 3 + random(seed + index * 3) * 8, index % 2 ? highlight : accent)
  }
  ellipse(canvas, 240, 338, 192, 127, [112, 66, 42]); ellipse(canvas, 240, 325, 180, 117, [40, 35, 34]); ellipse(canvas, 240, 315, 164, 103, dark); ellipse(canvas, 240, 307, 149, 89, accent)
  for (let index = 0; index < 12; index += 1) {
    const angle = Math.PI * 2 * index / 12 + random(seed + index) * 0.3; const distance = 26 + random(seed + index * 5) * 88
    drawIngredient(canvas, kind, 240 + Math.cos(angle) * distance, 307 + Math.sin(angle) * distance * 0.65, accent, index % 3 ? highlight : hex('#E98238'), index)
  }
  for (let index = 0; index < 18; index += 1) {
    const x = 115 + Math.round(random(seed + index * 17) * 245); const y = 238 + Math.round(random(seed + index * 19) * 134)
    ellipse(canvas, x, y, 3 + (index % 3), 3 + (index % 3), [246, 195, 86]); if (index % 2) rect(canvas, x + 7, y - 4, 10, 8, [99, 154, 68], 2)
  }
  line(canvas, 194, 185, 187, 157, 5, [255, 255, 247]); line(canvas, 240, 177, 246, 143, 5, [255, 255, 247]); line(canvas, 285, 186, 293, 157, 5, [255, 255, 247])
  return canvas
}

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0) }
  return (value ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function writePng(target, canvas) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) { raw[y * (size * 4 + 1)] = 0; Buffer.from(canvas.buffer).copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))])
  fs.writeFileSync(target, png)
}

function generateSichuanCovers() {
  fs.mkdirSync(outputDir, { recursive: true })
  dishes.forEach((dish) => writePng(path.join(outputDir, `${dish[0]}.png`), drawDish(dish)))
  console.log(`已生成 ${dishes.length} 张川菜独立抽象封面：${outputDir}`)
}

if (require.main === module) generateSichuanCovers()

module.exports = { dishes, drawDish, writePng, generateSichuanCovers }
