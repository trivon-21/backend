const test = require('node:test');
const assert = require('node:assert/strict');
const { protect } = require('../src/middleware/protect');
const { authorize } = require('../src/middleware/role.middleware');

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('protected portal APIs reject requests without a bearer token', async () => {
  const response = responseRecorder();
  let nextCalled = false;

  await protect({ headers: {} }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('manager authorization rejects the inventory role', () => {
  const response = responseRecorder();
  let nextCalled = false;

  authorize(['MANAGER', 'SUPER_ADMIN'])(
    { user: { role: 'INVENTORY' } },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(response.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('inventory authorization accepts inventory and super-admin roles', () => {
  for (const role of ['INVENTORY', 'SUPER_ADMIN']) {
    const response = responseRecorder();
    let nextCalled = false;

    authorize(['INVENTORY', 'SUPER_ADMIN'])(
      { user: { role } },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  }
});

test('manager authorization accepts manager and super-admin roles', () => {
  for (const role of ['MANAGER', 'SUPER_ADMIN']) {
    const response = responseRecorder();
    let nextCalled = false;

    authorize(['MANAGER', 'SUPER_ADMIN'])(
      { user: { role } },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);
  }
});
