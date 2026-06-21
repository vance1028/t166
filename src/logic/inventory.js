'use strict';

/**
 * 库存批次纯逻辑模块
 *
 * 核心能力：
 * 1. fifoDeduct      —— 先进先出（FIFO）跨批次精确扣减 + 成本分摊
 * 2. checkExpiry     —— 临期/过期批次预警与分类
 * 3. calcStockSummary —— 汇总某食材的库存总量与加权平均成本
 *
 * 所有函数均为纯函数，不依赖数据库。
 */

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t;
}

function daysBetween(a, b) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * 按"快到期优先"排序批次（FEFO — First Expired, First Out）。
 * 无过期日的批次排在最后；同为无过期日的按入库顺序（id 升序）。
 *
 * @param {Array} batches
 * @returns {Array} 排序后的批次
 */
function sortByExpiryAsc(batches) {
  return [...batches].sort((a, b) => {
    const ea = parseDate(a.expireDate);
    const eb = parseDate(b.expireDate);
    if (ea && eb) return ea.getTime() - eb.getTime();
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    return (a.id || 0) - (b.id || 0);
  });
}

/**
 * FIFO/FEFO 跨批次扣减
 *
 * 规则：
 *  - 优先扣快到期的批次（FEFO）
 *  - 只扣 IN_STOCK 状态且未过期的批次
 *  - 库存不足时返回 success=false，并给出已扣部分
 *  - 成本按各批次实际扣减量 × 单价分摊
 *
 * @param {Array<{
 *   id: number,
 *   batchNo: string,
 *   remainingQty: number,
 *   expireDate?: string|Date,
 *   unitPriceCents: number,
 *   status: string
 * }>} batches  批次列表（将被复制，不修改原数组）
 * @param {number} deductQty                    要扣减的数量（必须 > 0）
 * @param {string|Date} [today]                 今天日期，用于判断过期，不传则不校验过期
 * @returns {{
 *   success: boolean,
 *   deductions: Array<{batchId: number, batchNo: string, qty: number, unitPriceCents: number, costCents: number}>,
 *   totalDeducted: number,
 *   totalCostCents: number,
 *   remainingNeed: number,
 *   updatedBatches: Array
 * }}
 */
function fifoDeduct(batches, deductQty, today) {
  const qty = Number(deductQty) || 0;
  const result = {
    success: false,
    deductions: [],
    totalDeducted: 0,
    totalCostCents: 0,
    remainingNeed: qty,
    updatedBatches: [],
  };

  if (qty <= 0) {
    result.success = true;
    result.remainingNeed = 0;
    result.updatedBatches = batches.map(b => ({ ...b }));
    return result;
  }

  const todayDate = today ? parseDate(today) : null;

  const available = batches
    .filter(b => {
      if (b.status && b.status !== 'IN_STOCK') return false;
      const rq = Number(b.remainingQty) || 0;
      if (rq <= 0) return false;
      if (todayDate && b.expireDate) {
        const ed = parseDate(b.expireDate);
        if (ed && ed < todayDate) return false;
      }
      return true;
    });

  const sorted = sortByExpiryAsc(available);
  const batchMap = new Map(batches.map(b => [b.id, { ...b }]));

  let remain = qty;

  for (const b of sorted) {
    if (remain <= 0) break;
    const batch = batchMap.get(b.id);
    const avail = Number(batch.remainingQty) || 0;
    if (avail <= 0) continue;

    const take = Math.min(avail, remain);
    const unitPrice = Number(batch.unitPriceCents) || 0;
    const cost = Math.round(take * unitPrice);

    result.deductions.push({
      batchId: batch.id,
      batchNo: batch.batchNo,
      qty: take,
      unitPriceCents: unitPrice,
      costCents: cost,
    });

    batch.remainingQty = Math.round((avail - take) * 100) / 100;
    if (batch.remainingQty <= 0.005) {
      batch.remainingQty = 0;
      batch.status = 'USED_UP';
    }

    result.totalDeducted += take;
    result.totalCostCents += cost;
    remain -= take;
  }

  result.remainingNeed = Math.max(0, remain);
  result.success = remain <= 0.005;
  result.updatedBatches = Array.from(batchMap.values());

  return result;
}

/**
 * 临期/过期批次分类
 *
 * @param {Array} batches
 * @param {string|Date} today
 * @param {number} warningDays  临期预警天数（默认 7）
 * @returns {{
 *   expired: Array,
 *   expiringSoon: Array,
 *   normal: Array,
 *   noExpiry: Array
 * }}
 */
function checkExpiry(batches, today, warningDays = 7) {
  const todayDate = parseDate(today) || new Date();
  const warnMs = warningDays * 24 * 60 * 60 * 1000;

  const expired = [];
  const expiringSoon = [];
  const normal = [];
  const noExpiry = [];

  for (const b of batches) {
    const ed = parseDate(b.expireDate);
    if (!ed) {
      noExpiry.push({ ...b, daysLeft: null });
      continue;
    }
    const daysLeft = daysBetween(ed, todayDate);
    const item = { ...b, daysLeft };

    if (ed.getTime() < todayDate.getTime()) {
      expired.push(item);
    } else if (ed.getTime() - todayDate.getTime() <= warnMs) {
      expiringSoon.push(item);
    } else {
      normal.push(item);
    }
  }

  return { expired, expiringSoon, normal, noExpiry };
}

/**
 * 计算库存汇总：总量、加权平均单价、总货值
 *
 * @param {Array<{remainingQty: number, unitPriceCents: number}>} batches
 * @returns {{totalQty: number, weightedAvgPriceCents: number, totalValueCents: number}}
 */
function calcStockSummary(batches) {
  let totalQty = 0;
  let totalValueCents = 0;

  for (const b of batches) {
    const q = Number(b.remainingQty) || 0;
    const p = Number(b.unitPriceCents) || 0;
    if (q > 0) {
      totalQty += q;
      totalValueCents += Math.round(q * p);
    }
  }

  const weightedAvgPriceCents = totalQty > 0 ? Math.round(totalValueCents / totalQty) : 0;

  return {
    totalQty: Math.round(totalQty * 100) / 100,
    weightedAvgPriceCents,
    totalValueCents,
  };
}

/**
 * 计算盘点差异
 *
 * @param {number} theoreticalQty 理论库存
 * @param {number} actualQty      实盘数量
 * @param {number} unitPriceCents 单价（分）
 * @returns {{
 *   diffQty: number,
 *   diffType: 'EQUAL' | 'OVER' | 'SHORT',
 *   diffAmountCents: number
 * }}
 */
function calcCountDiff(theoreticalQty, actualQty, unitPriceCents) {
  const t = Number(theoreticalQty) || 0;
  const a = Number(actualQty) || 0;
  const p = Number(unitPriceCents) || 0;
  const diff = Math.round((a - t) * 100) / 100;
  let diffType = 'EQUAL';
  if (diff > 0.005) diffType = 'OVER';
  else if (diff < -0.005) diffType = 'SHORT';
  const diffAmount = Math.round(Math.abs(diff) * p);
  return { diffQty: diff, diffType, diffAmountCents: diffAmount };
}

module.exports = {
  sortByExpiryAsc,
  fifoDeduct,
  checkExpiry,
  calcStockSummary,
  calcCountDiff,
};
