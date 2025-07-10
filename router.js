const routes = []
let beforeEachGuard = null
let currentRoute = { path: null, params: {} }
let outlet = null

function pathToRegex(path) {
  const keys = []
  let wildcardCount = 0
  const pattern = path
    .replace(/\/+/g, '/')
    .replace(/\/:(\w+)/g, (_, key) => {
      keys.push(key)
      return '/([^/]+)'
    })
    .replace(/\*/g, () => {
      wildcardCount++
      const keyName = wildcardCount > 1 ? `wildcard${wildcardCount}` : 'wildcard'
      keys.push(keyName)
      return '(.*)'
    })
  return { regex: new RegExp(`^${pattern}$`), keys }
}

function extractParams(match, keys) {
  const values = match.slice(1)
  return keys.reduce((memo, key, i) => {
    memo[key] = decodeURIComponent(values[i] || '')
    return memo
  }, {})
}

function findRoute(path) {
  for (const route of routes) {
    const m = path.match(route.regex)
    if (m) {
      return {
        path: route.path,
        component: route.component,
        params: extractParams(m, route.keys)
      }
    }
  }
  return null
}

function render(route) {
  if (!outlet) return
  outlet.innerHTML = ''
  const comp = route.component
  let result = ''
  if (comp && typeof comp.render === 'function') {
    result = comp.render({ params: route.params })
  } else if (typeof comp === 'function') {
    result = comp({ params: route.params })
  }
  if (typeof result === 'string') {
    outlet.innerHTML = result
  } else if (result instanceof Node) {
    outlet.appendChild(result)
  }
  currentRoute = { path: route.path, params: route.params }
}

function navigate(toPath, replace = false) {
  const method = replace ? 'replaceState' : 'pushState'
  history[method]({}, '', toPath)
  handleLocation()
}

function handleLocation() {
  const fullPath = window.location.pathname || '/'
  const to = findRoute(fullPath) || { path: fullPath, component: null, params: {} }
  const from = { ...currentRoute }
  const proceed = () => {
    if (to.component) {
      render(to)
    }
  }
  if (typeof beforeEachGuard === 'function') {
    let called = false
    beforeEachGuard(to, from, (arg) => {
      if (called) return
      called = true
      if (arg === false) {
        // abort navigation
        return
      } else if (typeof arg === 'string') {
        navigate(arg)
      } else {
        proceed()
      }
    })
  } else {
    proceed()
  }
}

function handleLinkClick(e) {
  if (e.defaultPrevented) return
  let el = e.target
  while (el && el.nodeName !== 'A') {
    el = el.parentNode
  }
  if (!el || el.target || el.host !== location.host) return
  const href = el.getAttribute('href')
  if (!href || !href.startsWith('/')) return
  e.preventDefault()
  navigate(href)
}

export function addRoute(path, component) {
  const { regex, keys } = pathToRegex(path)
  routes.push({ path, component, regex, keys })
}

export function beforeEachHook(fn) {
  if (typeof fn === 'function') {
    beforeEachGuard = fn
  }
}

export function initRouter({ rootId = 'app' } = {}) {
  outlet = document.getElementById(rootId)
  if (!outlet) {
    throw new Error(`Router init error: element with id "${rootId}" not found`)
  }
  window.addEventListener('popstate', handleLocation)
  document.addEventListener('click', handleLinkClick)
  handleLocation()
}