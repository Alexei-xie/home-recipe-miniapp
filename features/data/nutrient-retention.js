// 分包营养分析使用：按 USDA Table of Nutrient Retention Factors Release 6 的烹饪方式范围整理的通用保留率。
// 这里用于家庭菜谱估算；实际保留率仍会随食材、温度、时间和汤汁是否食用而变化。
const RETENTION_FACTORS = {
  raw: { label: '不加热/冷制', sodium: 1, potassium: 1, calcium: 1, iron: 1, vitaminA: 1, vitaminC: 1, vitaminE: 1, folate: 1 },
  steam: { label: '蒸制', sodium: .95, potassium: .9, calcium: .95, iron: .95, vitaminA: .9, vitaminC: .8, vitaminE: .9, folate: .85 },
  soup: { label: '汤羹（汤汁食用）', sodium: .98, potassium: .92, calcium: .97, iron: .97, vitaminA: .9, vitaminC: .75, vitaminE: .9, folate: .8 },
  boil: { label: '水煮/焯煮', sodium: .9, potassium: .75, calcium: .9, iron: .9, vitaminA: .85, vitaminC: .55, vitaminE: .85, folate: .6 },
  stirFry: { label: '炒制', sodium: .98, potassium: .9, calcium: .95, iron: .95, vitaminA: .9, vitaminC: .75, vitaminE: .9, folate: .8 },
  fry: { label: '煎炸', sodium: .95, potassium: .85, calcium: .95, iron: .95, vitaminA: .85, vitaminC: .7, vitaminE: .8, folate: .75 },
  bake: { label: '烘烤', sodium: .98, potassium: .9, calcium: .97, iron: .97, vitaminA: .9, vitaminC: .75, vitaminE: .85, folate: .8 }
}

module.exports = { RETENTION_FACTORS }
