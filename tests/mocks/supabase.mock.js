const jestMock = require('jest-mock');

const responseQueue = {};
const insertDataCapture = {}; // Capture all insert data for validation

function captureInsertData(table, data) {
  if (!insertDataCapture[table]) {
    insertDataCapture[table] = [];
  }
  insertDataCapture[table].push(data);
}

function getInsertedData(table) {
  return insertDataCapture[table] || [];
}

function clearInsertedData(table = null) {
  if (table) {
    delete insertDataCapture[table];
  } else {
    Object.keys(insertDataCapture).forEach(key => delete insertDataCapture[key]);
  }
}

function queueResponse(table, method, payload) {
  if (!responseQueue[table]) {
    responseQueue[table] = {};
  }
  if (!responseQueue[table][method]) {
    responseQueue[table][method] = [];
  }
  responseQueue[table][method].push(payload);
}

function getNextResponse(table, method) {
  const tableQueue = responseQueue[table];
  if (tableQueue && tableQueue[method] && tableQueue[method].length) {
    return tableQueue[method].shift();
  }
  return { data: null, error: null };
}

function createQueryBuilder(table) {
  const state = { lastMethod: 'select', insertData: null };

  const builder = {
    select: jestMock.fn(() => {
      state.lastMethod = 'select';
      return builder;
    }),
    insert: jestMock.fn((data) => {
      state.lastMethod = 'insert';
      state.insertData = data; // Capture the data being inserted
      if (Array.isArray(data)) {
        data.forEach(item => captureInsertData(table, item));
      } else if (data) {
        captureInsertData(table, data);
      }
      return builder;
    }),
    update: jestMock.fn(() => {
      state.lastMethod = 'update';
      return builder;
    }),
    delete: jestMock.fn(() => {
      state.lastMethod = 'delete';
      return builder;
    }),
    eq: jestMock.fn(() => builder),
    in: jestMock.fn(() => builder),
    gte: jestMock.fn(() => builder),
    gt: jestMock.fn(() => builder),
    order: jestMock.fn(() => builder),
    limit: jestMock.fn(() => builder),
    lt: jestMock.fn(() => builder),
    lte: jestMock.fn(() => builder),
    neq: jestMock.fn(() => builder),
    match: jestMock.fn(() => builder),
    range: jestMock.fn(() => builder),
    single: jestMock.fn(() => Promise.resolve(getNextResponse(table, state.lastMethod))),
    maybeSingle: jestMock.fn(() => Promise.resolve(getNextResponse(table, state.lastMethod))),
    selectOne: jestMock.fn(() => Promise.resolve(getNextResponse(table, state.lastMethod)))
  };
  // Make the builder thenable for await support
  builder.then = function(resolve, reject) {
    const response = getNextResponse(table, state.lastMethod);
    const promise = Promise.resolve(response);
    if (resolve) {
      return promise.then(resolve, reject);
    }
    return promise;
  };
  builder.catch = (reject) => {
    const response = getNextResponse(table, state.lastMethod);
    return Promise.resolve(response).catch(reject);
  };
  builder.finally = (callback) => {
    const response = getNextResponse(table, state.lastMethod);
    return Promise.resolve(response).finally(callback);
  };
  return builder;
}

const supabase = {
  from: jestMock.fn((table) => createQueryBuilder(table)),
  rpc: jestMock.fn((fnName, params) => {
    return Promise.resolve(getNextResponse('rpc', fnName));
  }),
  auth: {
    signUp: jestMock.fn(() => Promise.resolve({ data: null, error: null })),
    signInWithPassword: jestMock.fn(() => Promise.resolve({ data: null, error: null })),
    getUser: jestMock.fn(() => Promise.resolve({ data: null, error: null }))
  }
};

function resetQueue() {
  Object.keys(responseQueue).forEach((table) => {
    responseQueue[table] = {};
  });
  clearInsertedData();
  supabase.from.mockClear();
  supabase.rpc.mockClear();
  supabase.auth.signUp.mockClear();
  supabase.auth.signInWithPassword.mockClear();
  supabase.auth.getUser.mockClear();
}

module.exports = {
  supabase,
  __queueResponse: queueResponse,
  __reset: resetQueue,
  __getInsertedData: getInsertedData,
  __clearInsertedData: clearInsertedData
};

