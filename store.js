const deepClone = obj => {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return cloneDeep(obj);
};

let _state = {};
let _mutations = {};
let _actions = {};
let _subscribers = [];

function initStore({ state = {}, mutations = {}, actions = {} } = {}) {
  _state = deepClone(state);
  _mutations = { ...mutations };
  _actions = { ...actions };
  _subscribers = [];
}

function getState() {
  return deepClone(_state);
}

function commitMutation(type, payload) {
  const mutation = _mutations[type];
  if (!mutation) {
    throw new Error(`Mutation "${type}" does not exist.`);
  }
  mutation(_state, payload);
  const snapshot = getState();
  _subscribers.forEach(fn => {
    try {
      fn({ type, payload, state: snapshot });
    } catch (err) {
      console.error(`Error in subscriber for mutation "${type}":`, err);
    }
  });
}

function dispatchAction(type, payload) {
  const action = _actions[type];
  if (!action) {
    return Promise.reject(new Error(`Action "${type}" does not exist.`));
  }
  try {
    const result = action(
      { state: getState(), commit: commitMutation, dispatch: dispatchAction },
      payload
    );
    return result instanceof Promise ? result : Promise.resolve(result);
  } catch (err) {
    return Promise.reject(err);
  }
}

function subscribe(fn) {
  if (typeof fn !== 'function') {
    throw new Error('Subscriber must be a function.');
  }
  _subscribers.push(fn);
  return () => {
    _subscribers = _subscribers.filter(sub => sub !== fn);
  };
}

export default {
  initStore,
  getState,
  commitMutation,
  dispatchAction,
  subscribe
};