'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendData, sendError, parseId } = require('../utils/http');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res, next) => {
  try {
    const { status, keyword } = req.query;
    return sendData(res, 200, await store.listRecipes({ status, keyword }));
  } catch (e) { return next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const r = await store.getRecipeFull(id);
    if (!r) return sendError(res, 404, '配方不存在');
    return sendData(res, 200, r);
  } catch (e) { return next(e); }
});

router.post('/', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const { dishName } = req.body || {};
    if (!dishName) return sendError(res, 400, '菜品名称不能为空');
    if (await store.getRecipeByDishName(dishName)) return sendError(res, 409, '该菜品配方已存在');
    return sendData(res, 201, await store.createRecipe(req.body || {}));
  } catch (e) { return next(e); }
});

router.put('/:id', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getRecipeById(id))) return sendError(res, 404, '配方不存在');
    return sendData(res, 200, await store.updateRecipe(id, req.body || {}));
  } catch (e) { return next(e); }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getRecipeById(id))) return sendError(res, 404, '配方不存在');
    await store.deleteRecipe(id);
    return sendData(res, 200, { id });
  } catch (e) { return next(e); }
});

/* ----- 配方明细 ----- */
router.get('/:id/items', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getRecipeById(id))) return sendError(res, 404, '配方不存在');
    return sendData(res, 200, await store.listRecipeItems(id));
  } catch (e) { return next(e); }
});

router.post('/:id/items', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!(await store.getRecipeById(id))) return sendError(res, 404, '配方不存在');
    const { ingredientId, qty } = req.body || {};
    if (!ingredientId || qty === undefined) return sendError(res, 400, '食材和用量不能为空');
    if (!(await store.getIngredientById(Number(ingredientId)))) return sendError(res, 400, '食材不存在');
    const items = await store.addRecipeItem(id, { ingredientId: Number(ingredientId), qty: Number(qty) });
    return sendData(res, 201, items);
  } catch (e) { return next(e); }
});

router.put('/items/:itemId', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const itemId = parseId(req.params.itemId);
    const { qty } = req.body || {};
    const result = await store.updateRecipeItem(itemId, { qty: Number(qty) });
    if (!result) return sendError(res, 404, '配方明细不存在');
    return sendData(res, 200, result);
  } catch (e) { return next(e); }
});

router.delete('/items/:itemId', requireRole('ADMIN', 'OPERATOR'), async (req, res, next) => {
  try {
    const itemId = parseId(req.params.itemId);
    const ok = await store.deleteRecipeItem(itemId);
    if (!ok) return sendError(res, 404, '配方明细不存在');
    return sendData(res, 200, { id: itemId });
  } catch (e) { return next(e); }
});

module.exports = router;
