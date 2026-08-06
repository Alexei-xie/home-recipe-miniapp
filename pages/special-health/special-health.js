const storage = require('../../utils/storage')
const health = require('../../utils/health')

const POPULATION_OPTIONS = [
  { key: 'adult', icon: '🧑', label: '普通成人', help: '18 岁及以上、当前未怀孕' },
  { key: 'child', icon: '🌱', label: '儿童青少年', help: '仅支持 6–17 岁超重与肥胖筛查' },
  { key: 'pregnant', icon: '🤰', label: '单胎妊娠期', help: '按孕前 BMI 查看孕期增重参考' },
  { key: 'postpartum', icon: '🤱', label: '产后 / 哺乳期', help: '不使用普通成人 BMI 自动减重推荐' }
]

const CONDITION_OPTIONS = [
  { key: 'hypertension', label: '高血压' },
  { key: 'hyperglycemia', label: '高血糖 / 糖尿病' },
  { key: 'hyperlipidemia', label: '高脂血症' },
  { key: 'hyperuricemia', label: '高尿酸 / 痛风' },
  { key: 'fattyLiver', label: '脂肪肝（医生已诊断）' },
  { key: 'kidneyDisease', label: '慢性肾病' },
  { key: 'eatingDisorder', label: '进食障碍风险' },
  { key: 'gestationalDiabetes', label: '妊娠期糖尿病', pregnancyOnly: true }
]

function todayString() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

Page({
  data: {
    populationType: 'adult',
    populationOptions: [],
    birthDate: '',
    maxBirthDate: todayString(),
    biologicalSex: '',
    prePregnancyWeightInput: '',
    gestationalWeekInput: '',
    singletonPregnancyConfirmed: false,
    specialGuidanceConfirmed: false,
    conditionOptions: [],
    guidanceItems: [],
    isChild: false,
    isPregnant: false,
    isPostpartum: false
  },

  onShow() {
    const profile = storage.getProfile()
    this.setData({
      populationType: profile.populationType || 'adult',
      birthDate: profile.birthDate || '',
      biologicalSex: profile.biologicalSex || '',
      prePregnancyWeightInput: profile.prePregnancyWeightKg === null ? '' : String(profile.prePregnancyWeightKg),
      gestationalWeekInput: profile.gestationalWeek === null ? '' : String(profile.gestationalWeek),
      singletonPregnancyConfirmed: Boolean(profile.singletonPregnancyConfirmed),
      specialGuidanceConfirmed: Boolean(profile.specialGuidanceConfirmed),
      selectedConditions: profile.healthConditions || []
    }, () => this.refreshOptions())
  },

  refreshOptions() {
    const type = this.data.populationType
    const selected = this.data.selectedConditions || []
    const visibleConditions = CONDITION_OPTIONS
      .filter(item => !item.pregnancyOnly || type === 'pregnant')
      .map(item => Object.assign({}, item, { selected: selected.includes(item.key) }))
    this.setData({
      populationOptions: POPULATION_OPTIONS.map(item => Object.assign({}, item, { selected: item.key === type })),
      conditionOptions: visibleConditions,
      guidanceItems: health.getConditionGuidance(selected.filter(key => key !== 'gestationalDiabetes' || type === 'pregnant')),
      isChild: type === 'child',
      isPregnant: type === 'pregnant',
      isPostpartum: type === 'postpartum'
    })
  },

  selectPopulation(event) {
    const populationType = event.currentTarget.dataset.key
    let selectedConditions = this.data.selectedConditions || []
    if (populationType !== 'pregnant') selectedConditions = selectedConditions.filter(key => key !== 'gestationalDiabetes')
    this.setData({ populationType, selectedConditions, specialGuidanceConfirmed: false }, () => this.refreshOptions())
  },

  onBirthDateChange(event) { this.setData({ birthDate: event.detail.value }) },
  selectSex(event) { this.setData({ biologicalSex: event.currentTarget.dataset.sex }) },
  onPrePregnancyWeightInput(event) { this.setData({ prePregnancyWeightInput: event.detail.value }) },
  onGestationalWeekInput(event) { this.setData({ gestationalWeekInput: event.detail.value }) },
  toggleSingleton(event) { this.setData({ singletonPregnancyConfirmed: event.detail.value }) },
  toggleGuidanceConfirm(event) { this.setData({ specialGuidanceConfirmed: event.detail.value }) },

  toggleCondition(event) {
    const key = event.currentTarget.dataset.key
    const selected = (this.data.selectedConditions || []).slice()
    const index = selected.indexOf(key)
    if (index >= 0) selected.splice(index, 1)
    else selected.push(key)
    this.setData({ selectedConditions: selected }, () => this.refreshOptions())
  },

  saveSettings() {
    const type = this.data.populationType
    const prePregnancyWeightKg = health.parseMeasurement(this.data.prePregnancyWeightInput)
    const gestationalWeek = health.parseMeasurement(this.data.gestationalWeekInput)
    if (type === 'child') {
      const age = health.calculateAgeYears(this.data.birthDate)
      if (age === null || age < 6 || age >= 18) {
        wx.showToast({ title: '目前仅支持 6–17 岁筛查', icon: 'none' })
        return
      }
      if (!this.data.biologicalSex) {
        wx.showToast({ title: '请选择标准表使用的性别', icon: 'none' })
        return
      }
    }
    if (type === 'pregnant') {
      const heightCm = health.parseMeasurement(storage.getProfile().heightCm)
      if (prePregnancyWeightKg === null || prePregnancyWeightKg < 20 || prePregnancyWeightKg > 125) {
        wx.showToast({ title: '孕前体重请输入 20–125 kg', icon: 'none' })
        return
      }
      if (gestationalWeek === null || gestationalWeek < 1 || gestationalWeek > 42) {
        wx.showToast({ title: '孕周请输入 1–42 周', icon: 'none' })
        return
      }
      if (heightCm !== null && heightCm < 140) {
        wx.showToast({ title: '身高低于 140 cm 请咨询产科', icon: 'none' })
        return
      }
      if (!this.data.singletonPregnancyConfirmed) {
        wx.showToast({ title: '请确认当前为单胎妊娠', icon: 'none' })
        return
      }
    }
    if (type !== 'adult' && !this.data.specialGuidanceConfirmed) {
      wx.showToast({ title: '请先确认理解使用边界', icon: 'none' })
      return
    }
    const healthConditions = (this.data.selectedConditions || [])
      .filter(key => key !== 'gestationalDiabetes' || type === 'pregnant')
    storage.saveProfile({
      populationType: type,
      birthDate: type === 'child' ? this.data.birthDate : '',
      biologicalSex: type === 'child' ? this.data.biologicalSex : '',
      prePregnancyWeightKg: type === 'pregnant' ? Math.round(prePregnancyWeightKg * 10) / 10 : null,
      gestationalWeek: type === 'pregnant' ? Math.round(gestationalWeek * 10) / 10 : null,
      singletonPregnancyConfirmed: type === 'pregnant' && this.data.singletonPregnancyConfirmed,
      healthConditions,
      specialGuidanceConfirmed: type === 'adult' ? false : this.data.specialGuidanceConfirmed,
      adultConfirmed: type === 'adult' ? storage.getProfile().adultConfirmed : false
    })
    wx.showToast({ title: '设置已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 500)
  }
})
