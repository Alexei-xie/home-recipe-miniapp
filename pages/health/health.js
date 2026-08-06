const storage = require('../../utils/storage')
const health = require('../../utils/health')
const imageService = require('../../utils/image-service')

function withRecipeCover(recipe) {
  if (!recipe) return recipe
  const coverImage = imageService.getRecipeInitialImage(recipe)
  return Object.assign({}, recipe, { coverImage, coverEmoji: recipe.coverEmoji || '🍽️' })
}

function todayString() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    heightInput: '',
    weightInput: '',
    recordDate: todayString(),
    maxDate: todayString(),
    adultConfirmedDraft: false,
    notPregnantDraft: false,
    understoodDraft: false,
    profileConfirmed: false,
    adultMode: true,
    populationLabel: '普通成人',
    specialGuidanceConfirmed: false,
    specialAssessment: null,
    conditionGuidance: [],
    bmiInfo: null,
    draftBmiInfo: null,
    latestWeight: null,
    weightChange: null,
    weightChangeText: '',
    records: [],
    trendDays: 30,
    trendRecords: [],
    recommendationVisible: false,
    timeRecommendation: null,
    recommendationRotation: 0
  },

  onShow() {
    this.loadHealthData()
  },

  onReady() {
    this.canvasReady = true
    this.drawTrend()
  },

  loadHealthData() {
    const profile = storage.getProfile()
    this.currentProfile = profile
    const records = storage.getWeightRecords()
    const latest = health.getLatestWeight(records)
    const assessment = health.buildSpecialPopulationAssessment(profile, latest)
    const adultMode = assessment.type === 'adult'
    const bmi = adultMode ? assessment.bmi : null
    const category = adultMode ? assessment.adult : null
    const previous = records.length > 1 ? records[1] : null
    const change = latest && previous ? latest.weightKg - previous.weightKg : null
    this.setData({
      heightInput: profile.heightCm === null ? '' : String(profile.heightCm),
      weightInput: '',
      profileConfirmed: profile.adultConfirmed,
      adultMode,
      populationLabel: assessment.label,
      specialGuidanceConfirmed: profile.specialGuidanceConfirmed,
      specialAssessment: assessment,
      conditionGuidance: assessment.conditions || [],
      adultConfirmedDraft: profile.adultConfirmed,
      notPregnantDraft: profile.adultConfirmed,
      understoodDraft: profile.adultConfirmed,
      latestWeight: latest,
      draftBmiInfo: null,
      bmiInfo: category ? {
        value: bmi.toFixed(1),
        label: category.label,
        key: category.key,
        direction: category.direction
      } : null,
      weightChange: change,
      weightChangeText: change === null ? '' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`,
      records
    }, () => this.updateTrend())
  },

  onHeightInput(event) {
    this.setData({ heightInput: event.detail.value }, () => this.updateDraftBmi())
  },

  onWeightInput(event) {
    this.setData({ weightInput: event.detail.value }, () => this.updateDraftBmi())
  },

  updateDraftBmi() {
    const heightCm = health.parseMeasurement(this.data.heightInput)
    const weightKg = health.parseMeasurement(this.data.weightInput)
    const bmi = health.calculateBMI(heightCm, weightKg)
    const profile = this.currentProfile || storage.getProfile()
    const category = (profile.populationType || 'adult') === 'child'
      ? health.classifyChildBMI(bmi, profile.birthDate, profile.biologicalSex)
      : (profile.populationType || 'adult') === 'adult'
        ? health.classifyAdultBMI(bmi)
        : null
    this.setData({
      draftBmiInfo: category ? {
        value: bmi.toFixed(1),
        label: category.label
      } : null
    })
  },

  onDateChange(event) {
    this.setData({ recordDate: event.detail.value })
  },

  toggleConfirm(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },

  saveRecord(event) {
    const formValue = event && event.detail && event.detail.value
      ? event.detail.value
      : {}
    const formHeight = String(formValue.heightCm || '').trim()
    const formWeight = String(formValue.weightKg || '').trim()
    const heightValue = formHeight || this.data.heightInput
    const weightValue = formWeight || this.data.weightInput
    const heightCm = health.parseMeasurement(heightValue)
    const weightKg = health.parseMeasurement(weightValue)
    const profile = this.currentProfile || storage.getProfile()
    const type = profile.populationType || 'adult'
    if (type === 'adult' && (!this.data.adultConfirmedDraft || !this.data.notPregnantDraft || !this.data.understoodDraft)) {
      wx.showToast({ title: '请先确认成人适用条件', icon: 'none' })
      return
    }
    if (type !== 'adult' && !profile.specialGuidanceConfirmed) {
      wx.showToast({ title: '请先设置人群并确认使用边界', icon: 'none' })
      return
    }
    if (heightCm === null || heightCm < 80 || heightCm > 250) {
      wx.showToast({ title: '身高请输入 80–250 cm', icon: 'none' })
      return
    }
    const minWeight = type === 'child' ? 10 : 20
    if (weightKg === null || weightKg < minWeight || weightKg > 300) {
      wx.showToast({ title: `体重请输入 ${minWeight}–300 kg`, icon: 'none' })
      return
    }
    if (type === 'child' && !health.classifyChildBMI(health.calculateBMI(heightCm, weightKg), profile.birthDate, profile.biologicalSex)) {
      wx.showToast({ title: '儿童信息不完整或年龄不适用', icon: 'none' })
      return
    }
    if (type === 'pregnant') {
      if (heightCm < 140 || !profile.prePregnancyWeightKg || profile.prePregnancyWeightKg > 125 || !profile.gestationalWeek || !profile.singletonPregnancyConfirmed) {
        wx.showToast({ title: '当前情况不适用孕期参考范围', icon: 'none' })
        return
      }
    }
    const roundedHeight = Math.round(heightCm * 10) / 10
    const roundedWeight = Math.round(weightKg * 10) / 10
    storage.saveProfile({
      heightCm: roundedHeight,
      adultConfirmed: type === 'adult',
      healthRecommendationEnabled: true
    })
    storage.saveWeightRecord(this.data.recordDate, roundedWeight)
    wx.showToast({ title: '记录已保存', icon: 'success' })
    this.loadHealthData()
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条体重记录？',
      content: '删除后将使用下一条最新记录重新计算 BMI。',
      success: result => {
        if (result.confirm) {
          storage.deleteWeightRecord(id)
          this.loadHealthData()
        }
      }
    })
  },

  changeTrend(event) {
    this.setData({ trendDays: Number(event.currentTarget.dataset.days) }, () => this.updateTrend())
  },

  updateTrend() {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - this.data.trendDays + 1)
    const trendRecords = this.data.records
      .filter(item => new Date(`${item.date}T00:00:00`) >= cutoff)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    this.setData({ trendRecords }, () => this.drawTrend())
  },

  drawTrend() {
    if (!this.canvasReady || this.data.trendRecords.length < 2) return
    const info = wx.getSystemInfoSync()
    const width = Math.max(280, info.windowWidth - 56)
    const height = 150
    const padding = 28
    const records = this.data.trendRecords
    const values = records.map(item => item.weightKg)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = Math.max(max - min, 1)
    const context = wx.createCanvasContext('trendCanvas', this)

    context.clearRect(0, 0, width, height)
    context.setStrokeStyle('#dfe7e1')
    context.setLineWidth(1)
    context.beginPath()
    context.moveTo(padding, height - padding)
    context.lineTo(width - padding, height - padding)
    context.stroke()

    context.setStrokeStyle('#2f6f4e')
    context.setLineWidth(3)
    context.setLineJoin('round')
    context.beginPath()
    records.forEach((item, index) => {
      const x = padding + (width - padding * 2) * index / (records.length - 1)
      const y = height - padding - (item.weightKg - min) / range * (height - padding * 2)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()

    context.setFillStyle('#d67a2d')
    records.forEach((item, index) => {
      const x = padding + (width - padding * 2) * index / (records.length - 1)
      const y = height - padding - (item.weightKg - min) / range * (height - padding * 2)
      context.beginPath()
      context.arc(x, y, 4, 0, Math.PI * 2)
      context.fill()
    })
    context.draw()
  },

  openBmiInfo() {
    wx.navigateTo({ url: '/features/bmi-info/bmi-info' })
  },

  openSpecialHealth() {
    wx.navigateTo({ url: '/features/special-health/special-health' })
  },

  openTimeRecommendation() {
    this.imageRetryCounts = Object.create(null)
    this.showTimeRecommendation(0)
  },

  refreshTimeRecommendation() {
    this.showTimeRecommendation(this.data.recommendationRotation + 1)
  },

  showTimeRecommendation(rotation) {
    const profile = storage.getProfile()
    if ((profile.populationType || 'adult') !== 'adult') {
      wx.showToast({ title: '特殊人群暂不生成自动食谱套餐', icon: 'none' })
      return
    }
    if (health.getConditionGuidance(profile.healthConditions).length) {
      wx.showToast({ title: '已选择健康状况，请遵循专业意见', icon: 'none' })
      return
    }
    const latestWeight = health.getLatestWeight(storage.getWeightRecords())
    const recommendation = health.buildTimeBasedRecommendation(
      storage.getAllRecipes(),
      profile,
      latestWeight,
      new Date(),
      rotation
    )
    if (!recommendation.category || !recommendation.items.length) {
      wx.showToast({ title: '请先完成成人确认与健康记录', icon: 'none' })
      return
    }
    const items = recommendation.items.map(item => Object.assign({}, item, {
      recipe: withRecipeCover(item.recipe)
    }))
    this.setData({
      recommendationVisible: true,
      recommendationRotation: rotation,
      timeRecommendation: {
        bmiValue: recommendation.bmi.toFixed(1),
        bmiLabel: recommendation.category.label,
        direction: recommendation.category.direction,
        periodTitle: recommendation.period.title,
        greeting: recommendation.period.greeting,
        // BMI 时段推荐也使用食谱的真实本地封面，和首页、详情页保持一致。
        items
      }
    }, () => {
      imageService.hydrateRecipeCovers(recommendation.items.map(item => item.recipe), null, 3).then(hydratedRecipes => {
        const patch = {}
        hydratedRecipes.forEach((hydrated, index) => {
          const current = this.data.timeRecommendation && this.data.timeRecommendation.items[index]
          if (current && current.recipe.id === hydrated.id) {
            patch[`timeRecommendation.items[${index}].recipe.coverImage`] = hydrated.coverImage
          }
        })
        if (Object.keys(patch).length) this.setData(patch)
      })
    })
  },

  closeTimeRecommendation() {
    this.setData({ recommendationVisible: false })
  },

  stopModalPropagation() {},

  onRecommendationImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.timeRecommendation || !this.data.timeRecommendation.items[index]) return
    const recipeId = event.currentTarget.dataset.id
    const failedUrl = event.currentTarget.dataset.src
    const dataPath = `timeRecommendation.items[${index}].recipe.coverImage`
    const recipe = storage.getRecipe(recipeId)
    if (!recipe) return this.setData({ [dataPath]: '' })
    this.imageRetryCounts = this.imageRetryCounts || Object.create(null)
    const retryKey = `recommendation:${recipeId}`
    const fallback = imageService.getRecipeImageFallback(recipe)
    if (this.imageRetryCounts[retryKey]) {
      this.setData({ [dataPath]: fallback && fallback !== failedUrl ? fallback : '' })
      return
    }
    this.imageRetryCounts[retryKey] = 1
    this.setData({ [dataPath]: '' }, () => {
      imageService.recoverRecipeImage(recipe, failedUrl).then(url => {
        const current = this.data.timeRecommendation && this.data.timeRecommendation.items[index]
        if (current && current.recipe.id === recipeId && url) this.setData({ [dataPath]: url })
      })
    })
  },

  openRecommendedRecipe(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    this.closeTimeRecommendation()
    wx.navigateTo({ url: `/features/detail/detail?id=${id}` })
  },

  addTimeRecommendationToPlan() {
    const items = this.data.timeRecommendation && this.data.timeRecommendation.items || []
    if (!items.length) return
    items.forEach(item => storage.addRecipeToMealPlan(item.recipe.id))
    wx.showToast({ title: '套餐已加入今日菜单', icon: 'success' })
  }
})
