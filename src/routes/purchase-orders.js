'use strict';

const express = require('express');
const store = require('../data/store');
const { getPool } = require('../db');
const { authRequired, requireRole } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const { canteenId, status, startDate, endDate, keyword } = req.query;
    const f = { status, startDate, endDate, keyword };
    if (canteenId !== undefined) f.canteenId = Number(canteenId);
    return sendData(res, 200, await store.listPurchaseOrders(f));
  } catch (e) { return next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const po = await store.getPurchaseOrderFull(id);
    if (!po) return sendError(res, 404, '采购单不存在');
    return sendData(res, 200, po);
  } catch (e) { return next(e); }
});

router.post('/', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { canteenId, orderDate, items } = req.body || {};
    if (!canteenId || !orderDate || !items || !items.length) {
      return sendError(res, 400, '助餐点、采购日期、明细不能为空');
    }
    if (!(await store.getCanteenById(Number(canteenId)))) {
      return sendError(res, 400, '助餐点不存在');
    }
    const po = await store.createPurchaseOrder({
      canteenId: Number(canteenId),
      orderDate,
      expectedDate: req.body.expectedDate,
      remark: req.body.remark,
      items,
    });
    return sendData(res, 201, po);
  } catch (e) { return next(e); }
});

router.post('/from-suggestion', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { canteenId, serveDate, expectedDate, remark } = req.body || {};
    if (!canteenId || !serveDate) {
      return sendError(res, 400, '助餐点和供应日期不能为空');
    }
    if (!(await store.getCanteenById(Number(canteenId)))) {
      return sendError(res, 400, '助餐点不存在');
    }
    const po = await store.createPurchaseOrderFromSuggestion({
      canteenId: Number(canteenId),
      serveDate,
      expectedDate,
      remark,
    });
    return sendData(res, 201, po);
  } catch (e) { return next(e); }
});

router.post('/:id/submit', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const po = await store.getPurchaseOrderById(id);
    if (!po) return sendError(res, 404, '采购单不存在');
    if (po.status !== 'DRAFT') return sendError(res, 409, '只有草稿状态可以提交');
    const result = await store.updatePurchaseOrderStatus(id, 'ORDERED');
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

router.post('/items/:itemId/receive', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const itemId = parseId(req.params.itemId);
    const { qty, batchNo, expireDate, remark } = req.body || {};
    if (!qty) return sendError(res, 400, '收货数量不能为空');
    const result = await store.receivePurchaseItem(itemId, {
      qty: Number(qty),
      batchNo,
      expireDate,
      remark,
    });
    if (!result) return sendError(res, 404, '采购明细不存在');
    if (result.error) return sendError(res, 409, result.error);
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const po = await store.getPurchaseOrderById(id);
    if (!po) return sendError(res, 404, '采购单不存在');
    if (po.status !== 'DRAFT') return sendError(res, 409, '只能删除草稿状态的采购单');
    await getPool().query('DELETE FROM purchase_orders WHERE id=?', [id]);
    return sendData(res, 200, { id });
  } catch (e) { return next(e); }
});

module.exports = router;
