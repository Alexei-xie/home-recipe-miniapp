const storage = require('../../utils/storage')
const community = require('../../utils/community')
const { MEAL_TYPES, CUISINES, HEALTH_TAGS, ALLERGENS } = require('../../data/recipes')

const ENERGY_LEVELS = [
  { value: 'unknown', label: '未设置' },
  { value: 'low', label: '低能量' },
  { value: 'medium', label: '中等能量' },
  { value: 'high', label: '高能量' }
]

function energyLevelLabel(value) {
  const option = ENERGY_LEVELS.find(item => item.value === value)
  return option ? option.label : '未设置'
}

function listToText(list) {
  return (list || []).map(item => `${item.name} ${item.amount || '适量'}`).join('\n')
}

function parseLines(text) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
}

function parseItems(text) {
  return parseLines(text).map(line => {
    const parts = line.split(/\s+/)
    return { name: parts.shift(), amount: parts.join(' ') || '适量' }
  })
}

Page({
  data: {
    isEdit: false,
    isBuiltinOverride: false,
    submitting: false,
    mealTypes: MEAL_TYPES,
    cuisines: CUISINES,
    healthTags: HEALTH_TAGS.filter(item => item !== '常见家常'),
    energyLevels: ENERGY_LEVELS,
    energyLevelLabel: '未设置',
    energyLevelIndex: 0,
    allergens: ALLERGENS,
    allergenOptions: ALLERGENS.map(name => ({ name, selected: false })),
    form: {
      id: '',
      createdAt: null,
      name: '',
      description: '',
      mealType: '家常热菜',
      cuisine: '家常菜',
      healthTag: '日常均衡',
      energyLevel: 'unknown',
      estimatedKcalPerServing: '',
      servings: '2',
      durationMinutes: '30',
      difficulty: '简单',
      ingredientsText: '',
      seasoningsText: '',
      steps: [{ id: 'draft_step_1', text: '' }],
      tipsText: '',
      allergens: [],
      allergensReviewed: false,
      healthEligible: false,
      videoUrl: '',
      tutorialSource: '',
      tutorialTitle: '',
      tutorialUrl: '',
      coverImage: '',
      coverEmoji: '🍽️'
    }
  },

  onLoad(options) {
    let recipe = null
    let isEdit = false
    let isBuiltinOverride = false
    if (options.id) {
      recipe = storage.getRecipe(options.id)
      isBuiltinOverride = Boolean(options.direct === '1' && recipe && recipe.source === 'builtin')
      isEdit = Boolean(recipe && recipe.source === 'custom' && !isBuiltinOverride)
    } else if (options.copy) {
      recipe = storage.getRecipe(options.copy)
    }
    const keepOriginalId = isEdit || isBuiltinOverride
    this.originalCoverImage = recipe && keepOriginalId ? recipe.coverImage || '' : ''
    if (recipe) {
      this.setData({
        isEdit,
        isBuiltinOverride,
        energyLevelLabel: energyLevelLabel(recipe.energyLevel || 'unknown'),
        energyLevelIndex: Math.max(0, ENERGY_LEVELS.findIndex(item => item.value === (recipe.energyLevel || 'unknown'))),
        form: {
          id: keepOriginalId ? recipe.id : '',
          createdAt: keepOriginalId ? recipe.createdAt : null,
          name: keepOriginalId ? recipe.name : `${recipe.name}（我的版本）`,
          description: recipe.description || '',
          mealType: recipe.mealType,
          cuisine: recipe.cuisine || '家常菜',
          healthTag: (recipe.healthTags || [])[0] || '日常均衡',
          energyLevel: recipe.energyLevel || 'unknown',
          estimatedKcalPerServing: recipe.estimatedKcalPerServing || '',
          servings: String(recipe.servings || 2),
          durationMinutes: String(recipe.durationMinutes || 30),
          difficulty: recipe.difficulty || '简单',
          ingredientsText: listToText(recipe.ingredients),
          seasoningsText: listToText(recipe.seasonings),
          steps: (recipe.steps || []).length
            ? recipe.steps.map((step, index) => ({
              id: step.id || `draft_step_${index + 1}`,
              text: step.text || ''
            }))
            : [{ id: 'draft_step_1', text: '' }],
          tipsText: (recipe.tips || []).join('\n'),
          allergens: (recipe.allergens || []).slice(),
          allergensReviewed: Boolean(recipe.allergensReviewed || recipe.source === 'builtin'),
          healthEligible: keepOriginalId ? Boolean(recipe.healthEligible) : false,
          videoUrl: recipe.videoUrl || '',
          tutorialSource: ((recipe.tutorialLinks || [])[0] || {}).source || '',
          tutorialTitle: ((recipe.tutorialLinks || [])[0] || {}).title || '',
          tutorialUrl: ((recipe.tutorialLinks || [])[0] || {}).url || '',
          coverImage: keepOriginalId ? recipe.coverImage || '' : '',
          coverEmoji: recipe.coverEmoji || '🍽️'
        }
      }, () => this.refreshAllergenOptions())
    } else {
      this.refreshAllergenOptions()
    }
    wx.setNavigationBarTitle({ title: isBuiltinOverride ? '修改内置菜谱' : (isEdit ? '编辑我的菜谱' : '新建我的菜谱') })
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  chooseMealType(event) {
    this.setData({ 'form.mealType': this.data.mealTypes[Number(event.detail.value)] })
  },

  chooseCuisine(event) {
    this.setData({ 'form.cuisine': this.data.cuisines[Number(event.detail.value)] })
  },

  chooseHealthTag(event) {
    this.setData({ 'form.healthTag': this.data.healthTags[Number(event.detail.value)] })
  },

  chooseEnergyLevel(event) {
    const option = this.data.energyLevels[Number(event.detail.value)]
    this.setData({
      'form.energyLevel': option.value,
      energyLevelLabel: option.label,
      energyLevelIndex: Number(event.detail.value)
    })
  },

  toggleAllergy(event) {
    const value = event.currentTarget.dataset.value
    const selected = this.data.form.allergens.slice()
    const index = selected.indexOf(value)
    if (index >= 0) selected.splice(index, 1)
    else selected.push(value)
    this.setData({ 'form.allergens': selected }, () => this.refreshAllergenOptions())
  },

  refreshAllergenOptions() {
    this.setData({
      allergenOptions: ALLERGENS.map(name => ({
        name,
        selected: this.data.form.allergens.includes(name)
      }))
    })
  },

  toggleAllergensReviewed(event) {
    this.setData({ 'form.allergensReviewed': event.detail.value })
  },

  toggleHealthEligible(event) {
    this.setData({ 'form.healthEligible': event.detail.value })
  },

  chooseCoverImage() {
    const handleFile = (tempFilePath, size) => {
      if (!tempFilePath) return
      if (size && size > 4 * 1024 * 1024) {
        wx.showToast({ title: '请选择小于 4MB 的图片', icon: 'none' })
        return
      }
      this.pendingCoverPath = tempFilePath
      this.setData({ 'form.coverImage': tempFilePath })
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: result => {
          const file = result.tempFiles && result.tempFiles[0]
          if (file) handleFile(file.tempFilePath, file.size)
        }
      })
    } else {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: result => handleFile(result.tempFilePaths[0], 0)
      })
    }
  },

  previewCover() {
    if (this.data.form.coverImage) {
      wx.previewImage({
        current: this.data.form.coverImage,
        urls: [this.data.form.coverImage]
      })
    }
  },

  removeCoverImage() {
    this.pendingCoverPath = ''
    this.setData({ 'form.coverImage': '' })
  },

  onStepInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`form.steps[${index}].text`]: event.detail.value })
  },

  addStep() {
    const steps = this.data.form.steps.slice()
    steps.push({ id: storage.generateId('draft_step'), text: '' })
    this.setData({ 'form.steps': steps })
  },

  deleteStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const steps = this.data.form.steps.slice()
    steps.splice(index, 1)
    if (!steps.length) steps.push({ id: storage.generateId('draft_step'), text: '' })
    this.setData({ 'form.steps': steps })
  },

  moveStep(event) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const target = index + direction
    const steps = this.data.form.steps.slice()
    if (target < 0 || target >= steps.length) return
    const current = steps[index]
    steps[index] = steps[target]
    steps[target] = current
    this.setData({ 'form.steps': steps })
  },

  buildRecipe() {
    const form = this.data.form
    const ingredients = parseItems(form.ingredientsText)
    const validSteps = form.steps
      .map(step => ({ id: step.id, text: String(step.text || '').trim() }))
      .filter(step => step.text)
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写菜名', icon: 'none' })
      return null
    }
    if (!ingredients.length) {
      wx.showToast({ title: '请至少填写一种食材', icon: 'none' })
      return null
    }
    if (!validSteps.length) {
      wx.showToast({ title: '请至少填写一个步骤', icon: 'none' })
      return null
    }
    if (form.healthEligible && (
      form.energyLevel === 'unknown' ||
      !Number(form.estimatedKcalPerServing) ||
      !form.allergensReviewed
    )) {
      wx.showToast({ title: '参与健康推荐需补全能量、热量并确认过敏原', icon: 'none', duration: 3500 })
      return null
    }

    const time = Date.now()
    const tutorialUrl = form.tutorialUrl.trim()
    if (tutorialUrl && !/^https:\/\//i.test(tutorialUrl)) {
      wx.showToast({ title: '教程链接需以 https:// 开头', icon: 'none' })
      return null
    }
    let coverImage = form.coverImage || ''
    if (this.pendingCoverPath) {
      coverImage = storage.saveRecipeImageFile(this.pendingCoverPath)
      if (!coverImage) return null
    }
    const poolByTag = {
      轻盈低卡: '轻盈低卡',
      日常均衡: '均衡健康',
      增能均衡: '均衡健康',
      轻享解馋: '轻享解馋',
      放纵高热量: '放纵高热量',
      零食加餐: '零食加餐'
    }
    return {
      id: form.id || storage.generateId('custom'),
      source: this.data.isBuiltinOverride ? 'builtin' : 'custom',
      name: form.name.trim(),
      description: form.description.trim(),
      mealType: form.mealType,
      cuisine: form.cuisine || '家常菜',
      healthTags: [form.healthTag, '常见家常'],
      drawPools: ['家常快手', poolByTag[form.healthTag]].filter(Boolean),
      healthEligible: form.healthEligible,
      energyLevel: form.energyLevel,
      estimatedKcalPerServing: Number(form.estimatedKcalPerServing) || null,
      servings: Number(form.servings) || 2,
      durationMinutes: Number(form.durationMinutes) || 30,
      difficulty: form.difficulty,
      ingredients,
      seasonings: parseItems(form.seasoningsText),
      allergens: form.allergens,
      allergensReviewed: form.allergensReviewed,
      ingredientKeywords: ingredients.map(item => item.name),
      steps: validSteps.map((step, index) => ({
        id: step.id || storage.generateId('step'),
        order: index + 1,
        text: step.text
      })),
      tips: parseLines(form.tipsText),
      coverImage,
      coverEmoji: form.coverEmoji.trim() || '🍽️',
      videoUrl: form.videoUrl.trim(),
      tutorialLinks: tutorialUrl ? [{
        source: form.tutorialSource.trim() || '外部教程',
        title: form.tutorialTitle.trim() || `${form.name.trim()}做法参考`,
        url: tutorialUrl
      }] : [],
      createdAt: form.createdAt || time,
      updatedAt: time
    }
  },

  persistRecipe(recipe) {
    if (this.data.isBuiltinOverride) storage.saveBuiltinRecipeOverride(recipe)
    else storage.saveCustomRecipe(recipe)
    if (this.originalCoverImage && this.originalCoverImage !== recipe.coverImage) {
      storage.deleteUserFile(this.originalCoverImage)
    }
    this.originalCoverImage = recipe.coverImage
    this.pendingCoverPath = ''
    return recipe
  },

  save() {
    const recipe = this.buildRecipe()
    if (!recipe) return
    this.persistRecipe(recipe)
    wx.showToast({ title: '菜谱已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 500)
  },

  submitForReview() {
    if (this.data.submitting) return
    if (this.data.isBuiltinOverride) {
      wx.showToast({ title: '请先复制为我的菜谱再投稿', icon: 'none' })
      return
    }
    if (!community.isAvailable()) {
      wx.showModal({
        title: '暂时无法投稿',
        content: '当前微信版本或云开发环境不可用，请更新微信后重新进入小程序。菜谱仍可保存在本机。',
        showCancel: false
      })
      return
    }
    wx.showModal({
      title: '提交公开审核？',
      content: '菜谱文字、昵称和所选封面将上传云端审核；通过后其他用户可查看。提交即表示你确认文字、图片和链接可公开发布。',
      confirmText: '确认提交',
      success: result => {
        if (!result.confirm) return
        const recipe = this.buildRecipe()
        if (!recipe) return
        if (recipe.steps.length < 2) {
          wx.showToast({ title: '投稿至少需要两个步骤', icon: 'none' })
          return
        }
        if (!recipe.allergensReviewed) {
          wx.showToast({ title: '投稿前请核对主要过敏原', icon: 'none' })
          return
        }
        this.persistRecipe(recipe)
        this.setData({ submitting: true })
        wx.showLoading({ title: '正在提交', mask: true })
        community.submitRecipe(recipe, storage.getProfile()).then(() => {
          wx.hideLoading()
          this.setData({ submitting: false })
          wx.showToast({ title: '已提交审核', icon: 'success' })
          setTimeout(() => wx.redirectTo({ url: '/features/notifications/notifications' }), 600)
        }).catch(error => {
          wx.hideLoading()
          this.setData({ submitting: false })
          wx.showModal({
            title: '提交失败',
            content: `${error.message || '云端服务暂不可用'}。菜谱已保存在本机，可以稍后再次提交。`,
            showCancel: false
          })
        })
      },
      fail: error => {
        console.error('[recipe-editor] 无法打开投稿确认弹窗', error)
        wx.showToast({ title: '无法打开确认窗口，请重试', icon: 'none' })
      }
    })
  }
})
