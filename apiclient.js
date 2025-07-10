const DEFAULT_HEADERS = {};

async function request(method, url, options = {}) {
  const { params, data, headers = {} } = options;
  let fullUrl = url;

  if (params && typeof params === 'object') {
    const queryString = new URLSearchParams(params).toString();
    if (queryString) {
      fullUrl += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const fetchOptions = {
    method,
    headers: { ...DEFAULT_HEADERS, ...headers }
  };

  if (data != null && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(data);
  }

  let response;
  try {
    response = await fetch(fullUrl, fetchOptions);
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  const isJson = contentType.includes('application/json');

  if (!response.ok) {
    let errorBody = '';
    try {
      if (isJson) {
        const errObj = await response.json();
        errorBody = JSON.stringify(errObj);
      } else {
        errorBody = await response.text();
      }
    } catch {}
    throw new Error(`HTTP ${response.status} ${response.statusText}${errorBody ? `: ${errorBody}` : ''}`);
  }

  if (response.status === 204) {
    return null;
  }

  if (isJson) {
    return response.json();
  } else {
    return response.text();
  }
}

function get(url, options = {}) {
  return request('GET', url, options);
}

function post(url, options = {}) {
  return request('POST', url, options);
}

function put(url, options = {}) {
  return request('PUT', url, options);
}

function remove(url, options = {}) {
  return request('DELETE', url, options);
}

export default {
  request,
  get,
  post,
  put,
  delete: remove
};