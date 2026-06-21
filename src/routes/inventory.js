'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();
router.use(authRequired);

/* ----- 库存批次 ----- */
router.get('/batches', async (req, res, next) => {
  try {
    const { canteenId, ingredientId, status, keyword } = req.query;
    const f = { status, keyword };
    if (canteenId !== undefined) f.canteenId = Number(canteenId);
    if (ingredientId !== undefined) f.ingredientId = Number(ingredientId);
    return sendData(res, 200, await store.listStockBatches(f));
  } catch (e) { return next(e); }
});

router.get('/batches/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const b = await store.getStockBatchById(id);
    if (!b) return sendError(res, 404, '批次不存在');
    return sendData(res, 200, b);
  } catch (e) { return next(e); }
});

/* ----- 入库 ----- */
router.post('/in', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { canteenId, ingredientId, batchNo, qty, inDate, expireDate, unitPriceCents, remark } = req.body || {};
    if (!canteenId || !ingredientId || !batchNo || !qty || !inDate) {
      return sendError(res, 400, '助餐点、食材、批次号、数量、入库日期不能为空');
    }
    if (!(await store.getCanteenById(Number(canteenId)))) return sendError(res, 400, '助餐点不存在');
    if (!(await store.getIngredientById(Number(ingredientId)))) return sendError(res, 400, '食材不存在');
    const batch = await store.stockIn({
      canteenId: Number(canteenId),
      ingredientId: Number(ingredientId),
      batchNo,
      qty: Number(qty),
      inDate,
      expireDate: expireDate || null,
      unitPriceCents: Number(unitPriceCents) || 0,
      remark: remark || '',
    });
    return sendData(res, 201, batch);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return sendError(res, 409, '该助餐点下批次号已存在');
    return next(e);
  }
});

/* ----- 出库（备餐消耗）----- */
router.post('/out', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { canteenId, ingredientId, qty, refType, refId, remark } = req.body || {};
    if (!canteenId || !ingredientId || !qty) {
      return sendError(res, 400, '助餐点、食材、出库数量不能为空');
    }
    const q = Number(qty);
    if (q <= 0) return sendError(res, 400, '出库数量必须大于 0');
    if (!(await store.getCanteenById(Number(canteenId)))) return sendError(res, 400, '助餐点不存在');
    if (!(await store.getIngredientById(Number(ingredientId)))) return sendError(res, 400, '食材不存在');

    const result = await store.stockOut({
      canteenId: Number(canteenId),
      ingredientId: Number(ingredientId),
      qty: q,
      refType: refType || 'CONSUME',
      refId: refId ? Number(refId) : null,
      remark: remark || '',
      today: new Date(),
    });

    if (!result.success) {
      return sendError(res, 409, `库存不足，还差 ${result.remainingNeed} 单位`);
    }
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

/* ----- 出入库流水 ----- */
router.get('/movements', async (req, res, next) => {
  try {
    const { canteenId, ingredientId, batchId, type, startDate, endDate } = req.query;
    const f = { type, startDate, endDate };
    if (canteenId !== undefined) f.canteenId = Number(canteenId);
    if (ingredientId !== undefined) f.ingredientId = Number(ingredientId);
    if (batchId !== undefined) f.batchId = Number(batchId);
    return sendData(res, 200, await store.listStockMovements(f));
  } catch (e) { return next(e); }
});

/* ----- 库存汇总 ----- */
router.get('/summary', async (req, res, next) => {
  try {
    const { canteenId, ingredientId } = req.query;
    if (!canteenId) return sendError(res, 400, '助餐点不能为空');
    const opts = {};
    if (ingredientId !== undefined) opts.ingredientId = Number(ingredientId);
    return sendData(res, 200, await store.getStockSummaryByCanteen(Number(canteenId), opts));
  } catch (e) { return next(e); }
});

/* ----- 临期过期预警 ----- */
router.get('/warnings', async (req, res, next) => {
  try {
    const { canteenId, warningDays, ingredientId } = req.query;
    if (!canteenId) return sendError(res, 400, '助餐点不能为空');
    const days = warningDays !== undefined ? Number(warningDays) : 7;
    const iid = ingredientId !== undefined ? Number(ingredientId) : undefined;
    return sendData(res, 200, await store.getExpiryWarnings(Number(canteenId), days, iid));
  } catch (e) { return next(e); }
});

/* ----- BOM 食材需求测算 ----- */
router.get('/demand', async (req, res, next) => {
  try {
    const { canteenId, serveDate } = req.query;
    if (!canteenId || !serveDate) return sendError(res, 400, '助餐点和供应日期不能为空');
    const result = await store.calcDemandByDate(Number(canteenId), serveDate);
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

/* ----- 采购建议 ----- */
router.get('/purchase-suggestion', async (req, res, next) => {
  try {
    const { canteenId, serveDate } = req.query;
    if (!canteenId || !serveDate) return sendError(res, 400, '助餐点和供应日期不能为空');
    const result = await store.calcPurchaseSuggestion(Number(canteenId), serveDate);
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

module.exports = router;
