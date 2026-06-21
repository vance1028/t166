'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { fifoDeduct, checkExpiry, calcStockSummary, calcCountDiff } = require('../src/logic/inventory');

function makeBatch(id, qty, expireDate, unitPriceCents = 1000, status = 'IN_STOCK') {
  return { id, batchNo: `B${id}`, remainingQty: qty, expireDate, unitPriceCents, status };
}

test('inventory.fifoDeduct: 单批次足够', () => {
  const batches = [makeBatch(1, 10, '2025-12-31', 500)];
  const r = fifoDeduct(batches, 3, '2025-01-01');
  assert.ok(r.success);
  assert.strictEqual(r.totalDeducted, 3);
  assert.strictEqual(r.deductions.length, 1);
  assert.strictEqual(r.deductions[0].batchId, 1);
  assert.strictEqual(r.updatedBatches[0].remainingQty, 7);
});

test('inventory.fifoDeduct: 跨批次扣减（FEFO，先到期先出）', () => {
  const batches = [
    makeBatch(1, 5, '2025-06-30', 500),
    makeBatch(2, 10, '2025-12-31', 600),
    makeBatch(3, 3, '2025-03-31', 400),
  ];
  const r = fifoDeduct(batches, 10, '2025-01-01');
  assert.ok(r.success);
  assert.strictEqual(r.deductions.length, 3);
  assert.strictEqual(r.deductions[0].batchId, 3);
  assert.strictEqual(r.deductions[1].batchId, 1);
  assert.strictEqual(r.deductions[2].batchId, 2);
  assert.strictEqual(r.totalDeducted, 10);
  assert.strictEqual(r.totalCostCents, 3 * 400 + 5 * 500 + 2 * 600);
});

test('inventory.fifoDeduct: 库存不足返回 success=false，不扣减', () => {
  const batches = [makeBatch(1, 3, '2025-12-31')];
  const r = fifoDeduct(batches, 5, '2025-01-01');
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.remainingNeed, 2);
  assert.strictEqual(r.totalDeducted, 3);
});

test('inventory.fifoDeduct: 过期批次不参与扣减', () => {
  const batches = [
    makeBatch(1, 10, '2024-01-01', 500),
    makeBatch(2, 5, '2025-12-31', 600),
  ];
  const r = fifoDeduct(batches, 8, '2025-01-01');
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.deductions.length, 1);
  assert.strictEqual(r.deductions[0].batchId, 2);
  assert.strictEqual(r.totalDeducted, 5);
  assert.strictEqual(r.remainingNeed, 3);
});

test('inventory.fifoDeduct: 刚好过期当天可以出（等于 today 不算过期）', () => {
  const batches = [makeBatch(1, 5, '2025-01-01', 500)];
  const r = fifoDeduct(batches, 3, '2025-01-01');
  assert.ok(r.success);
  assert.strictEqual(r.totalDeducted, 3);
});

test('inventory.fifoDeduct: 无过期日的批次最后扣', () => {
  const batches = [
    makeBatch(1, 10, null, 500),
    makeBatch(2, 5, '2025-12-31', 600),
  ];
  const r = fifoDeduct(batches, 7, '2025-01-01');
  assert.ok(r.success);
  assert.strictEqual(r.deductions[0].batchId, 2);
  assert.strictEqual(r.deductions[1].batchId, 1);
});

test('inventory.fifoDeduct: 扣完状态变 USED_UP', () => {
  const batches = [makeBatch(1, 3, '2025-12-31')];
  const r = fifoDeduct(batches, 3, '2025-01-01');
  assert.ok(r.success);
  const ub = r.updatedBatches.find(b => b.id === 1);
  assert.strictEqual(ub.status, 'USED_UP');
  assert.strictEqual(ub.remainingQty, 0);
});

test('inventory.fifoDeduct: 不传 today 则不校验过期', () => {
  const batches = [makeBatch(1, 5, '2020-01-01')];
  const r = fifoDeduct(batches, 3);
  assert.ok(r.success);
  assert.strictEqual(r.totalDeducted, 3);
});

test('inventory.checkExpiry: 分类正常/临期/过期/无过期', () => {
  const batches = [
    makeBatch(1, 10, '2025-12-31'),
    makeBatch(2, 10, '2025-01-05'),
    makeBatch(3, 10, '2024-12-31'),
    makeBatch(4, 10, null),
  ];
  const r = checkExpiry(batches, '2025-01-01', 7);
  assert.strictEqual(r.expired.length, 1);
  assert.strictEqual(r.expired[0].id, 3);
  assert.strictEqual(r.expiringSoon.length, 1);
  assert.strictEqual(r.expiringSoon[0].id, 2);
  assert.strictEqual(r.normal.length, 1);
  assert.strictEqual(r.normal[0].id, 1);
  assert.strictEqual(r.noExpiry.length, 1);
  assert.strictEqual(r.noExpiry[0].id, 4);
});

test('inventory.calcStockSummary: 总量和加权平均价', () => {
  const batches = [
    makeBatch(1, 10, '2025-12-31', 500),
    makeBatch(2, 5, '2025-12-31', 800),
  ];
  const r = calcStockSummary(batches);
  assert.strictEqual(r.totalQty, 15);
  assert.strictEqual(r.totalValueCents, 10 * 500 + 5 * 800);
  assert.strictEqual(r.weightedAvgPriceCents, Math.round((10 * 500 + 5 * 800) / 15));
});

test('inventory.calcCountDiff: 盘盈', () => {
  const r = calcCountDiff(10, 12, 500);
  assert.strictEqual(r.diffType, 'OVER');
  assert.strictEqual(r.diffQty, 2);
  assert.strictEqual(r.diffAmountCents, 1000);
});

test('inventory.calcCountDiff: 盘亏', () => {
  const r = calcCountDiff(10, 7, 500);
  assert.strictEqual(r.diffType, 'SHORT');
  assert.strictEqual(r.diffQty, -3);
  assert.strictEqual(r.diffAmountCents, 1500);
});

test('inventory.calcCountDiff: 相等', () => {
  const r = calcCountDiff(10, 10, 500);
  assert.strictEqual(r.diffType, 'EQUAL');
  assert.strictEqual(r.diffQty, 0);
  assert.strictEqual(r.diffAmountCents, 0);
});
