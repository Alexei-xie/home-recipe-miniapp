const storage = require('../../utils/storage')
const health = require('../../utils/health')
const imageService = require('../../utils/image-service')
const share = require('../../utils/share')

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

function resolveMeasurement(formValue, liveValue) {
  const candidates = [formValue, liveValue]
  for (const value of candidates) {
    const parsed = health.parseMeasurement(value)
    if (parsed !== null) return parsed
  }
  return null
}

Page({
  data: {
    heightInput: '',
    weightInput: '',
    recordDate: todayString(),
    maxDate: todayString(),
    adultConfirmedDraft: false,
    notPregnantDraft: false,
    adultMode: true,
    populationLabel: '普通成人',
    specialGuidanceConfirmed: false,
    specialAssessment: null,
    conditionGuidance: [],
    bmiInfo: null,
    bmiEmptyTitle: '尚未计算 BMI',
    bmiEmptyText: '保存人群信息、身高和体重后即可查看适用的筛查参考。',
    draftBmiInfo: null,
    latestWeight: null,
    weightChange: null,
    weightChangeText: '',
    records: [],
    trendDays: 30,
    trendRecords: [],
    recommendationVisible: false,
    timeRecommendation: null,
    recommendationRotation: 0,
    formError: ''
  },

  onShow() {
    share.enableShareMenu()
    this.loadHealthData()
  },

  onShareAppMessage() {
    return share.appMessage({
      title: '记录 BMI，获取日常饮食搭配建议',
      path: '/pages/health/health'
    })
  },

  onShareTimeline() {
    return share.timeline({ title: '今日食签｜BMI 记录与日常饮食建议' })
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
    const adultBmiPending = adultMode && bmi !== null && !profile.adultConfirmed
    this.setData({
      heightInput: profile.heightCm === null ? '' : String(profile.heightCm),
      weightInput: '',
      adultMode,
      populationLabel: assessment.label,
      specialGuidanceConfirmed: profile.specialGuidanceConfirmed,
      specialAssessment: assessment,
      conditionGuidance: assessment.conditions || [],
      adultConfirmedDraft: Boolean(profile.adultAgeConfirmed),
      notPregnantDraft: Boolean(profile.notPregnantConfirmed),
      latestWeight: latest,
      draftBmiInfo: null,
      formError: '',
      bmiInfo: category ? {
        value: bmi.toFixed(1),
        label: category.label,
        key: category.key,
        direction: category.direction
      } : null,
      bmiEmptyTitle: adultBmiPending ? '记录已保存，未启用成人分级' : '尚未计算 BMI',
      bmiEmptyText: adultBmiPending
        ? '普通成人分级需要同时满足“已满 18 周岁”和“当前不处于孕期”。你仍可继续记录体重趋势。'
        : '保存人群信息、身高和体重后即可查看适用的筛查参考。',
      weightChange: change,
      weightChangeText: change === null ? '' : `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`,
      records
    }, () => this.updateTrend())
  },

  onHeightInput(event) {
    const value = event && event.detail ? String(event.detail.value || '') : ''
    this.setData({ heightInput: value, formError: '' }, () => this.updateDraftBmi())
  },

  onWeightInput(event) {
    const value = event && event.detail ? String(event.detail.value || '') : ''
    this.setData({ weightInput: value, formError: '' }, () => this.updateDraftBmi())
  },

  updateDraftBmi() {
    const heightCm = health.parseMeasurement(this.data.heightInput)
    const weightKg = health.parseMeasurement(this.data.weightInput)
    const bmi = health.calculateBMI(heightCm, weightKg)
    const profile = this.currentProfile || storage.getProfile()
    const adultEligible = this.data.adultConfirmedDraft && this.data.notPregnantDraft
    const category = (profile.populationType || 'adult') === 'child'
      ? health.classifyChildBMI(bmi, profile.birthDate, profile.biologicalSex)
      : (profile.populationType || 'adult') === 'adult'
        ? (adultEligible ? health.classifyAdultBMI(bmi) : null)
        : null
    this.setData({
      draftBmiInfo: bmi === null ? null : {
        value: bmi.toFixed(1),
        label: category ? category.label : '仅记录数值，未启用成人分级'
      }
    })
  },

  onDateChange(event) {
    this.setData({ recordDate: event.detail.value })
  },

  toggleConfirm(event) {
    this.setData({
      [event.currentTarget.dataset.field]: Boolean(event.detail.value),
      formError: ''
    }, () => this.updateDraftBmi())
  },

  showRecordError(message) {
    this.setData({ formError: message })
    wx.showToast({ title: message, icon: 'none', duration: 2500 })
  },

  saveRecord(event) {
    const formValue = event && event.detail && event.detail.value
      ? event.detail.value
      : {}
    const formHeight = String(formValue.heightCm || '').trim()
    const formWeight = String(formValue.weightKg || '').trim()
    // 真机上点击提交与输入框失焦的时序并不完全一致：优先解析 form 值，
    // form 值异常时再回退到 bindinput 持续保存的页面值。
    const heightCm = resolveMeasurement(formHeight, this.data.heightInput)
    const weightKg = resolveMeasurement(formWeight, this.data.weightInput)
    const profile = this.currentProfile || storage.getProfile()
    const type = profile.populationType || 'adult'
    const adultEligible = type === 'adult' && this.data.adultConfirmedDraft && this.data.notPregnantDraft
    if (heightCm === null || heightCm < 80 || heightCm > 250) {
      return this.showRecordError('请输入 80–250 cm 的有效身高')
    }
    const minWeight = type === 'child' ? 10 : 20
    if (weightKg === null || weightKg < minWeight || weightKg > 300) {
      return this.showRecordError(`请输入 ${minWeight}–300 kg 的有效体重`)
    }
    if (type !== 'adult' && !profile.specialGuidanceConfirmed) {
      return this.showRecordError('请先设置人群并确认使用边界')
    }
    if (type === 'child' && !health.classifyChildBMI(health.calculateBMI(heightCm, weightKg), profile.birthDate, profile.biologicalSex)) {
      return this.showRecordError('儿童信息不完整或年龄不适用')
    }
    if (type === 'pregnant') {
      if (heightCm < 140 || !profile.prePregnancyWeightKg || profile.prePregnancyWeightKg > 125 || !profile.gestationalWeek || !profile.singletonPregnancyConfirmed) {
        return this.showRecordError('当前情况不适用孕期参考范围')
      }
    }
    const roundedHeight = Math.round(heightCm * 10) / 10
    const roundedWeight = Math.round(weightKg * 10) / 10
    try { storage.saveHealthRecord({
      heightCm: roundedHeight,
      adultAgeConfirmed: type === 'adult' && this.data.adultConfirmedDraft,
      notPregnantConfirmed: type === 'adult' && this.data.notPregnantDraft,
      adultConfirmed: adultEligible,
      healthRecommendationEnabled: true
    }, this.data.recordDate, roundedWeight) } catch (error) {
      return this.showRecordError(error.message)
    }
    this.setData({ formError: '' })
    wx.showToast({
      title: type === 'adult' && !adultEligible ? '已保存，未启用成人分级' : '记录已保存',
      icon: type === 'adult' && !adultEligible ? 'none' : 'success',
      duration: 2500
    })
    this.loadHealthData()
  },

  deleteRecord(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条体重记录？',
      content: '删除后将使用下一条最新记录重新计算 BMI。',
      success: result => {
        if (result.confirm) {
          try { storage.deleteWeightRecord(id) } catch (error) { return this.showRecordError(error.message) }
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
