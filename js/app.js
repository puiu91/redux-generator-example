// noprotect
//jshint esnext:true, asi:true

console.clear()

const {
  createStore,
  combineReducers,
  applyMiddleware,
  bindActionCreators
} = Redux

const {
  default: createSagaMiddleware,
  effects: {
    take, put, call, fork, join, cancel, race
  }
} = ReduxSaga


///////////////////////////////////////////////////////////////////
//
// Utils
//

const log = v => console.log(v)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const action = type => (payload={}) => ({type, ...payload})

function createRequestTypes(base) {
  return {
    REQUEST : `${base}_REQUEST`,
    SUCCESS : `${base}_SUCCESS`,
    ERROR   : `${base}_ERROR`
  }
}

function apify(fn) {
  return (...args) =>
  new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn(...args))
      } catch(e) {
        reject(e)
      }
    }, 1000)
  })
}

///////////////////////////////////////////////////////////////
//
// API
//

const users = [
  {name: 'admin', password: 'admin'},
  {name: 'guest', password: 'guest'}
]

let tokenId = 0

function authFn({token, name, password}) {
  if(token) {
    return refreshTokenFn(token)
  }

  else {
    const valid = users.some(
      u => u.name === name && u.password === password
    )

    if(valid) {
      return {expires_in: 2000, id: ++tokenId, $$token: true}
    }

    else {
      throw 'Invalid credentials'
    }
  }

}

function refreshTokenFn(token) {
  if(!token.$$token)
    throw 'Invalid token'
  return {...token, id: ++tokenId}
}

const api = {
  authorize: apify(authFn),
  refreshToken: apify(refreshTokenFn)
}


///////////////////////////////////////////////////////////////
//
// Actions
//


const LOGIN = createRequestTypes('LOGIN')
const login = {
  request : (name, password) => action(LOGIN.REQUEST)({name, password}),
  success : (token) => action(LOGIN.SUCCESS)({token}),
  error   : (error) => action(LOGIN.ERROR)({error})
}

const LOGOUT = 'LOGOUT'
const logout = action(LOGOUT)


///////////////////////////////////////////////////////////////
//
// Reducers
//


const PENDING = 'PENDING'
const IN = 'IN'
const OUT = 'OUT'

function user(state = null, action) {
  switch(action.type) {
    case LOGIN.REQUEST:
      return {
        name: action.name,
        password: action.password,
        status: PENDING
      }

    case LOGIN.SUCCESS:
      return {
        ...state,
        status: IN,
        token: action.token
      }

    case LOGIN.ERROR:
      return {
        ...state,
        status: OUT,
        token: null,
        error: action.error
      }

    case LOGOUT:
      return null

    default:
      return state
  }
}

const rootReducer = combineReducers({
  user
})

///////////////////////////////////////////////////////////////
//
// Sagas
//

function* authorize(credentials) {
  const token = yield call(api.authorize, credentials)
  yield put( login.success(token) )
  return token
}

function* authAndRefreshTokenOnExpiry(name, password) {
  let token = yield call(authorize, {name, password})
  while(true) {
    yield call(delay, token.expires_in)
    token = yield call(authorize, {token})
  }
}

function* watchAuth() {
  while(true) {
    const {name, password} = yield take(LOGIN.REQUEST)

    yield race([
      take(LOGOUT),
      call(authAndRefreshTokenOnExpiry, name, password)
    ])
  }
}


///////////////////////////////////////////////////////////////
//
// Create the store. Log states into the console
//

const sagaMiddleware = createSagaMiddleware()
const store = createStore(
  rootReducer,
  applyMiddleware(sagaMiddleware)
)
sagaMiddleware.run(watchAuth)


let lastState
store.subscribe(() => {
  const state = store.getState()
  if(state !== lastState) {
    lastState = state
    console.log('user:', lastState.user)
  }
})

/* test */

store.dispatch(login.request('admin', 'admin'))


setTimeout(() => {
  store.dispatch(logout())
}, 14333)
