-- 社区长者助餐运营管理平台 表结构（全程 utf8mb4，确保中文正常）
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  role          VARCHAR(16) NOT NULL DEFAULT 'VIEWER',
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 助餐点（社区食堂）
CREATE TABLE IF NOT EXISTS canteens (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code        VARCHAR(32) NOT NULL UNIQUE,
  name        VARCHAR(128) NOT NULL,
  district    VARCHAR(64) NOT NULL,
  address     VARCHAR(255) NOT NULL DEFAULT '',
  capacity    INT NOT NULL DEFAULT 0,
  status      VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 长者档案
CREATE TABLE IF NOT EXISTS elders (
  id            INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code          VARCHAR(32) NOT NULL UNIQUE,
  name          VARCHAR(64) NOT NULL,
  gender        VARCHAR(8) NOT NULL DEFAULT 'U',
  age           INT NOT NULL DEFAULT 0,
  phone         VARCHAR(32) NOT NULL DEFAULT '',
  subsidy_level VARCHAR(8) NOT NULL DEFAULT 'C',
  dietary       VARCHAR(255) NOT NULL DEFAULT '',
  canteen_id    INT UNSIGNED NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_elder_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 餐次（某助餐点某日某餐别提供的菜品）
CREATE TABLE IF NOT EXISTS meals (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  canteen_id  INT UNSIGNED NOT NULL,
  serve_date  DATE NOT NULL,
  meal_type   VARCHAR(16) NOT NULL DEFAULT 'LUNCH',
  dish_name   VARCHAR(128) NOT NULL,
  price_cents INT NOT NULL DEFAULT 0,
  status      VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_meal_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  INDEX idx_meal_date (serve_date),
  INDEX idx_meal_canteen (canteen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订餐
CREATE TABLE IF NOT EXISTS orders (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  elder_id     INT UNSIGNED NOT NULL,
  meal_id      INT UNSIGNED NOT NULL,
  dining_type  VARCHAR(16) NOT NULL DEFAULT 'DINE_IN',
  qty          INT NOT NULL DEFAULT 1,
  amount_cents INT NOT NULL DEFAULT 0,
  subsidy_cents INT NOT NULL DEFAULT 0,
  pay_cents    INT NOT NULL DEFAULT 0,
  status       VARCHAR(16) NOT NULL DEFAULT 'RESERVED',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_order_elder FOREIGN KEY (elder_id) REFERENCES elders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_meal FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  INDEX idx_order_status (status),
  INDEX idx_order_elder (elder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 食材主数据
CREATE TABLE IF NOT EXISTS ingredients (
  id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code            VARCHAR(32) NOT NULL UNIQUE,
  name            VARCHAR(128) NOT NULL,
  category        VARCHAR(32) NOT NULL DEFAULT 'OTHER',
  unit            VARCHAR(16) NOT NULL,
  safety_stock    DECIMAL(10,2) NOT NULL DEFAULT 0,
  min_order_qty   DECIMAL(10,2) NOT NULL DEFAULT 0,
  package_spec    DECIMAL(10,2) NOT NULL DEFAULT 1,
  status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ingredient_category (category),
  INDEX idx_ingredient_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 菜品配方（BOM 主表，通过 dish_name 关联 meals.dish_name）
CREATE TABLE IF NOT EXISTS recipes (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  dish_name   VARCHAR(128) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT '',
  status      VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_recipe_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 配方明细
CREATE TABLE IF NOT EXISTS recipe_items (
  id             INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  recipe_id      INT UNSIGNED NOT NULL,
  ingredient_id  INT UNSIGNED NOT NULL,
  qty            DECIMAL(10,3) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_recipe_item_recipe FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT fk_recipe_item_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  INDEX idx_recipe_item_recipe (recipe_id),
  INDEX idx_recipe_item_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 库存批次
CREATE TABLE IF NOT EXISTS stock_batches (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  canteen_id        INT UNSIGNED NOT NULL,
  ingredient_id     INT UNSIGNED NOT NULL,
  batch_no          VARCHAR(64) NOT NULL,
  total_qty         DECIMAL(10,2) NOT NULL,
  remaining_qty     DECIMAL(10,2) NOT NULL,
  in_date           DATE NOT NULL,
  expire_date       DATE NULL,
  unit_price_cents  INT NOT NULL DEFAULT 0,
  status            VARCHAR(16) NOT NULL DEFAULT 'IN_STOCK',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_stock_batch_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_batch_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  UNIQUE KEY uk_batch_canteen (canteen_id, batch_no),
  INDEX idx_stock_batch_ingredient (ingredient_id),
  INDEX idx_stock_batch_expire (expire_date),
  INDEX idx_stock_batch_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 出入库流水
CREATE TABLE IF NOT EXISTS stock_movements (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  canteen_id        INT UNSIGNED NOT NULL,
  ingredient_id     INT UNSIGNED NOT NULL,
  batch_id          INT UNSIGNED NULL,
  type              VARCHAR(16) NOT NULL,
  qty               DECIMAL(10,2) NOT NULL,
  balance_after     DECIMAL(10,2) NOT NULL,
  unit_price_cents  INT NULL,
  ref_type          VARCHAR(32) NULL,
  ref_id            INT UNSIGNED NULL,
  remark            VARCHAR(255) NOT NULL DEFAULT '',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_stock_movement_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_movement_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  CONSTRAINT fk_stock_movement_batch FOREIGN KEY (batch_id) REFERENCES stock_batches(id) ON DELETE SET NULL,
  INDEX idx_stock_movement_canteen (canteen_id),
  INDEX idx_stock_movement_ingredient (ingredient_id),
  INDEX idx_stock_movement_batch (batch_id),
  INDEX idx_stock_movement_type (type),
  INDEX idx_stock_movement_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 盘点单
CREATE TABLE IF NOT EXISTS stock_counts (
  id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  canteen_id  INT UNSIGNED NOT NULL,
  count_date  DATE NOT NULL,
  status      VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  remark      VARCHAR(255) NOT NULL DEFAULT '',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_stock_count_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  INDEX idx_stock_count_date (count_date),
  INDEX idx_stock_count_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 盘点明细
CREATE TABLE IF NOT EXISTS stock_count_items (
  id                  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  count_id            INT UNSIGNED NOT NULL,
  ingredient_id       INT UNSIGNED NOT NULL,
  theoretical_qty     DECIMAL(10,2) NOT NULL,
  actual_qty          DECIMAL(10,2) NOT NULL,
  diff_qty            DECIMAL(10,2) NOT NULL,
  unit_price_cents    INT NOT NULL DEFAULT 0,
  diff_amount_cents   INT NOT NULL DEFAULT 0,
  remark              VARCHAR(255) NOT NULL DEFAULT '',
  CONSTRAINT fk_stock_count_item_count FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_count_item_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  INDEX idx_stock_count_item_count (count_id),
  INDEX idx_stock_count_item_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 采购单
CREATE TABLE IF NOT EXISTS purchase_orders (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  canteen_id        INT UNSIGNED NOT NULL,
  order_no          VARCHAR(32) NOT NULL UNIQUE,
  status            VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  order_date        DATE NOT NULL,
  expected_date     DATE NULL,
  total_qty         DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount_cents INT NOT NULL DEFAULT 0,
  remark            VARCHAR(255) NOT NULL DEFAULT '',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_purchase_order_canteen FOREIGN KEY (canteen_id) REFERENCES canteens(id) ON DELETE CASCADE,
  INDEX idx_purchase_order_status (status),
  INDEX idx_purchase_order_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 采购单明细
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  order_id          INT UNSIGNED NOT NULL,
  ingredient_id     INT UNSIGNED NOT NULL,
  qty               DECIMAL(10,2) NOT NULL,
  unit_price_cents  INT NOT NULL DEFAULT 0,
  received_qty      DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_cents      INT NOT NULL DEFAULT 0,
  remark            VARCHAR(255) NOT NULL DEFAULT '',
  CONSTRAINT fk_po_item_order FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_item_ingredient FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  INDEX idx_po_item_order (order_id),
  INDEX idx_po_item_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
