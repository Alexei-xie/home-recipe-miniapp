const storage = require('../../utils/storage')
const imageService = require('../../utils/image-service')

Page({
  data: {
    recipe: null,
    stepIndex: 0,
    stepCount: 0,
    currentStep: null,
    elapsed: 0,
    timerText: '00:00',
    running: false
  },

  onLoad(options) {
    this.recipeId = options.id
    this.stepImageRetryCounts = Object.create(null)
    const recipe = storage.getRecipe(options.id)
    this.setData({
      recipe,
      stepCount: recipe && recipe.steps ? recipe.steps.length : 0,
      currentStep: recipe && recipe.steps ? recipe.steps[0] || null : null
    })
    if (recipe) wx.setNavigationBarTitle({ title: `烹饪 · ${recipe.name}` })
    if (recipe) imageService.hydrateRecipeStepImages(recipe).then(hydrated => {
      if (this.recipeId !== hydrated.id) return
      this.setData({
        recipe: hydrated,
        currentStep: hydrated.steps[this.data.stepIndex] || null
      })
    })
  },

  onShow() {
    if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: true })
  },

  onHide() { this.stopTimer() },
  onUnload() {
    this.stopTimer()
    if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: false })
  },

  formatElapsed(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
  },

  toggleTimer() {
    if (this.data.running) return this.stopTimer()
    this.setData({ running: true })
    this.timer = setInterval(() => {
      const elapsed = this.data.elapsed + 1
      this.setData({ elapsed, timerText: this.formatElapsed(elapsed) })
    }, 1000)
  },

  stopTimer() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.data.running) this.setData({ running: false })
  },

  setStep(stepIndex) {
    const recipe = this.data.recipe
    const currentStep = recipe && recipe.steps ? recipe.steps[stepIndex] || null : null
    this.setData({ stepIndex, currentStep })
  },

  previousStep() {
    if (this.data.stepIndex > 0) this.setStep(this.data.stepIndex - 1)
  },

  nextStep() {
    if (this.data.stepIndex < this.data.stepCount - 1) this.setStep(this.data.stepIndex + 1)
  },

  previewStepImage(event) {
    const current = event.currentTarget.dataset.src
    const urls = (this.data.currentStep && this.data.currentStep.images || []).filter(Boolean)
    if (current && urls.length) wx.previewImage({ current, urls })
  },

  onStepImageError(event) {
    const failedUrl = event.currentTarget.dataset.src
    const currentStep = this.data.currentStep
    if (!failedUrl || !currentStep) return
    const invalidatedPaths = imageService.invalidateStepImageByUrl(failedUrl)
    const retryKey = invalidatedPaths.join('|') || failedUrl
    this.stepImageRetryCounts = this.stepImageRetryCounts || Object.create(null)
    const recipe = this.data.recipe
    const steps = (recipe.steps || []).map(step => step.id === currentStep.id
      ? Object.assign({}, step, { images: (step.images || []).filter(item => item !== failedUrl) })
      : step)
    const strippedRecipe = Object.assign({}, recipe, { steps })
    this.setData({
      recipe: strippedRecipe,
      currentStep: steps[this.data.stepIndex] || null
    })
    if (!invalidatedPaths.length || this.stepImageRetryCounts[retryKey]) return
    this.stepImageRetryCounts[retryKey] = 1
    imageService.hydrateRecipeStepImages(strippedRecipe).then(hydrated => {
      if (this.recipeId !== hydrated.id) return
      this.setData({
        recipe: hydrated,
        currentStep: hydrated.steps[this.data.stepIndex] || null
      })
    })
  },

  finishCooking() {
    storage.markRecipeCooked(this.recipeId)
    this.stopTimer()
    wx.showToast({ title: '已记录今天做过', icon: 'success' })
  }
})
