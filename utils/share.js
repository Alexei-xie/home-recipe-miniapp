const DEFAULT_TITLE = '今日食签｜家常菜谱与健康饮食助手'
const DEFAULT_PATH = '/pages/index/index'

function enableShareMenu() {
  if (!wx.showShareMenu) return
  wx.showShareMenu({
    menus: ['shareAppMessage', 'shareTimeline'],
    fail() {
      // 低版本微信或当前环境不支持时，仍保留页面的默认分享能力。
    }
  })
}

function appMessage(options = {}) {
  return {
    title: options.title || DEFAULT_TITLE,
    path: options.path || DEFAULT_PATH
  }
}

function timeline(options = {}) {
  return {
    title: options.title || DEFAULT_TITLE,
    query: options.query || ''
  }
}

module.exports = {
  enableShareMenu,
  appMessage,
  timeline
}
