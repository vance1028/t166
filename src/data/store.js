'use strict';

const { getPool } = require('../db');
const { hashPassword } = require('../utils/password');
const bomLogic = require('../logic/bom');
const invLogic = require('../logic/inventory');

/** 数据仓储层：SQL 集中此处，路由层只调用这些 async 方法，对外返回 camelCase。 */

/* ----------------------------- 映射 ----------------------------- */
function mapUser(r) {
  if (!r) return null;
  return { id: r.id, username: r.username, name: r.name, role: r.role, status: r.status, createdAt: r.created_at };
}
function mapUserWithHash(r) { return r ? { ...mapUser(r), passwordHash: r.password_hash } : null; }
function mapCanteen(r) {
  if (!r) return null;
  return { id: r.id, code: r.code, name: r.name, district: r.district, address: r.address, capacity: r.capacity, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapElder(r) {
  if (!r) return null;
  return { id: r.id, code: r.code, name: r.name, gender: r.gender, age: r.age, phone: r.phone, subsidyLevel: r.subsidy_level, dietary: r.dietary, canteenId: r.canteen_id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapMeal(r) {
  if (!r) return null;
  return { id: r.id, canteenId: r.canteen_id, serveDate: r.serve_date, mealType: r.meal_type, dishName: r.dish_name, priceCents: r.price_cents, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapOrder(r) {
  if (!r) return null;
  return { id: r.id, elderId: r.elder_id, mealId: r.meal_id, diningType: r.dining_type, qty: r.qty, amountCents: r.amount_cents, subsidyCents: r.subsidy_cents, payCents: r.pay_cents, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapIngredient(r) {
  if (!r) return null;
  return { id: r.id, code: r.code, name: r.name, category: r.category, unit: r.unit, safetyStock: Number(r.safety_stock), minOrderQty: Number(r.min_order_qty), packageSpec: Number(r.package_spec), status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapRecipe(r) {
  if (!r) return null;
  return { id: r.id, dishName: r.dish_name, description: r.description, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapRecipeItem(r) {
  if (!r) return null;
  return { id: r.id, recipeId: r.recipe_id, ingredientId: r.ingredient_id, qty: Number(r.qty), createdAt: r.created_at };
}
function mapStockBatch(r) {
  if (!r) return null;
  return { id: r.id, canteenId: r.canteen_id, ingredientId: r.ingredient_id, batchNo: r.batch_no, totalQty: Number(r.total_qty), remainingQty: Number(r.remaining_qty), inDate: r.in_date, expireDate: r.expire_date, unitPriceCents: r.unit_price_cents, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapStockMovement(r) {
  if (!r) return null;
  return { id: r.id, canteenId: r.canteen_id, ingredientId: r.ingredient_id, batchId: r.batch_id, type: r.type, qty: Number(r.qty), balanceAfter: Number(r.balance_after), unitPriceCents: r.unit_price_cents, refType: r.ref_type, refId: r.ref_id, remark: r.remark, createdAt: r.created_at };
}
function mapStockCount(r) {
  if (!r) return null;
  return { id: r.id, canteenId: r.canteen_id, countDate: r.count_date, status: r.status, remark: r.remark, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapStockCountItem(r) {
  if (!r) return null;
  return { id: r.id, countId: r.count_id, ingredientId: r.ingredient_id, theoreticalQty: Number(r.theoretical_qty), actualQty: Number(r.actual_qty), diffQty: Number(r.diff_qty), unitPriceCents: r.unit_price_cents, diffAmountCents: r.diff_amount_cents, remark: r.remark };
}

/* ----------------------------- 用户 ----------------------------- */
async function getUserByUsername(u) { const [r] = await getPool().query('SELECT * FROM users WHERE username=?', [u]); return mapUserWithHash(r[0]); }
async function getUserById(id) { const [r] = await getPool().query('SELECT * FROM users WHERE id=?', [id]); return mapUser(r[0]); }
async function listUsers() { const [r] = await getPool().query('SELECT * FROM users ORDER BY id'); return r.map(mapUser); }
async function createUser({ username, password, name, role = 'VIEWER', status = 'ACTIVE' }) {
  const [x] = await getPool().query('INSERT INTO users (username,password_hash,name,role,status) VALUES (?,?,?,?,?)', [username, hashPassword(password), name, role, status]);
  return getUserById(x.insertId);
}
async function updateUser(id, f) {
  const sets = []; const p = [];
  for (const [k, col] of Object.entries({ name: 'name', role: 'role', status: 'status' })) if (f[k] !== undefined) { sets.push(`${col}=?`); p.push(f[k]); }
  if (f.password !== undefined) { sets.push('password_hash=?'); p.push(hashPassword(f.password)); }
  if (sets.length) { p.push(id); await getPool().query(`UPDATE users SET ${sets.join(',')} WHERE id=?`, p); }
  return getUserById(id);
}
async function deleteUser(id) { const [x] = await getPool().query('DELETE FROM users WHERE id=?', [id]); return x.affectedRows > 0; }
async function countUsers() { const [r] = await getPool().query('SELECT COUNT(*) AS n FROM users'); return r[0].n; }

/* ----------------------------- 助餐点 ----------------------------- */
async function listCanteens({ district, status, keyword } = {}) {
  const w = []; const p = [];
  if (district) { w.push('district=?'); p.push(district); }
  if (status) { w.push('status=?'); p.push(status); }
  if (keyword) { w.push('(code LIKE ? OR name LIKE ?)'); const k = `%${keyword}%`; p.push(k, k); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM canteens ${c} ORDER BY id DESC`, p); return r.map(mapCanteen);
}
async function getCanteenById(id) { const [r] = await getPool().query('SELECT * FROM canteens WHERE id=?', [id]); return mapCanteen(r[0]); }
async function getCanteenByCode(code) { const [r] = await getPool().query('SELECT * FROM canteens WHERE code=?', [code]); return mapCanteen(r[0]); }
async function createCanteen(d) {
  const [x] = await getPool().query('INSERT INTO canteens (code,name,district,address,capacity,status) VALUES (?,?,?,?,?,?)', [d.code, d.name, d.district, d.address || '', d.capacity || 0, d.status || 'OPEN']);
  return getCanteenById(x.insertId);
}
async function updateCanteen(id, d) {
  const sets = []; const p = [];
  for (const [k, col] of Object.entries({ name: 'name', district: 'district', address: 'address', capacity: 'capacity', status: 'status' })) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE canteens SET ${sets.join(',')} WHERE id=?`, p); }
  return getCanteenById(id);
}
async function deleteCanteen(id) { const [x] = await getPool().query('DELETE FROM canteens WHERE id=?', [id]); return x.affectedRows > 0; }

/* ----------------------------- 长者 ----------------------------- */
async function listElders({ canteenId, subsidyLevel, status, keyword } = {}) {
  const w = []; const p = [];
  if (canteenId !== undefined) { w.push('canteen_id=?'); p.push(canteenId); }
  if (subsidyLevel) { w.push('subsidy_level=?'); p.push(subsidyLevel); }
  if (status) { w.push('status=?'); p.push(status); }
  if (keyword) { w.push('(code LIKE ? OR name LIKE ? OR phone LIKE ?)'); const k = `%${keyword}%`; p.push(k, k, k); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM elders ${c} ORDER BY id DESC`, p); return r.map(mapElder);
}
async function getElderById(id) { const [r] = await getPool().query('SELECT * FROM elders WHERE id=?', [id]); return mapElder(r[0]); }
async function getElderByCode(code) { const [r] = await getPool().query('SELECT * FROM elders WHERE code=?', [code]); return mapElder(r[0]); }
async function createElder(d) {
  const [x] = await getPool().query('INSERT INTO elders (code,name,gender,age,phone,subsidy_level,dietary,canteen_id,status) VALUES (?,?,?,?,?,?,?,?,?)',
    [d.code, d.name, d.gender || 'U', d.age || 0, d.phone || '', d.subsidyLevel || 'C', d.dietary || '', d.canteenId ?? null, d.status || 'ACTIVE']);
  return getElderById(x.insertId);
}
async function updateElder(id, d) {
  const map = { name: 'name', gender: 'gender', age: 'age', phone: 'phone', subsidyLevel: 'subsidy_level', dietary: 'dietary', canteenId: 'canteen_id', status: 'status' };
  const sets = []; const p = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE elders SET ${sets.join(',')} WHERE id=?`, p); }
  return getElderById(id);
}
async function deleteElder(id) { const [x] = await getPool().query('DELETE FROM elders WHERE id=?', [id]); return x.affectedRows > 0; }

/* ----------------------------- 餐次 ----------------------------- */
async function listMeals({ canteenId, serveDate, mealType, status } = {}) {
  const w = []; const p = [];
  if (canteenId !== undefined) { w.push('canteen_id=?'); p.push(canteenId); }
  if (serveDate) { w.push('serve_date=?'); p.push(serveDate); }
  if (mealType) { w.push('meal_type=?'); p.push(mealType); }
  if (status) { w.push('status=?'); p.push(status); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM meals ${c} ORDER BY serve_date DESC, id DESC`, p); return r.map(mapMeal);
}
async function getMealById(id) { const [r] = await getPool().query('SELECT * FROM meals WHERE id=?', [id]); return mapMeal(r[0]); }
async function createMeal(d) {
  const [x] = await getPool().query('INSERT INTO meals (canteen_id,serve_date,meal_type,dish_name,price_cents,status) VALUES (?,?,?,?,?,?)',
    [d.canteenId, d.serveDate, d.mealType || 'LUNCH', d.dishName, d.priceCents || 0, d.status || 'PUBLISHED']);
  return getMealById(x.insertId);
}
async function updateMeal(id, d) {
  const map = { serveDate: 'serve_date', mealType: 'meal_type', dishName: 'dish_name', priceCents: 'price_cents', status: 'status' };
  const sets = []; const p = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE meals SET ${sets.join(',')} WHERE id=?`, p); }
  return getMealById(id);
}
async function deleteMeal(id) { const [x] = await getPool().query('DELETE FROM meals WHERE id=?', [id]); return x.affectedRows > 0; }

/* ----------------------------- 订餐 ----------------------------- */
async function listOrders({ elderId, mealId, status } = {}) {
  const w = []; const p = [];
  if (elderId !== undefined) { w.push('elder_id=?'); p.push(elderId); }
  if (mealId !== undefined) { w.push('meal_id=?'); p.push(mealId); }
  if (status) { w.push('status=?'); p.push(status); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM orders ${c} ORDER BY id DESC`, p); return r.map(mapOrder);
}
async function getOrderById(id) { const [r] = await getPool().query('SELECT * FROM orders WHERE id=?', [id]); return mapOrder(r[0]); }
async function createOrder(d) {
  const [x] = await getPool().query('INSERT INTO orders (elder_id,meal_id,dining_type,qty,amount_cents,subsidy_cents,pay_cents,status) VALUES (?,?,?,?,?,?,?,?)',
    [d.elderId, d.mealId, d.diningType || 'DINE_IN', d.qty || 1, d.amountCents || 0, d.subsidyCents || 0, d.payCents || 0, d.status || 'RESERVED']);
  return getOrderById(x.insertId);
}
async function updateOrder(id, d) {
  const map = { diningType: 'dining_type', qty: 'qty', amountCents: 'amount_cents', subsidyCents: 'subsidy_cents', payCents: 'pay_cents', status: 'status' };
  const sets = []; const p = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE orders SET ${sets.join(',')} WHERE id=?`, p); }
  return getOrderById(id);
}

/* ----------------------------- 食材 ----------------------------- */
async function listIngredients({ category, status, keyword } = {}) {
  const w = []; const p = [];
  if (category) { w.push('category=?'); p.push(category); }
  if (status) { w.push('status=?'); p.push(status); }
  if (keyword) { w.push('(code LIKE ? OR name LIKE ?)'); const k = `%${keyword}%`; p.push(k, k); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM ingredients ${c} ORDER BY id DESC`, p);
  return r.map(mapIngredient);
}
async function getIngredientById(id) {
  const [r] = await getPool().query('SELECT * FROM ingredients WHERE id=?', [id]);
  return mapIngredient(r[0]);
}
async function getIngredientByCode(code) {
  const [r] = await getPool().query('SELECT * FROM ingredients WHERE code=?', [code]);
  return mapIngredient(r[0]);
}
async function createIngredient(d) {
  const [x] = await getPool().query(
    'INSERT INTO ingredients (code,name,category,unit,safety_stock,min_order_qty,package_spec,status) VALUES (?,?,?,?,?,?,?,?)',
    [d.code, d.name, d.category || 'OTHER', d.unit, d.safetyStock || 0, d.minOrderQty || 0, d.packageSpec || 1, d.status || 'ACTIVE']
  );
  return getIngredientById(x.insertId);
}
async function updateIngredient(id, d) {
  const map = { name: 'name', category: 'category', unit: 'unit', safetyStock: 'safety_stock', minOrderQty: 'min_order_qty', packageSpec: 'package_spec', status: 'status' };
  const sets = []; const p = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE ingredients SET ${sets.join(',')} WHERE id=?`, p); }
  return getIngredientById(id);
}
async function deleteIngredient(id) {
  const [x] = await getPool().query('DELETE FROM ingredients WHERE id=?', [id]);
  return x.affectedRows > 0;
}

/* ----------------------------- 配方 ----------------------------- */
async function listRecipes({ status, keyword } = {}) {
  const w = []; const p = [];
  if (status) { w.push('status=?'); p.push(status); }
  if (keyword) { w.push('dish_name LIKE ?'); p.push(`%${keyword}%`); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM recipes ${c} ORDER BY id DESC`, p);
  return r.map(mapRecipe);
}
async function getRecipeById(id) {
  const [r] = await getPool().query('SELECT * FROM recipes WHERE id=?', [id]);
  return mapRecipe(r[0]);
}
async function getRecipeByDishName(dishName) {
  const [r] = await getPool().query('SELECT * FROM recipes WHERE dish_name=?', [dishName]);
  return mapRecipe(r[0]);
}
async function createRecipe(d) {
  const [x] = await getPool().query(
    'INSERT INTO recipes (dish_name,description,status) VALUES (?,?,?)',
    [d.dishName, d.description || '', d.status || 'ACTIVE']
  );
  return getRecipeById(x.insertId);
}
async function updateRecipe(id, d) {
  const map = { dishName: 'dish_name', description: 'description', status: 'status' };
  const sets = []; const p = [];
  for (const [k, col] of Object.entries(map)) if (d[k] !== undefined) { sets.push(`${col}=?`); p.push(d[k]); }
  if (sets.length) { sets.push('updated_at=CURRENT_TIMESTAMP(3)'); p.push(id); await getPool().query(`UPDATE recipes SET ${sets.join(',')} WHERE id=?`, p); }
  return getRecipeById(id);
}
async function deleteRecipe(id) {
  const [x] = await getPool().query('DELETE FROM recipes WHERE id=?', [id]);
  return x.affectedRows > 0;
}

/* ----- 配方明细 ----- */
async function listRecipeItems(recipeId) {
  const [r] = await getPool().query(
    `SELECT ri.*, i.name AS ingredient_name, i.unit AS unit
     FROM recipe_items ri
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id=?
     ORDER BY ri.id`,
    [recipeId]
  );
  return r.map(row => ({ ...mapRecipeItem(row), ingredientName: row.ingredient_name, unit: row.unit }));
}
async function addRecipeItem(recipeId, d) {
  await getPool().query(
    'INSERT INTO recipe_items (recipe_id,ingredient_id,qty) VALUES (?,?,?)',
    [recipeId, d.ingredientId, d.qty]
  );
  return listRecipeItems(recipeId);
}
async function updateRecipeItem(itemId, d) {
  const sets = []; const p = [];
  if (d.qty !== undefined) { sets.push('qty=?'); p.push(d.qty); }
  if (!sets.length) return null;
  const [[row]] = await getPool().query('SELECT recipe_id FROM recipe_items WHERE id=?', [itemId]);
  if (!row) return null;
  p.push(itemId);
  await getPool().query(`UPDATE recipe_items SET ${sets.join(',')} WHERE id=?`, p);
  return listRecipeItems(row.recipe_id);
}
async function deleteRecipeItem(itemId) {
  const [[row]] = await getPool().query('SELECT recipe_id FROM recipe_items WHERE id=?', [itemId]);
  if (!row) return false;
  const [x] = await getPool().query('DELETE FROM recipe_items WHERE id=?', [itemId]);
  return x.affectedRows > 0;
}
async function getRecipeFull(id) {
  const recipe = await getRecipeById(id);
  if (!recipe) return null;
  const items = await listRecipeItems(id);
  return { ...recipe, items };
}

/** 批量获取多个菜品的完整配方（用于 BOM 拆解） */
async function getRecipesFullByDishNames(dishNames) {
  if (!dishNames || !dishNames.length) return {};
  const placeholders = dishNames.map(() => '?').join(',');
  const [recipes] = await getPool().query(
    `SELECT * FROM recipes WHERE dish_name IN (${placeholders}) AND status='ACTIVE'`,
    dishNames
  );
  if (!recipes.length) return {};
  const recipeIds = recipes.map(r => r.id);
  const placeholders2 = recipeIds.map(() => '?').join(',');
  const [items] = await getPool().query(
    `SELECT ri.*, i.name AS ingredient_name, i.unit AS unit
     FROM recipe_items ri
     LEFT JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id IN (${placeholders2})`,
    recipeIds
  );
  const result = {};
  for (const r of recipes) {
    result[r.dish_name] = { id: r.id, dishName: r.dish_name, items: [] };
  }
  for (const it of items) {
    const recipe = recipes.find(r => r.id === it.recipe_id);
    if (recipe && result[recipe.dish_name]) {
      result[recipe.dish_name].items.push({
        ingredientId: it.ingredient_id,
        ingredientName: it.ingredient_name,
        unit: it.unit,
        qty: Number(it.qty),
      });
    }
  }
  return result;
}

/* ----------------------------- 库存批次 ----------------------------- */
async function listStockBatches({ canteenId, ingredientId, status, keyword } = {}) {
  const w = []; const p = [];
  if (canteenId !== undefined) { w.push('b.canteen_id=?'); p.push(canteenId); }
  if (ingredientId !== undefined) { w.push('b.ingredient_id=?'); p.push(ingredientId); }
  if (status) { w.push('b.status=?'); p.push(status); }
  if (keyword) { w.push('(b.batch_no LIKE ? OR i.name LIKE ?)'); const k = `%${keyword}%`; p.push(k, k); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(
    `SELECT b.*, i.name AS ingredient_name, i.unit AS unit
     FROM stock_batches b
     LEFT JOIN ingredients i ON i.id = b.ingredient_id
     ${c}
     ORDER BY b.id DESC`,
    p
  );
  return r.map(row => ({ ...mapStockBatch(row), ingredientName: row.ingredient_name, unit: row.unit }));
}
async function getStockBatchById(id) {
  const [r] = await getPool().query(
    `SELECT b.*, i.name AS ingredient_name, i.unit AS unit
     FROM stock_batches b
     LEFT JOIN ingredients i ON i.id = b.ingredient_id
     WHERE b.id=?`,
    [id]
  );
  if (!r[0]) return null;
  return { ...mapStockBatch(r[0]), ingredientName: r[0].ingredient_name, unit: r[0].unit };
}
async function getBatchesByIngredient(canteenId, ingredientId) {
  const [r] = await getPool().query(
    `SELECT * FROM stock_batches
     WHERE canteen_id=? AND ingredient_id=? AND status='IN_STOCK' AND remaining_qty > 0
     ORDER BY expire_date IS NULL, expire_date ASC, id ASC`,
    [canteenId, ingredientId]
  );
  return r.map(mapStockBatch);
}

/** 入库：创建批次 + 写入入库流水（事务） */
async function stockIn({ canteenId, ingredientId, batchNo, qty, inDate, expireDate, unitPriceCents, remark = '' }) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [x] = await conn.query(
      'INSERT INTO stock_batches (canteen_id,ingredient_id,batch_no,total_qty,remaining_qty,in_date,expire_date,unit_price_cents,status) VALUES (?,?,?,?,?,?,?,?,?)',
      [canteenId, ingredientId, batchNo, qty, qty, inDate, expireDate || null, unitPriceCents || 0, 'IN_STOCK']
    );
    const batchId = x.insertId;
    const [sum] = await conn.query(
      'SELECT COALESCE(SUM(remaining_qty), 0) AS total FROM stock_batches WHERE canteen_id=? AND ingredient_id=? AND status=?',
      [canteenId, ingredientId, 'IN_STOCK']
    );
    const balanceAfter = Number(sum[0].total);
    await conn.query(
      'INSERT INTO stock_movements (canteen_id,ingredient_id,batch_id,type,qty,balance_after,unit_price_cents,ref_type,remark) VALUES (?,?,?,?,?,?,?,?,?)',
      [canteenId, ingredientId, batchId, 'IN', qty, balanceAfter, unitPriceCents || 0, 'STOCK_IN', remark]
    );
    await conn.commit();
    return getStockBatchById(batchId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ----------------------------- 出入库流水 ----------------------------- */
async function listStockMovements({ canteenId, ingredientId, batchId, type, startDate, endDate } = {}) {
  const w = []; const p = [];
  if (canteenId !== undefined) { w.push('canteen_id=?'); p.push(canteenId); }
  if (ingredientId !== undefined) { w.push('ingredient_id=?'); p.push(ingredientId); }
  if (batchId !== undefined) { w.push('batch_id=?'); p.push(batchId); }
  if (type) { w.push('type=?'); p.push(type); }
  if (startDate) { w.push('DATE(created_at) >= ?'); p.push(startDate); }
  if (endDate) { w.push('DATE(created_at) <= ?'); p.push(endDate); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM stock_movements ${c} ORDER BY id DESC`, p);
  return r.map(mapStockMovement);
}

/* ----------------------------- FIFO 出库 ----------------------------- */
/**
 * 出库（备餐消耗）：按 FEFO 先进先出扣减批次
 * 一笔消耗可跨多个批次，生成多条出库流水
 */
async function stockOut({ canteenId, ingredientId, qty, refType = 'CONSUME', refId = null, remark = '', today = null }) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [batchesRaw] = await conn.query(
      `SELECT * FROM stock_batches
       WHERE canteen_id=? AND ingredient_id=? AND status='IN_STOCK' AND remaining_qty > 0
       ORDER BY expire_date IS NULL, expire_date ASC, id ASC
       FOR UPDATE`,
      [canteenId, ingredientId]
    );
    const batches = batchesRaw.map(mapStockBatch);
    const result = invLogic.fifoDeduct(batches, qty, today);

    if (!result.success && result.totalDeducted === 0) {
      await conn.rollback();
      return { success: false, deductions: [], totalCostCents: 0, remainingNeed: qty, reason: '库存不足' };
    }

    for (const ded of result.deductions) {
      const ub = result.updatedBatches.find(b => b.id === ded.batchId);
      await conn.query(
        'UPDATE stock_batches SET remaining_qty=?, status=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
        [ub.remainingQty, ub.status, ded.batchId]
      );
    }

    const [sumRow] = await conn.query(
      'SELECT COALESCE(SUM(remaining_qty), 0) AS total FROM stock_batches WHERE canteen_id=? AND ingredient_id=? AND status=?',
      [canteenId, ingredientId, 'IN_STOCK']
    );
    let runningBalance = Number(sumRow[0].total);

    for (let i = result.deductions.length - 1; i >= 0; i -= 1) {
      const ded = result.deductions[i];
      runningBalance = Math.max(0, runningBalance);
      await conn.query(
        'INSERT INTO stock_movements (canteen_id,ingredient_id,batch_id,type,qty,balance_after,unit_price_cents,ref_type,ref_id,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [canteenId, ingredientId, ded.batchId, 'OUT', -ded.qty, runningBalance, ded.unitPriceCents, refType, refId, remark]
      );
      runningBalance += ded.qty;
    }

    await conn.commit();
    return {
      success: result.success,
      deductions: result.deductions,
      totalDeducted: result.totalDeducted,
      totalCostCents: result.totalCostCents,
      remainingNeed: result.remainingNeed,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ----------------------------- 库存汇总 ----------------------------- */
async function getStockSummaryByCanteen(canteenId, { ingredientId } = {}) {
  const w = ['b.canteen_id=?', 'b.status=?'];
  const p = [canteenId, 'IN_STOCK'];
  if (ingredientId !== undefined) { w.push('b.ingredient_id=?'); p.push(ingredientId); }
  const c = `WHERE ${w.join(' AND ')}`;
  const [r] = await getPool().query(
    `SELECT b.ingredient_id, i.name AS ingredient_name, i.unit AS unit,
            SUM(b.remaining_qty) AS total_qty,
            COUNT(b.id) AS batch_count
     FROM stock_batches b
     LEFT JOIN ingredients i ON i.id = b.ingredient_id
     ${c}
     GROUP BY b.ingredient_id
     HAVING total_qty > 0
     ORDER BY total_qty DESC`,
    p
  );
  return r.map(row => ({
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    unit: row.unit,
    totalQty: Number(row.total_qty),
    batchCount: row.batch_count,
  }));
}

async function getStockQty(canteenId, ingredientId) {
  const [rows] = await getPool().query(
    'SELECT COALESCE(SUM(remaining_qty), 0) AS total FROM stock_batches WHERE canteen_id=? AND ingredient_id=? AND status=?',
    [canteenId, ingredientId, 'IN_STOCK']
  );
  return Number(rows[0].total);
}

/* ----------------------------- 临期过期预警 ----------------------------- */
async function getExpiryWarnings(canteenId, warningDays = 7, ingredientId) {
  const w = ['canteen_id=?', 'status=?', 'remaining_qty > 0'];
  const p = [canteenId, 'IN_STOCK'];
  if (ingredientId !== undefined) { w.push('ingredient_id=?'); p.push(ingredientId); }
  const c = `WHERE ${w.join(' AND ')}`;
  const [r] = await getPool().query(
    `SELECT b.*, i.name AS ingredient_name, i.unit AS unit
     FROM stock_batches b
     LEFT JOIN ingredients i ON i.id = b.ingredient_id
     ${c}
     AND expire_date IS NOT NULL
     ORDER BY expire_date ASC`,
    p
  );
  const batches = r.map(row => {
    const mapped = mapStockBatch(row);
    mapped.ingredientName = row.ingredient_name;
    mapped.unit = row.unit;
    return mapped;
  });
  const result = invLogic.checkExpiry(batches, new Date(), warningDays);
  return {
    expired: result.expired,
    expiringSoon: result.expiringSoon,
    normal: result.normal,
    warningDays,
  };
}

/* ----------------------------- 盘点 ----------------------------- */
async function createStockCount(canteenId, countDate, remark = '') {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [x] = await conn.query(
      'INSERT INTO stock_counts (canteen_id,count_date,status,remark) VALUES (?,?,?,?)',
      [canteenId, countDate, 'DRAFT', remark]
    );
    const countId = x.insertId;

    const [ingRows] = await conn.query(
      `SELECT b.ingredient_id, i.name AS ingredient_name, i.unit AS unit,
              SUM(b.remaining_qty) AS theoretical_qty,
              b.unit_price_cents AS unit_price_cents
       FROM stock_batches b
       LEFT JOIN ingredients i ON i.id = b.ingredient_id
       WHERE b.canteen_id=? AND b.status=?
       GROUP BY b.ingredient_id
       HAVING theoretical_qty > 0`,
      [canteenId, 'IN_STOCK']
    );

    for (const row of ingRows) {
      const tq = Number(row.theoretical_qty) || 0;
      const up = Number(row.unit_price_cents) || 0;
      await conn.query(
        'INSERT INTO stock_count_items (count_id,ingredient_id,theoretical_qty,actual_qty,diff_qty,unit_price_cents,diff_amount_cents) VALUES (?,?,?,?,?,?,?)',
        [countId, row.ingredient_id, tq, tq, 0, up, 0]
      );
    }

    await conn.commit();
    return getStockCountFull(countId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function listStockCounts({ canteenId, status, startDate, endDate } = {}) {
  const w = []; const p = [];
  if (canteenId !== undefined) { w.push('canteen_id=?'); p.push(canteenId); }
  if (status) { w.push('status=?'); p.push(status); }
  if (startDate) { w.push('count_date >= ?'); p.push(startDate); }
  if (endDate) { w.push('count_date <= ?'); p.push(endDate); }
  const c = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const [r] = await getPool().query(`SELECT * FROM stock_counts ${c} ORDER BY id DESC`, p);
  return r.map(mapStockCount);
}

async function getStockCountById(id) {
  const [r] = await getPool().query('SELECT * FROM stock_counts WHERE id=?', [id]);
  return mapStockCount(r[0]);
}

async function getStockCountFull(id) {
  const sc = await getStockCountById(id);
  if (!sc) return null;
  const [items] = await getPool().query(
    `SELECT sci.*, i.name AS ingredient_name, i.unit AS unit
     FROM stock_count_items sci
     LEFT JOIN ingredients i ON i.id = sci.ingredient_id
     WHERE sci.count_id=?
     ORDER BY sci.id`,
    [id]
  );
  return {
    ...sc,
    items: items.map(row => ({
      ...mapStockCountItem(row),
      ingredientName: row.ingredient_name,
      unit: row.unit,
    })),
  };
}

async function updateStockCountItem(itemId, actualQty, remark = '') {
  const [[item]] = await getPool().query('SELECT * FROM stock_count_items WHERE id=?', [itemId]);
  if (!item) return null;
  const [[sc]] = await getPool().query('SELECT * FROM stock_counts WHERE id=?', [item.count_id]);
  if (!sc || sc.status !== 'DRAFT') return null;
  const tq = Number(item.theoretical_qty) || 0;
  const aq = Number(actualQty) || 0;
  const up = Number(item.unit_price_cents) || 0;
  const diff = Math.round((aq - tq) * 100) / 100;
  const diffAmount = Math.round(Math.abs(diff) * up);
  await getPool().query(
    'UPDATE stock_count_items SET actual_qty=?, diff_qty=?, diff_amount_cents=?, remark=? WHERE id=?',
    [aq, diff, diffAmount, remark, itemId]
  );
  return getStockCountFull(item.count_id);
}

async function confirmStockCount(countId) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [[sc]] = await conn.query('SELECT * FROM stock_counts WHERE id=?', [countId]);
    if (!sc) { await conn.rollback(); return null; }
    if (sc.status !== 'DRAFT') {
      await conn.rollback();
      return { error: '该盘点单已确认' };
    }

    const [items] = await conn.query('SELECT * FROM stock_count_items WHERE count_id=?', [countId]);

    for (const item of items) {
      const diff = Number(item.diff_qty) || 0;
      if (Math.abs(diff) < 0.005) continue;
      const iid = item.ingredient_id;
      const cid = sc.canteen_id;
      const up = Number(item.unit_price_cents) || 0;

      if (diff > 0) {
        const [[sumRow]] = await conn.query(
          'SELECT COALESCE(SUM(remaining_qty), 0) AS total FROM stock_batches WHERE canteen_id=? AND ingredient_id=? AND status=?',
          [cid, iid, 'IN_STOCK']
        );
        const balanceAfter = Number(sumRow.total) + diff;
        await conn.query(
          'INSERT INTO stock_movements (canteen_id,ingredient_id,batch_id,type,qty,balance_after,unit_price_cents,ref_type,ref_id,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [cid, iid, null, 'ADJUST_PLUS', diff, balanceAfter, up, 'STOCK_COUNT', countId, '盘盈调整']
        );
      } else {
        const [batchesRaw] = await conn.query(
          `SELECT * FROM stock_batches
           WHERE canteen_id=? AND ingredient_id=? AND status='IN_STOCK' AND remaining_qty > 0
           ORDER BY expire_date IS NULL, expire_date ASC, id ASC
           FOR UPDATE`,
          [cid, iid]
        );
        const batches = batchesRaw.map(mapStockBatch);
        const result = invLogic.fifoDeduct(batches, Math.abs(diff));

        for (const ded of result.deductions) {
          const ub = result.updatedBatches.find(b => b.id === ded.batchId);
          await conn.query(
            'UPDATE stock_batches SET remaining_qty=?, status=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
            [ub.remainingQty, ub.status, ded.batchId]
          );
          const [[sumRow]] = await conn.query(
            'SELECT COALESCE(SUM(remaining_qty), 0) AS total FROM stock_batches WHERE canteen_id=? AND ingredient_id=? AND status=?',
            [cid, iid, 'IN_STOCK']
          );
          await conn.query(
            'INSERT INTO stock_movements (canteen_id,ingredient_id,batch_id,type,qty,balance_after,unit_price_cents,ref_type,ref_id,remark) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [cid, iid, ded.batchId, 'ADJUST_MINUS', -ded.qty, Number(sumRow.total), ded.unitPriceCents, 'STOCK_COUNT', countId, '盘亏调整']
          );
        }
      }
    }

    await conn.query(
      'UPDATE stock_counts SET status=?, updated_at=CURRENT_TIMESTAMP(3) WHERE id=?',
      ['CONFIRMED', countId]
    );

    await conn.commit();
    return getStockCountFull(countId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ----------------------------- BOM 拆解与采购建议 ----------------------------- */
async function calcDemandByDate(canteenId, serveDate) {
  const [rows] = await getPool().query(
    `SELECT m.dish_name, SUM(o.qty) AS total_qty
     FROM orders o
     LEFT JOIN meals m ON m.id = o.meal_id
     WHERE m.canteen_id=? AND m.serve_date=? AND o.status NOT IN ('CANCELLED')
     GROUP BY m.dish_name`,
    [canteenId, serveDate]
  );
  const dishDemand = rows.map(r => ({ dishName: r.dish_name, qty: Number(r.total_qty) || 0 }));
  const dishNames = dishDemand.map(d => d.dishName);
  const recipes = await getRecipesFullByDishNames(dishNames);
  const { demands, missingRecipes } = bomLogic.explodeBom(dishDemand, recipes);
  return { dishDemand, ingredientDemands: demands, missingRecipes };
}

async function calcPurchaseSuggestion(canteenId, serveDate) {
  const { dishDemand, ingredientDemands, missingRecipes } = await calcDemandByDate(canteenId, serveDate);
  const demandMap = {};
  for (const [iid, d] of Object.entries(ingredientDemands)) {
    demandMap[Number(iid)] = d.totalQty;
  }
  const stockList = await getStockSummaryByCanteen(canteenId);
  const stockMap = {};
  for (const s of stockList) {
    stockMap[s.ingredientId] = s.totalQty;
  }
  const ingredients = await listIngredients({ status: 'ACTIVE' });
  const ingMap = {};
  for (const ing of ingredients) {
    ingMap[ing.id] = ing;
  }
  const suggestions = bomLogic.calcPurchaseSuggestion(demandMap, stockMap, ingMap);
  return {
    canteenId,
    serveDate,
    dishDemand,
    suggestions,
    missingRecipes,
  };
}

module.exports = {
  mapUser, mapCanteen, mapElder, mapMeal, mapOrder,
  mapIngredient, mapRecipe, mapRecipeItem, mapStockBatch, mapStockMovement, mapStockCount, mapStockCountItem,
  getUserByUsername, getUserById, listUsers, createUser, updateUser, deleteUser, countUsers,
  listCanteens, getCanteenById, getCanteenByCode, createCanteen, updateCanteen, deleteCanteen,
  listElders, getElderById, getElderByCode, createElder, updateElder, deleteElder,
  listMeals, getMealById, createMeal, updateMeal, deleteMeal,
  listOrders, getOrderById, createOrder, updateOrder,
  listIngredients, getIngredientById, getIngredientByCode, createIngredient, updateIngredient, deleteIngredient,
  listRecipes, getRecipeById, getRecipeByDishName, createRecipe, updateRecipe, deleteRecipe,
  listRecipeItems, addRecipeItem, updateRecipeItem, deleteRecipeItem, getRecipeFull, getRecipesFullByDishNames,
  listStockBatches, getStockBatchById, getBatchesByIngredient, stockIn,
  listStockMovements, stockOut,
  getStockSummaryByCanteen, getStockQty, getExpiryWarnings,
  createStockCount, listStockCounts, getStockCountById, getStockCountFull, updateStockCountItem, confirmStockCount,
  calcDemandByDate, calcPurchaseSuggestion,
};
