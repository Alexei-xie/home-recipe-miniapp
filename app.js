const storage = require('./utils/storage')
const cloudbase = require('./config/cloudbase')

App({
  onLaunch() {
    storage.initStorage()
    if (cloudbase.isCloudCoverEnabled() && wx.cloud) {
      wx.cloud.init({ env: cloudbase.CLOUDBASE_ENV_ID, traceUser: true })
    }
  },
  globalData: {
    appName: '今日食签'
  }
})
