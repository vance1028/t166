'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { explodeBom, calcPurchaseSuggestion, roundUpByPack } = require('../src/logic/bom');

test('bom.roundUpByPack: 按包装规格向上取整', () => {
  assert.strictEqual(roundUpByPack(3.5, 2), 4);
  assert.strictEqual(roundUpByPack(4, 2), 4);
  assert.strictEqual(roundUpByPack(0.5, 2), 2);
  assert.strictEqual(roundUpByPack(0, 2), 0);
  assert.strictEqual(roundUpByPack(-1, 2), 0);
  assert.strictEqual(roundUpByPack(5, 0), 5);
  assert.strictEqual(roundUpByPack(5, 1), 5);
});

test('bom.explodeBom: 单菜品单食材配方拆解', () => {
  const dishDemand = [{ dishName: '红烧肉', qty: 10 }];
  const recipesByDish = {
    '红烧肉': {
      id: 1,
      dishName: '红烧肉',
      items: [
        { ingredientId: 101, ingredientName: '五花肉', unit: 'kg', qty: 0.3 },
      ],
    },
  };
  const { demands, missingRecipes } = explodeBom(dishDemand, recipesByDish);
  assert.deepStrictEqual(missingRecipes, []);
  assert.ok(demands[101]);
  assert.strictEqual(demands[101].totalQty, 3);
  assert.strictEqual(demands[101].ingredientName, '五花肉');
});

test('bom.explodeBom: 多菜品多食材汇总', () => {
  const dishDemand = [
    { dishName: '红烧肉', qty: 10 },
    { dishName: '清炒时蔬', qty: 20 },
  ];
  const recipesByDish = {
    '红烧肉': {
      id: 1,
      dishName: '红烧肉',
      items: [
        { ingredientId: 101, ingredientName: '五花肉', unit: 'kg', qty: 0.3 },
        { ingredientId: 102, ingredientName: '酱油', unit: 'L', qty: 0.02 },
      ],
    },
    '清炒时蔬': {
      id: 2,
      dishName: '清炒时蔬',
      items: [
        { ingredientId: 201, ingredientName: '青菜', unit: 'kg', qty: 0.25 },
        { ingredientId: 102, ingredientName: '酱油', unit: 'L', qty: 0.005 },
      ],
    },
  };
  const { demands } = explodeBom(dishDemand, recipesByDish);
  assert.strictEqual(demands[101].totalQty, 3);
  assert.strictEqual(demands[201].totalQty, 5);
  assert.strictEqual(demands[102].totalQty, 0.3);
});

test('bom.explodeBom: 缺少配方的菜品会被记录', () => {
  const dishDemand = [
    { dishName: '红烧肉', qty: 10 },
    { dishName: '未知菜', qty: 5 },
  ];
  const recipesByDish = {
    '红烧肉': {
      id: 1,
      dishName: '红烧肉',
      items: [
        { ingredientId: 101, ingredientName: '五花肉', unit: 'kg', qty: 0.3 },
      ],
    },
  };
  const { demands, missingRecipes } = explodeBom(dishDemand, recipesByDish);
  assert.deepStrictEqual(missingRecipes, ['未知菜']);
  assert.ok(demands[101]);
  assert.strictEqual(demands[101].totalQty, 3);
});

test('bom.calcPurchaseSuggestion: 库存充足时无需采购', () => {
  const demand = { 101: 10 };
  const stock = { 101: 20 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 5, minOrderQty: 0, packageSpec: 1 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].status, 'ENOUGH');
  assert.strictEqual(r[0].suggestOrderQty, 0);
  assert.strictEqual(r[0].shortageQty, 0);
  assert.strictEqual(r[0].requiredPurchase, 0);
});

test('bom.calcPurchaseSuggestion: 库存不足需要采购，不重复叠加', () => {
  const demand = { 101: 10 };
  const stock = { 101: 3 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 5, minOrderQty: 0, packageSpec: 1 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r[0].status, 'NEED_PURCHASE');
  assert.strictEqual(r[0].shortageQty, 7);
  assert.strictEqual(r[0].requiredPurchase, 12);
  assert.strictEqual(r[0].suggestOrderQty, 12);
});

test('bom.calcPurchaseSuggestion: 低于安全库存但满足本次需求', () => {
  const demand = { 101: 5 };
  const stock = { 101: 8 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 5, minOrderQty: 0, packageSpec: 1 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r[0].status, 'BELOW_SAFETY');
  assert.strictEqual(r[0].shortageQty, 0);
  assert.strictEqual(r[0].requiredPurchase, 2);
  assert.strictEqual(r[0].suggestOrderQty, 2);
});

test('bom.calcPurchaseSuggestion: 包装规格取整', () => {
  const demand = { 101: 10 };
  const stock = { 101: 0 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 0, minOrderQty: 0, packageSpec: 3 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r[0].suggestOrderQty, 12);
});

test('bom.calcPurchaseSuggestion: 起订量生效', () => {
  const demand = { 101: 2 };
  const stock = { 101: 0 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 0, minOrderQty: 10, packageSpec: 1 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r[0].suggestOrderQty, 10);
});

test('bom.calcPurchaseSuggestion: 无需求但低于安全库存也建议采购', () => {
  const demand = {};
  const stock = { 101: 2 };
  const ingredients = {
    101: { id: 101, name: '面粉', unit: 'kg', safetyStock: 5, minOrderQty: 0, packageSpec: 1 },
  };
  const r = calcPurchaseSuggestion(demand, stock, ingredients);
  assert.strictEqual(r[0].status, 'BELOW_SAFETY');
  assert.strictEqual(r[0].suggestOrderQty, 3);
});
