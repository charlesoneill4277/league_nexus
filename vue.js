import { createApp, defineAsyncComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import App from './App.vue'
import messages from './locales'
import router from './router'
import store from './store'

function registerGlobalComponents(app) {
  const components = import.meta.glob('./components/global/**/*.vue')
  for (const path in components) {
    const loader = components[path]
    const fileName = path.substring(path.lastIndexOf('/') + 1, path.length - 4)
    const componentName = fileName.charAt(0).toUpperCase() + fileName.slice(1)
    app.component(componentName, defineAsyncComponent(loader))
  }
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages
})

const app = createApp(App)
registerGlobalComponents(app)
app.use(router)
app.use(store)
app.use(i18n)
app.mount('#app')