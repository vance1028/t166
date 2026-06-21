'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { getPool, ensureSchema, resetAll, waitForDb, close } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');

const app = createApp();

test.before(async () => { await waitForDb(); await ensureSchema(); getPool(); });
test.beforeEach(async () => { await resetAll(); await seed(); });
test.after(async () => { await close(); });

async function loginAs(u, p) {
  const res = await request(app).post('/api/auth/login').send({ username: u, password: p });
  assert.strictEqual(res.status, 200, `登录失败: ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

function headers(token) {
  return { Authorization: `Bearer ${token}` };
}

test('库存管理：食材 CRUD', async () => {
  const token = await loginAs('operator', 'operator123');

  const c1 = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-001', name: '五花肉', unit: 'kg', category: '肉类',
    safetyStock: 5, minOrderQty: 10, packageSpec: 2, status: 'ACTIVE',
  });
  assert.strictEqual(c1.status, 201, JSON.stringify(c1.body));
  const ing = c1.body.data;
  assert.strictEqual(ing.name, '五花肉');
  assert.strictEqual(ing.safetyStock, 5);

  const list = await request(app).get('/api/ingredients').set(headers(token));
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.data.some(i => i.code === 'ING-001'));

  const u = await request(app).put(`/api/ingredients/${ing.id}`).set(headers(token)).send({
    name: '五花肉（精品）', safetyStock: 8,
  });
  assert.strictEqual(u.status, 200);
  assert.strictEqual(u.body.data.name, '五花肉（精品）');
  assert.strictEqual(u.body.data.safetyStock, 8);

  const adminToken = await loginAs('admin', 'admin123');
  const d = await request(app).delete(`/api/ingredients/${ing.id}`).set(headers(adminToken));
  assert.strictEqual(d.status, 200);
});

test('库存管理：配方 CRUD + 明细', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing1 = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-101', name: '五花肉', unit: 'kg', status: 'ACTIVE',
  });
  const ing2 = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-102', name: '酱油', unit: 'L', status: 'ACTIVE',
  });

  const r1 = await request(app).post('/api/recipes').set(headers(token)).send({
    dishName: '红烧肉', portions: 1, remark: '经典红烧肉',
  });
  assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
  const recipe = r1.body.data;
  assert.strictEqual(recipe.dishName, '红烧肉');

  const i1 = await request(app).post(`/api/recipes/${recipe.id}/items`).set(headers(token)).send({
    ingredientId: ing1.body.data.id, qty: 0.3,
  });
  assert.strictEqual(i1.status, 201);

  const i2 = await request(app).post(`/api/recipes/${recipe.id}/items`).set(headers(token)).send({
    ingredientId: ing2.body.data.id, qty: 0.02,
  });
  assert.strictEqual(i2.status, 201);

  const detail = await request(app).get(`/api/recipes/${recipe.id}`).set(headers(token));
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.body.data.items.length, 2);
});

test('库存管理：入库 + 批次查询', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-201', name: '大米', unit: 'kg', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  const r = await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B20250101-01',
    qty: 50, inDate: '2025-01-01', expireDate: '2025-12-31',
    unitPriceCents: 300, remark: '测试入库',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.data.totalQty, 50);

  const batches = await request(app).get('/api/inventory/batches').set(headers(token)).query({ canteenId });
  assert.strictEqual(batches.status, 200);
  assert.ok(batches.body.data.some(b => b.batchNo === 'B20250101-01'));
});

test('库存管理：跨批次 FEFO 出库', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-301', name: '青菜', unit: 'kg', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B-EARLY', qty: 10, inDate: '2025-01-01', expireDate: '2025-02-28', unitPriceCents: 500,
  });
  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B-LATE', qty: 20, inDate: '2025-01-01', expireDate: '2025-06-30', unitPriceCents: 600,
  });

  const out = await request(app).post('/api/inventory/out').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id, qty: 15,
    outDate: '2025-01-15', remark: '备餐消耗', refType: 'MEAL_PREP', refId: 'TEST-001',
  });
  assert.strictEqual(out.status, 200, JSON.stringify(out.body));
  assert.strictEqual(out.body.data.totalDeducted, 15);
  assert.strictEqual(out.body.data.deductions.length, 2);
  assert.strictEqual(out.body.data.deductions[0].batchNo, 'B-EARLY');
  assert.strictEqual(out.body.data.deductions[0].qty, 10);
  assert.strictEqual(out.body.data.deductions[1].batchNo, 'B-LATE');
  assert.strictEqual(out.body.data.deductions[1].qty, 5);

  const summary = await request(app).get('/api/inventory/summary').set(headers(token)).query({ canteenId });
  assert.strictEqual(summary.status, 200);
  const row = summary.body.data.find(s => s.ingredientId === ing.body.data.id);
  assert.ok(row);
  assert.strictEqual(row.totalQty, 15);
});

test('库存管理：库存不足时全部回滚，不允许部分扣减', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-401', name: '牛肉', unit: 'kg', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B1', qty: 3, inDate: '2025-01-01', expireDate: '2025-12-31', unitPriceCents: 1000,
  });

  const out = await request(app).post('/api/inventory/out').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id, qty: 5,
    outDate: '2025-01-15',
  });
  assert.strictEqual(out.status, 409);

  const batches = await request(app).get('/api/inventory/batches').set(headers(token)).query({ canteenId, ingredientId: ing.body.data.id });
  assert.strictEqual(batches.status, 200);
  const b = batches.body.data.find(b => b.batchNo === 'B1');
  assert.strictEqual(b.remainingQty, 3);
});

test('库存管理：过期批次禁止出库', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-501', name: '牛奶', unit: 'L', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B-EXPIRED', qty: 10, inDate: '2025-01-01', expireDate: '2025-01-10', unitPriceCents: 800,
  });

  const out = await request(app).post('/api/inventory/out').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id, qty: 2,
    outDate: '2025-01-15',
  });
  assert.strictEqual(out.status, 409);

  const warnings = await request(app).get('/api/inventory/warnings').set(headers(token)).query({ canteenId });
  assert.strictEqual(warnings.status, 200);
  assert.ok(warnings.body.data.expired.some(b => b.batchNo === 'B-EXPIRED'));
});

test('库存管理：盘点 - 盘盈同步增加实际库存', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-601', name: '盐', unit: 'kg', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B1', qty: 5, inDate: '2025-01-01', expireDate: '2026-12-31', unitPriceCents: 200,
  });

  const sc = await request(app).post('/api/stock-counts').set(headers(token)).send({
    canteenId, countDate: '2025-01-15', remark: '1月盘点',
  });
  assert.strictEqual(sc.status, 201, JSON.stringify(sc.body));
  const countId = sc.body.data.id;

  const detail = await request(app).get(`/api/stock-counts/${countId}`).set(headers(token));
  assert.strictEqual(detail.status, 200);
  const item = detail.body.data.items.find(i => i.ingredientId === ing.body.data.id);
  assert.ok(item);
  assert.strictEqual(item.theoreticalQty, 5);

  await request(app).put(`/api/stock-counts/items/${item.id}`).set(headers(token)).send({
    actualQty: 7,
  });

  const confirm = await request(app).post(`/api/stock-counts/${countId}/confirm`).set(headers(token));
  assert.strictEqual(confirm.status, 200, JSON.stringify(confirm.body));

  const summary = await request(app).get('/api/inventory/summary').set(headers(token)).query({ canteenId });
  const row = summary.body.data.find(s => s.ingredientId === ing.body.data.id);
  assert.strictEqual(row.totalQty, 7);

  const movements = await request(app).get('/api/inventory/movements').set(headers(token)).query({ canteenId, ingredientId: ing.body.data.id });
  assert.ok(movements.body.data.some(m => m.type === 'ADJUST_PLUS'));
});

test('库存管理：盘点 - 盘亏不扣减过期批次', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-701', name: '酸奶', unit: '盒', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B-NEW', qty: 5, inDate: '2025-01-01', expireDate: '2025-12-31', unitPriceCents: 300,
  });
  await request(app).post('/api/inventory/in').set(headers(token)).send({
    canteenId, ingredientId: ing.body.data.id,
    batchNo: 'B-OLD', qty: 3, inDate: '2025-01-01', expireDate: '2024-12-31', unitPriceCents: 300,
  });

  const sc = await request(app).post('/api/stock-counts').set(headers(token)).send({
    canteenId, countDate: '2025-01-15',
  });
  const countId = sc.body.data.id;

  const detail = await request(app).get(`/api/stock-counts/${countId}`).set(headers(token));
  const item = detail.body.data.items.find(i => i.ingredientId === ing.body.data.id);
  assert.strictEqual(item.theoreticalQty, 5);

  await request(app).put(`/api/stock-counts/items/${item.id}`).set(headers(token)).send({
    actualQty: 2,
  });

  const confirm = await request(app).post(`/api/stock-counts/${countId}/confirm`).set(headers(token));
  assert.strictEqual(confirm.status, 200, JSON.stringify(confirm.body));

  const batches = await request(app).get('/api/inventory/batches').set(headers(token)).query({ canteenId, ingredientId: ing.body.data.id });
  const oldBatch = batches.body.data.find(b => b.batchNo === 'B-OLD');
  const newBatch = batches.body.data.find(b => b.batchNo === 'B-NEW');
  assert.strictEqual(oldBatch.remainingQty, 3);
  assert.strictEqual(newBatch.remainingQty, 2);
});

test('库存管理：BOM 需求计算', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing1 = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-801', name: '五花肉', unit: 'kg', status: 'ACTIVE',
  });
  const ing2 = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-802', name: '酱油', unit: 'L', status: 'ACTIVE',
  });

  const recipe = await request(app).post('/api/recipes').set(headers(token)).send({
    dishName: '红烧肉套餐', portions: 1,
  });
  await request(app).post(`/api/recipes/${recipe.body.data.id}/items`).set(headers(token)).send({
    ingredientId: ing1.body.data.id, qty: 0.3,
  });
  await request(app).post(`/api/recipes/${recipe.body.data.id}/items`).set(headers(token)).send({
    ingredientId: ing2.body.data.id, qty: 0.02,
  });

  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  const meal = await request(app).post('/api/meals').set(headers(token)).send({
    canteenId, serveDate: '2026-06-18', mealType: 'LUNCH',
    dishName: '红烧肉套餐', priceCents: 1500, status: 'PUBLISHED',
  });

  const elder = await request(app).post('/api/elders').set(headers(token)).send({
    code: 'E-TEST-001', name: '测试老人', gender: 'F', age: 75, phone: '13900000001',
    subsidyLevel: 'A', dietary: '', canteenId,
  });
  const elderId = elder.body.data.id;

  await request(app).post('/api/orders').set(headers(token)).send({
    elderId, mealId: meal.body.data.id, diningType: 'DINE_IN', qty: 10,
    amountCents: 15000, subsidyCents: 0, payCents: 15000, status: 'RESERVED',
  });

  const demand = await request(app).get('/api/inventory/demand').set(headers(token)).query({
    canteenId, serveDate: '2026-06-18',
  });
  assert.strictEqual(demand.status, 200);
  assert.ok(demand.body.data.ingredientDemands[ing1.body.data.id]);
  assert.strictEqual(demand.body.data.ingredientDemands[ing1.body.data.id].totalQty, 3);
});

test('采购管理：创建采购单并收货', async () => {
  const token = await loginAs('operator', 'operator123');

  const ing = await request(app).post('/api/ingredients').set(headers(token)).send({
    code: 'ING-901', name: '面粉', unit: 'kg', status: 'ACTIVE',
  });
  const canteens = await request(app).get('/api/canteens').set(headers(token));
  const canteenId = canteens.body.data[0].id;

  const po = await request(app).post('/api/purchase-orders').set(headers(token)).send({
    canteenId, orderDate: '2025-01-15', expectedDate: '2025-01-20',
    remark: '测试采购',
    items: [
      { ingredientId: ing.body.data.id, qty: 100, unitPriceCents: 400, remark: '一级面粉' },
    ],
  });
  assert.strictEqual(po.status, 201, JSON.stringify(po.body));
  const poId = po.body.data.id;

  const submit = await request(app).post(`/api/purchase-orders/${poId}/submit`).set(headers(token));
  assert.strictEqual(submit.status, 200);
  assert.strictEqual(submit.body.data.status, 'ORDERED');

  const items = submit.body.data.items;
  const receive = await request(app).post(`/api/purchase-orders/items/${items[0].id}/receive`).set(headers(token)).send({
    qty: 50, batchNo: 'RCV-001', expireDate: '2025-12-31',
  });
  assert.strictEqual(receive.status, 200, JSON.stringify(receive.body));

  const detail = await request(app).get(`/api/purchase-orders/${poId}`).set(headers(token));
  assert.strictEqual(detail.body.data.items[0].receivedQty, 50);

  const batches = await request(app).get('/api/inventory/batches').set(headers(token)).query({ canteenId, ingredientId: ing.body.data.id });
  assert.ok(batches.body.data.some(b => b.batchNo === 'RCV-001'));
  const batch = batches.body.data.find(b => b.batchNo === 'RCV-001');
  assert.strictEqual(batch.remainingQty, 50);
});
