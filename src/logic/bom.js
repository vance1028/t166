'use strict';

/**
 * BOM 拆解与采购建议纯逻辑模块
 *
 * 核心能力：
 * 1. explodeBom —— 将菜品需求按配方拆解、汇总为食材总需求量
 * 2. calcPurchaseSuggestion —— 结合库存与安全库存，考虑起订量/包装规格取整，输出采购建议
 *
 * 所有函数均为纯函数，不依赖数据库，便于单测与复用。
 */

/**
 * BOM 拆解：将菜品需求按配方汇总为食材需求
 *
 * @param {Array<{dishName: string, qty: number}>} dishDemand 菜品需求列表
 * @param {Object<string, {id: number, dishName: string, items: Array<{ingredientId: number, ingredientName?: string, unit?: string, qty: number}>}>} recipesByDish 按 dishName 索引的配方表
 * @returns {Object<number, {ingredientId: number, ingredientName: string, unit: string, totalQty: number}>} 按 ingredientId 索引的食材总需求
 */
function explodeBom(dishDemand, recipesByDish) {
  const result = {};
  const missing = [];

  for (const { dishName, qty } of dishDemand) {
    const recipe = recipesByDish[dishName];
    if (!recipe) {
      missing.push(dishName);
      continue;
    }
    const portions = Number(qty) || 0;
    if (portions <= 0) continue;

    for (const item of recipe.items) {
      const iid = item.ingredientId;
      const itemQty = Number(item.qty) || 0;
      const subTotal = itemQty * portions;

      if (!result[iid]) {
        result[iid] = {
          ingredientId: iid,
          ingredientName: item.ingredientName || '',
          unit: item.unit || '',
          totalQty: 0,
        };
      }
      result[iid].totalQty = Math.round((result[iid].totalQty + subTotal) * 1000) / 1000;
    }
  }

  return { demands: result, missingRecipes: missing };
}

/**
 * 按包装规格向上取整
 * 例：需要 3.5，包装规格 2，则取整为 4（2 包）
 *
 * @param {number} needed   需要量
 * @param {number} packSpec 每包规格（必须 > 0）
 * @returns {number} 取整后的数量
 */
function roundUpByPack(needed, packSpec) {
  const spec = Number(packSpec) || 1;
  if (spec <= 0) return needed;
  if (needed <= 0) return 0;
  const packs = Math.ceil(needed / spec);
  return packs * spec;
}

/**
 * 计算采购建议
 *
 * @param {Object<number, number>} demandByIngredient  按 ingredientId 的食材需求量
 * @param {Object<number, number>} stockByIngredient   按 ingredientId 的当前库存量
 * @param {Object<number, {id: number, name: string, unit: string, safetyStock: number, minOrderQty: number, packageSpec: number}>} ingredientById 食材主数据
 * @returns {Array<{
 *   ingredientId: number,
 *   name: string,
 *   unit: string,
 *   demandQty: number,
 *   currentStock: number,
 *   safetyStock: number,
 *   shortageQty: number,
 *   rawSuggestQty: number,
 *   suggestOrderQty: number,
 *   packageSpec: number,
 *   minOrderQty: number,
 *   status: 'ENOUGH' | 'BELOW_SAFETY' | 'NEED_PURCHASE'
 * }>} 采购建议列表（仅需采购或低于安全库存的，按短缺程度降序）
 */
function calcPurchaseSuggestion(demandByIngredient, stockByIngredient, ingredientById) {
  const suggestions = [];

  const allIds = new Set([
    ...Object.keys(demandByIngredient).map(Number),
    ...Object.keys(ingredientById).map(Number),
  ]);

  for (const iid of allIds) {
    const ing = ingredientById[iid];
    if (!ing) continue;

    const demandQty = Number(demandByIngredient[iid]) || 0;
    const currentStock = Number(stockByIngredient[iid]) || 0;
    const safetyStock = Number(ing.safetyStock) || 0;
    const minOrderQty = Number(ing.minOrderQty) || 0;
    const packageSpec = Number(ing.packageSpec) || 1;

    const afterConsume = currentStock - demandQty;
    const shortageQty = Math.max(0, demandQty - currentStock);

    const requiredPurchase = Math.max(0, demandQty + safetyStock - currentStock);

    let status = 'ENOUGH';
    if (shortageQty > 0) {
      status = 'NEED_PURCHASE';
    } else if (afterConsume < safetyStock) {
      status = 'BELOW_SAFETY';
    }

    let suggestOrderQty = 0;
    if (status !== 'ENOUGH') {
      const needed = Math.max(requiredPurchase, minOrderQty);
      suggestOrderQty = roundUpByPack(needed, packageSpec);
    }

    suggestions.push({
      ingredientId: iid,
      name: ing.name,
      unit: ing.unit,
      demandQty,
      currentStock,
      safetyStock,
      afterConsume,
      shortageQty,
      requiredPurchase,
      suggestOrderQty,
      packageSpec,
      minOrderQty,
      status,
    });
  }

  suggestions.sort((a, b) => b.shortageQty - a.shortageQty);
  return suggestions;
}

module.exports = {
  explodeBom,
  calcPurchaseSuggestion,
  roundUpByPack,
};
