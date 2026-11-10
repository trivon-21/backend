const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const moduleDir = path.join(__dirname, '..', 'src', 'modules', 'inventory-manager');
const service = require('../src/modules/inventory-manager/inventory_manager.service');
const controller = require('../src/modules/inventory-manager/inventory_manager.controller');

test('every service function the inventory controller calls is exported by the service facade', () => {
  const source = fs.readFileSync(path.join(moduleDir, 'inventory_manager.controller.js'), 'utf8');
  const called = [...new Set([...source.matchAll(/\bservice\.(\w+)/g)].map((match) => match[1]))];
  assert.deepEqual(called.filter((name) => typeof service[name] !== 'function'), []);
});

test('every inventory route binds to an existing controller handler', () => {
  const source = fs.readFileSync(path.join(moduleDir, 'inventory_manager.routes.js'), 'utf8');
  const handlers = [...new Set([...source.matchAll(/\bcontroller\.(\w+)/g)].map((match) => match[1]))];
  assert.deepEqual(handlers.filter((name) => typeof controller[name] !== 'function'), []);
});
