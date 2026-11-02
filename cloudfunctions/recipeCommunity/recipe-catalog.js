// 与云函数共享的纯分类规则；build-recipe-index.js 会复制到云函数部署目录。
const DEFAULT_CUISINES = ['家常菜', '东北菜', '湘菜', '川菜', '傣菜']
const DEFAULT_MEAL_TYPES = ['家常热菜', '凉菜', '汤羹', '主食', '早餐', '小吃甜品', '饮品']
const FIELDS = ['cuisines', 'mealTypes']

function defaultCatalog() {
  return {
    revision: 0, updatedAt: 0,
    cuisines: DEFAULT_CUISINES.slice(), mealTypes: DEFAULT_MEAL_TYPES.slice(),
    redirects: { cuisines: {}, mealTypes: {} }, assignments: {}
  }
}

function validName(value) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 12 &&
    !['__proto__', 'constructor', 'prototype'].includes(value) && !/[\u0000-\u001f<>]/.test(value)
}

function normalizeCatalog(raw) {
  const result = defaultCatalog()
  if (!raw || typeof raw !== 'object') return result
  result.revision = Math.max(0, Number(raw.revision) || 0)
  result.updatedAt = Math.max(0, Number(raw.updatedAt) || 0)
  FIELDS.forEach(field => {
    if (Array.isArray(raw[field]) && raw[field].length && raw[field].every(validName)) result[field] = [...new Set(raw[field])].slice(0, 30)
    const aliases = raw.redirects && raw.redirects[field]
    if (aliases && typeof aliases === 'object') {
      Object.keys(aliases).forEach(name => {
        if (validName(name) && validName(aliases[name]) && name !== aliases[name]) result.redirects[field][name] = aliases[name]
      })
    }
  })
  if (raw.assignments && typeof raw.assignments === 'object') {
    Object.keys(raw.assignments).forEach(id => {
      const entry = raw.assignments[id]
      if (/^[a-zA-Z0-9_-]{1,80}$/.test(id) && entry && validName(entry.cuisine) && validName(entry.mealType)) {
        result.assignments[id] = { cuisine: entry.cuisine, mealType: entry.mealType, updatedAt: Number(entry.updatedAt) || 0 }
      }
    })
  }
  return result
}

function resolveCategory(value, field, catalog) {
  const names = catalog[field]
  let name = String(value || '')
  const seen = new Set()
  while (!names.includes(name) && !seen.has(name) && catalog.redirects[field][name]) {
    seen.add(name)
    name = catalog.redirects[field][name]
  }
  return names.includes(name) ? name : names[0]
}

function canonicalMealType(value, catalog) {
  if (DEFAULT_MEAL_TYPES.includes(value)) return value
  return DEFAULT_MEAL_TYPES.find(name => resolveCategory(name, 'mealTypes', catalog) === value &&
    (name === value || catalog.redirects.mealTypes[name])) || value
}

function applyRecipeCategories(recipe, catalog) {
  // 私有自建和用户直接编辑的本机副本不接受针对公共菜谱的单项覆盖。
  const assignment = recipe.source !== 'custom' && !recipe.isLocalOverride &&
    Object.prototype.hasOwnProperty.call(catalog.assignments, recipe.id) && catalog.assignments[recipe.id]
  const cuisine = resolveCategory(assignment ? assignment.cuisine : recipe.cuisine, 'cuisines', catalog)
  const mealType = resolveCategory(assignment ? assignment.mealType : recipe.mealType, 'mealTypes', catalog)
  const originalType = assignment ? assignment.mealType : recipe.mealType
  const canonical = !assignment && recipe.canonicalMealType ? recipe.canonicalMealType : canonicalMealType(originalType, catalog)
  if (cuisine === recipe.cuisine && mealType === recipe.mealType && canonical === (recipe.canonicalMealType || recipe.mealType)) return recipe
  const result = Object.assign({}, recipe, { cuisine, mealType, canonicalMealType: canonical })
  if (canonical !== (recipe.canonicalMealType || recipe.mealType) && DEFAULT_MEAL_TYPES.includes(canonical)) delete result.mealRoles
  if (assignment) result.updatedAt = Math.max(Number(recipe.updatedAt) || 0, assignment.updatedAt)
  return result
}

function catalogError(message) {
  const error = new Error(message)
  error.code = 'INVALID_CATEGORY'
  return error
}

function changeCatalog(raw, event, now = Date.now()) {
  const catalog = normalizeCatalog(raw)
  if (Number(event.expectedRevision) !== catalog.revision) {
    const error = new Error('分类已被其他管理员更新，请刷新后重试')
    error.code = 'CATALOG_CONFLICT'
    throw error
  }
  if (event.operation === 'assign') {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(event.recipeId || '') || !catalog.cuisines.includes(event.cuisine) || !catalog.mealTypes.includes(event.mealType)) throw catalogError('请选择有效的菜系和餐食分类')
    catalog.assignments[event.recipeId] = { cuisine: event.cuisine, mealType: event.mealType, updatedAt: now }
  } else {
    const field = event.field
    if (!FIELDS.includes(field)) throw catalogError('分类类型无效')
    const names = catalog[field]
    const name = event.name
    const index = names.indexOf(name)
    if (event.operation === 'add') {
      if (!validName(name)) throw catalogError('分类名称需为 1–12 个字符')
      if (names.includes(name)) throw catalogError('该分类已经存在')
      if (names.length >= 30) throw catalogError('每组最多支持 30 个分类')
      if (catalog.redirects[field][name]) throw catalogError('该名称已用于历史分类，请使用其他名称')
      names.push(name)
    } else {
      if (index < 0) throw catalogError('分类不存在，请刷新后重试')
      if (event.operation === 'move') {
        const next = index + Number(event.direction)
        if (![-1, 1].includes(Number(event.direction)) || next < 0 || next >= names.length) throw catalogError('无法继续移动此分类')
        ;[names[index], names[next]] = [names[next], names[index]]
      } else if (['rename', 'merge', 'delete'].includes(event.operation)) {
        if (event.operation === 'delete' && names.length === 1) throw catalogError('每组至少保留一个分类')
        const target = event.target
        if (!validName(target) || target === name) throw catalogError('请输入不同的有效分类名称')
        if (event.operation === 'rename' && names.includes(target)) throw catalogError('目标分类已存在，请使用合并')
        if (event.operation !== 'rename' && !names.includes(target)) throw catalogError('请选择有效的接收分类')
        const redirects = catalog.redirects[field]
        Object.keys(redirects).forEach(alias => {
          if (resolveCategory(alias, field, catalog) === name) redirects[alias] = target
        })
        delete redirects[target]
        redirects[name] = target
        if (event.operation === 'rename') names[index] = target
        else names.splice(index, 1)
      } else throw catalogError('不支持的分类操作')
    }
  }
  catalog.revision += 1
  catalog.updatedAt = now
  return catalog
}

module.exports = { DEFAULT_CUISINES, DEFAULT_MEAL_TYPES, defaultCatalog, normalizeCatalog, resolveCategory, applyRecipeCategories, changeCatalog }
