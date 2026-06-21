'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const { category, status, keyword } = req.query;
    return sendData(res, 200, await store.listIngredients({ category, status, keyword }));
  } catch (e) { return next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const ing = await store.getIngredientById(id);
    if (!ing) return sendError(res, 404, '食材不存在');
    return sendData(res, 200, ing);
  } catch (e) { return next(e); }
});

router.post('/', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { code, name, unit } = req.body || {};
    if (!code || !name || !unit) return sendError(res, 400, '编码、名称、单位不能为空');
    if (await store.getIngredientByCode(code)) return sendError(res, 409, '食材编码已存在');
    return sendData(res, 201, await store.createIngredient(req.body || {}));
  } catch (e) { return next(e); }
});

router.put('/:id', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getIngredientById(id))) return sendError(res, 404, '食材不存在');
    return sendData(res, 200, await store.updateIngredient(id, req.body || {}));
  } catch (e) { return next(e); }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getIngredientById(id))) return sendError(res, 404, '食材不存在');
    await store.deleteIngredient(id);
    return sendData(res, 200, { id });
  } catch (e) { return next(e); }
});

module.exports = router;
