const cloudbase = require('@cloudbase/js-sdk')

let handlerPromise

async function getHandler() {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const env = process.env.TCB_ENV || process.env.SOUNDTRACE_CLOUDBASE_ENV
      const accessKey = process.env.SOUNDTRACE_STORE_KEY
      if (!env || !accessKey) throw new Error('Cloud storage configuration is missing')
      const app = cloudbase.init({ env, accessKey })
      const { createRouter } = await import('./router.mjs')
      return createRouter({ bucket: app.storage.from('soundtrace'), secret: accessKey })
    })().catch(error => { handlerPromise = null; throw error })
  }
  return handlerPromise
}

exports.main = async event => (await getHandler())(event)
