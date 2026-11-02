// 代码原生几何插画与底栏图标；不访问网络，不依赖图片生成服务。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const root = path.resolve(__dirname, '..')

function canvas(size, background) {
  const data = Buffer.alloc(size * size * 4)
  function dot(x, y, color) {
    x = Math.round(x); y = Math.round(y)
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const offset = (y * size + x) * 4
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255
  }
  if (background) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) dot(x, y, background)
  function oval(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if ((x - cx) ** 2 / rx ** 2 + (y - cy) ** 2 / ry ** 2 <= 1) dot(x, y, color)
    }
  }
  function line(ax, ay, bx, by, width, color) {
    const length = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)))
    for (let i = 0; i <= length; i++) oval(ax + (bx - ax) * i / (length || 1), ay + (by - ay) * i / (length || 1), width / 2, width / 2, color)
  }
  function polygon(points, color) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let inside = false
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]; const [xj, yj] = points[j]
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
      }
      if (inside) dot(x, y, color)
    }
  }
  return { data, size, oval, line, polygon }
}

function crc(buffer) {
  let result = 0xffffffff
  for (const byte of buffer) {
    result ^= byte
    for (let bit = 0; bit < 8; bit++) result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0)
  }
  return (result ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const label = Buffer.from(type)
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([label, data])))
  return Buffer.concat([length, label, data, checksum])
}

function writePng(filename, art) {
  const raw = Buffer.alloc((art.size * 4 + 1) * art.size)
  for (let y = 0; y < art.size; y++) art.data.copy(raw, y * (art.size * 4 + 1) + 1, y * art.size * 4, (y + 1) * art.size * 4)
  const header = Buffer.alloc(13); header.writeUInt32BE(art.size); header.writeUInt32BE(art.size, 4); header[8] = 8; header[9] = 6
  const buffer = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
  fs.writeFileSync(filename, buffer)
  return buffer.length
}

const C = { cream: [255, 248, 232], green: [59, 113, 78], light: [137, 171, 103], gold: [232, 167, 78],
  brown: [124, 71, 47], orange: [215, 116, 59], red: [179, 65, 54], white: [255, 252, 241] }

function cover(kind) {
  const art = canvas(256, C.cream)
  const { oval, line, polygon } = art
  oval(128, 205, 94, 13, [231, 222, 198])
  if (kind === 'vegetable') {
    oval(128, 169, 94, 38, C.white)
    line(115, 161, 111, 122, 17, C.light)
    line(158, 164, 155, 132, 12, C.light)
    for (const [x, y, r] of [[89, 110, 28], [117, 94, 31], [139, 116, 27], [160, 120, 24]]) oval(x, y, r, r, C.green)
    oval(77, 161, 21, 18, C.red); oval(180, 166, 18, 16, C.orange)
  } else if (kind === 'chicken') {
    oval(128, 167, 94, 37, C.white)
    line(148, 149, 188, 105, 15, [238, 222, 184])
    oval(190, 100, 11, 11, C.white); oval(199, 110, 11, 11, C.white)
    oval(113, 150, 54, 36, C.orange); oval(98, 142, 33, 22, C.gold)
    line(75, 187, 187, 181, 5, C.green)
  } else if (kind === 'meat') {
    oval(128, 167, 94, 37, C.white)
    oval(126, 148, 69, 42, C.brown); oval(126, 141, 63, 36, C.red)
    for (const x of [90, 119, 148]) line(x, 123, x + 13, 157, 5, C.brown)
    oval(185, 174, 20, 9, C.green)
  } else if (kind === 'soup') {
    oval(128, 162, 84, 43, C.green); oval(128, 139, 84, 28, C.white); oval(128, 139, 73, 21, C.gold)
    for (const [x, y] of [[96, 137], [127, 144], [159, 133]]) oval(x, y, 9, 5, C.light)
    line(94, 96, 89, 76, 5, C.light); line(127, 90, 133, 64, 5, C.light); line(159, 96, 164, 76, 5, C.light)
  } else if (kind === 'staple') {
    oval(128, 159, 80, 47, C.green); oval(128, 140, 81, 26, C.white); oval(128, 123, 66, 36, C.white)
    for (const [x, y] of [[96, 113], [124, 101], [152, 123], [120, 132]]) line(x, y, x + 9, y + 2, 3, [224, 213, 184])
    line(170, 114, 218, 65, 5, C.brown); line(180, 119, 229, 70, 5, C.brown)
  } else {
    oval(128, 164, 94, 37, C.white)
    polygon([[68, 121], [109, 108], [166, 159], [186, 170], [157, 177], [112, 165], [80, 146]], C.red)
    line(70, 123, 59, 98, 10, C.green)
    polygon([[136, 110], [164, 90], [187, 126], [190, 149], [177, 156], [161, 145]], C.orange)
    line(161, 94, 153, 77, 8, C.green)
  }
  return art
}

let bytes = 0
for (const kind of ['vegetable', 'chicken', 'meat', 'soup', 'staple', 'spicy']) bytes += writePng(path.join(root, `assets/recipe-covers/fallback-${kind}.png`), cover(kind))
for (const active of [false, true]) {
  const art = canvas(81)
  const color = active ? [47, 111, 78] : [138, 138, 130]
  const points = [[23, 14], [58, 14], [58, 67], [40.5, 55], [23, 67], [23, 14]]
  if (active) art.polygon(points, color)
  else for (let i = 0; i < points.length - 1; i++) art.line(...points[i], ...points[i + 1], 4, color)
  bytes += writePng(path.join(root, `assets/tabbar/favorites${active ? '-active' : ''}.png`), art)
}
console.log(`已生成6张分类兜底图、2个收藏图标，共${bytes}字节`)
