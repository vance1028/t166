'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const { canteenId, status, startDate, endDate } = req.query;
    const f = { status, startDate, endDate };
    if (canteenId !== undefined) f.canteenId = Number(canteenId);
    return sendData(res, 200, await store.listStockCounts(f));
  } catch (e) { return next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const sc = await store.getStockCountFull(id);
    if (!sc) return sendError(res, 404, '盘点单不存在');
    return sendData(res, 200, sc);
  } catch (e) { return next(e); }
});

router.post('/', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { canteenId, countDate, remark } = req.body || {};
    if (!canteenId || !countDate) return sendError(res, 400, '助餐点和盘点日期不能为空');
    if (!(await store.getCanteenById(Number(canteenId)))) return sendError(res, 400, '助餐点不存在');
    const sc = await store.createStockCount(Number(canteenId), countDate, remark || '');
    return sendData(res, 201, sc);
  } catch (e) { return next(e); }
});

router.put('/items/:itemId', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const itemId = parseId(req.params.itemId);
    const { actualQty, remark } = req.body || {};
    if (actualQty === undefined) return sendError(res, 400, '实盘数量不能为空');
    const result = await store.updateStockCountItem(itemId, Number(actualQty), remark || '');
    if (!result) return sendError(res, 404, '盘点明细不存在或已确认');
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

router.post('/:id/confirm', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getStockCountById(id))) return sendError(res, 404, '盘点单不存在');
    const result = await store.confirmStockCount(id);
    if (!result) return sendError(res, 404, '盘点单不存在');
    if (result.error) return sendError(res, 409, result.error);
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

module.exports = router;
