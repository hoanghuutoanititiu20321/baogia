const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kkvn_baogia.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

// Password hashing helpers using built-in node:crypto
function hashPassword(plainPassword) {
  const salt = 'kkvn_salt_2026';
  return crypto.scryptSync(String(plainPassword), salt, 32).toString('hex');
}

function verifyPassword(plainPassword, storedHash) {
  if (!storedHash) return false;
  const computed = hashPassword(plainPassword);
  return computed === storedHash;
}

// Default permission presets by role
function getDefaultPermissionsForRole(role) {
  switch (role) {
    case 'admin':
      return {
        canViewCost: true,
        canApproveQuote: true,
        canManageCatalog: true,
        canManageUsers: true,
        canViewAllQuotes: true,
        canDeleteQuote: true,
        canExportExcel: true
      };
    case 'manager':
      return {
        canViewCost: true,
        canApproveQuote: true,
        canManageCatalog: true,
        canManageUsers: false,
        canViewAllQuotes: true,
        canDeleteQuote: true,
        canExportExcel: true
      };
    case 'sale':
      return {
        canViewCost: false,
        canApproveQuote: false,
        canManageCatalog: false,
        canManageUsers: false,
        canViewAllQuotes: true,
        canDeleteQuote: false,
        canExportExcel: false
      };
    case 'sale_own':
    default:
      return {
        canViewCost: false,
        canApproveQuote: false,
        canManageCatalog: false,
        canManageUsers: false,
        canViewAllQuotes: false,
        canDeleteQuote: false,
        canExportExcel: false
      };
  }
}

function parseUserPermissions(userRow) {
  if (!userRow) return getDefaultPermissionsForRole('sale');
  const defaults = getDefaultPermissionsForRole(userRow.role);
  if (userRow.permissions_json) {
    try {
      const custom = JSON.parse(userRow.permissions_json);
      return { ...defaults, ...custom };
    } catch {}
  }
  return defaults;
}

function logAudit(username, fullName, action, details = '') {
  try {
    db.prepare(`
      INSERT INTO audit_logs (username, full_name, action, details, created_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(username || 'system', fullName || '', action, details);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

function ensureColumn(tableName, colName, colDef) {
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!cols.some(c => c.name === colName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef};`);
  }
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role TEXT NOT NULL, -- 'admin' | 'manager' | 'sale' | 'sale_own'
      title_vi TEXT,
      title_jp TEXT,
      permissions_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      full_name TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tower_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_line TEXT NOT NULL,
      model_code TEXT NOT NULL,
      flow_rate REAL NOT NULL,
      flow_cmh REAL,
      tower_cost INTEGER NOT NULL DEFAULT 0,
      tower_base INTEGER NOT NULL DEFAULT 0,
      fan_model TEXT,
      motor_kw REAL,
      fan_pressure_pa INTEGER,
      fan_cost INTEGER NOT NULL DEFAULT 0,
      fan_base INTEGER NOT NULL DEFAULT 0,
      pump_model TEXT,
      pump_cost INTEGER NOT NULL DEFAULT 0,
      pump_base INTEGER NOT NULL DEFAULT 0,
      panel_cost INTEGER NOT NULL DEFAULT 0,
      panel_base INTEGER NOT NULL DEFAULT 0,
      stage_cost INTEGER NOT NULL DEFAULT 0,
      stage_base INTEGER NOT NULL DEFAULT 0,
      mgmt_cost INTEGER NOT NULL DEFAULT 0,
      mgmt_base INTEGER NOT NULL DEFAULT 0,
      total_cost INTEGER NOT NULL DEFAULT 0,
      total_base INTEGER NOT NULL DEFAULT 0,
      specs_json TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS equipment_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'instrument' | 'option' | 'fan' | 'pump' | 'service'
      code TEXT,
      name_jp TEXT,
      name_vi TEXT NOT NULL,
      specs TEXT,
      unit TEXT NOT NULL DEFAULT 'Pc/Cái',
      cost_price INTEGER,
      base_price INTEGER,
      is_default_included INTEGER NOT NULL DEFAULT 0,
      default_qty INTEGER NOT NULL DEFAULT 1,
      origin_note TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT NOT NULL,
      base_code TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      parent_quote_id INTEGER,
      quote_date TEXT NOT NULL,
      doc_title TEXT NOT NULL DEFAULT '御見積 BÁO GIÁ',
      flow_type TEXT NOT NULL DEFAULT 'detailed',
      layout_template TEXT NOT NULL DEFAULT 'tower_bundle',
      mgmt_fee_mode TEXT NOT NULL DEFAULT 'separate_to_b',
      status TEXT NOT NULL DEFAULT 'draft',
      
      customer_name TEXT NOT NULL,
      customer_address TEXT,
      customer_phone TEXT,
      customer_contact TEXT,
      project_name TEXT,
      install_location TEXT,
      lead_time_days INTEGER DEFAULT 180,
      lead_time_note TEXT DEFAULT 'Ngày (kể từ ngày nhận cọc)',

      kkvn_address TEXT DEFAULT 'KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh',
      stamp_type TEXT DEFAULT 'longan',
      approver_name TEXT DEFAULT 'Mr Yamanaka Masayuki',
      approver_phone TEXT DEFAULT '0908-687-147',
      pic_name TEXT DEFAULT 'Mr Bảo Trường',
      pic_phone TEXT DEFAULT '0898-687-331',
      signer_name TEXT DEFAULT 'NGUYỄN BẢO TRƯỜNG',

      selected_product_line TEXT,
      selected_model_code TEXT,

      subtotal_cost INTEGER NOT NULL DEFAULT 0,
      subtotal_base INTEGER NOT NULL DEFAULT 0,
      subtotal_before_tax INTEGER NOT NULL DEFAULT 0,
      vat_percent REAL NOT NULL DEFAULT 8,
      vat_amount INTEGER NOT NULL DEFAULT 0,
      total_after_tax INTEGER NOT NULL DEFAULT 0,

      sections_json TEXT NOT NULL,
      terms_json TEXT NOT NULL,
      internal_notes TEXT,
      created_by TEXT DEFAULT 'baotruong',
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Safe migrations for existing users table
  ensureColumn('users', 'password_hash', 'TEXT');
  ensureColumn('users', 'email', 'TEXT');
  ensureColumn('users', 'permissions_json', 'TEXT');
  ensureColumn('users', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'last_login', 'TEXT');
  ensureColumn('users', 'created_at', 'TEXT');

  seedIfEmpty();
}

function getPumpSpecHint(pumpModel) {
  if (!pumpModel) return '';
  if (pumpModel.includes('25VO3')) return '60 L/min x 10 m x 0.4 kW';
  if (pumpModel.includes('40VO3 0.75')) return '150 L/min x 10 m x 0.75 kW';
  if (pumpModel.includes('40VO3 1.5')) return '125 L/min x 10 m x 1.5 kW';
  if (pumpModel.includes('50VO3 1.5')) return '250 L/min x 10 m x 1.5 kW';
  if (pumpModel.includes('65VO4 2.2')) return '385 L/min x 10 m x 2.2 kW';
  if (pumpModel.includes('80VO4 3.7')) return '650 L/min x 10 m x 3.7 kW';
  if (pumpModel.includes('100VO4 5.5')) return '1330 L/min x 10 m x 5.5 kW';
  if (pumpModel.includes('125VO4 7.5')) return '1800 L/min x 10 m x 7.5 kW';
  if (pumpModel.includes('125VO4 11')) return '2200 L/min x 10 m x 11 kW';
  return pumpModel;
}

function getTowerDimensionHint(productLine, modelCode) {
  const m = parseInt(modelCode, 10) || 80;
  const dia = m * 10;
  let height = 4200;
  if (productLine.startsWith('FSW')) height = m <= 100 ? 4950 : m <= 200 ? 5500 : 6200;
  else if (productLine.startsWith('FSD')) height = m <= 85 ? 3800 : 4500;
  else if (productLine.startsWith('EMR')) height = m <= 100 ? 4600 : 5400;
  const stackDia = Math.max(250, Math.round((dia * 0.44) / 50) * 50);
  return {
    towerDim: `φ ${dia} x ${height} H`,
    stackDim: `φ ${stackDia} x 850 H`
  };
}

function seedIfEmpty() {
  const defaultPassHash = hashPassword('123456');
  const existingUsers = db.prepare('SELECT * FROM users').all();

  if (existingUsers.length === 0) {
    const insUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role, title_vi, title_jp, permissions_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insUser.run(
      'yamanaka', defaultPassHash, 'Mr Yamanaka Masayuki', 'yamanaka@kyowakako.vn', '0908-687-147',
      'admin', 'Tổng Giám Đốc / Người duyệt', '承認者 (Admin)',
      JSON.stringify(getDefaultPermissionsForRole('admin'))
    );
    insUser.run(
      'baotruong', defaultPassHash, 'Mr Bảo Trường', 'baotruong@kyowakako.vn', '0898-687-331',
      'manager', 'Trưởng Phòng Kinh Doanh / Người duyệt', '営業部・承認者',
      JSON.stringify({ ...getDefaultPermissionsForRole('manager'), canManageUsers: true })
    );
    insUser.run(
      'camtu', defaultPassHash, 'Mrs Cẩm Tú', 'camtu@kyowakako.vn', '0908-470-417',
      'sale', 'Nhân viên Kinh doanh', '担当者',
      JSON.stringify(getDefaultPermissionsForRole('sale'))
    );
    insUser.run(
      'sale_kkvn', defaultPassHash, 'Mr Minh Đức (Sale)', 'minhduc@kyowakako.vn', '0908-687-111',
      'sale_own', 'Nhân viên Kinh doanh (Chỉ xem BG cá nhân)', '担当者',
      JSON.stringify(getDefaultPermissionsForRole('sale_own'))
    );
  } else {
    // Upgrade existing seeded users with default password & permissions if missing
    for (const u of existingUsers) {
      const pHash = u.password_hash || defaultPassHash;
      let perms = u.permissions_json;
      if (!perms) {
        const basePerms = getDefaultPermissionsForRole(u.role);
        if (u.username === 'baotruong') basePerms.canManageUsers = true;
        perms = JSON.stringify(basePerms);
      }
      const email = u.email || `${u.username}@kyowakako.vn`;
      db.prepare(`
        UPDATE users SET password_hash = ?, permissions_json = ?, email = ? WHERE id = ?
      `).run(pHash, perms, email, u.id);
    }
  }

  const seedPath = path.join(__dirname, 'seed_data.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  const modelCount = db.prepare('SELECT COUNT(*) as cnt FROM tower_models').get().cnt;
  if (modelCount === 0 && seedData.tower_models) {
    const insModel = db.prepare(`
      INSERT INTO tower_models (
        product_line, model_code, flow_rate, flow_cmh,
        tower_cost, tower_base,
        fan_model, motor_kw, fan_pressure_pa, fan_cost, fan_base,
        pump_model, pump_cost, pump_base,
        panel_cost, panel_base,
        stage_cost, stage_base,
        mgmt_cost, mgmt_base,
        total_cost, total_base, specs_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of seedData.tower_models) {
      const dims = getTowerDimensionHint(m.product_line, m.model_code);
      const specs = {
        tower_dim: dims.towerDim,
        stack_dim: dims.stackDim,
        material: 'FRP',
        pump_spec: getPumpSpecHint(m.pump_model),
        fan_spec: `${(m.flow_rate * 60).toLocaleString('en-US')} CMH   ${m.fan_pressure_pa} Pa   ${m.motor_kw} Kw, 3phase ,380V,50Hz, 4P,IE3`
      };
      insModel.run(
        m.product_line, String(m.model_code), m.flow_rate, m.flow_cmh,
        m.tower_cost, m.tower_base,
        m.fan_model, m.motor_kw, m.fan_pressure_pa, m.fan_cost, m.fan_base,
        m.pump_model, m.pump_cost, m.pump_base,
        m.panel_cost, m.panel_base,
        m.stage_cost, m.stage_base,
        m.mgmt_cost, m.mgmt_base,
        m.total_cost, m.total_base,
        JSON.stringify(specs)
      );
    }
  }

  const equipCount = db.prepare('SELECT COUNT(*) as cnt FROM equipment_catalog').get().cnt;
  if (equipCount === 0) {
    const insEquip = db.prepare(`
      INSERT INTO equipment_catalog (
        category, code, name_jp, name_vi, specs, unit,
        cost_price, base_price, is_default_included, default_qty, origin_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const eq of (seedData.instruments || [])) {
      insEquip.run(
        'instrument',
        `INST-${eq.id}`,
        eq.name_jp || '',
        eq.name_vi,
        eq.specs || '',
        eq.unit || 'Pc/Cái',
        eq.cost_price,
        eq.base_price,
        eq.is_default_included,
        eq.default_qty,
        eq.origin_note || 'KYOWA VN'
      );
    }

    const extraOptions = [
      { code: 'OPT-PH', cat: 'option', jp: 'pH計', vi: 'Đo pH (Bộ hiển thị & điện cực pH)', specs: 'Online pH Controller + Sensor', unit: 'Set/Bộ', cost: 14000000, base: 28000000, note: 'KYOWA VN' },
      { code: 'OPT-TANK200', cat: 'option', jp: 'Chemical tank (200L)', vi: 'Bồn hóa chất 200L (Chemical tank 200L)', specs: '200L PVC/PE', unit: 'Pc/Cái', cost: 9500000, base: 19000000, note: 'KYOWA VN' },
      { code: 'OPT-CHEMPUMP', cat: 'option', jp: '薬品ポンプ', vi: 'Bơm định lượng hóa chất (Bơm hóa chất)', specs: 'Dosing pump', unit: 'Pc/Cái', cost: 11000000, base: 22000000, note: 'KYOWA VN' },
      { code: 'OPT-INV', cat: 'option', jp: '制御盤(INV)', vi: 'Nâng cấp Biến tần (INV) cho Tủ điều khiển + Đấu dây 2m', specs: 'Inverter + 2m wiring', unit: 'Set/Bộ', cost: 12939000, base: 25878000, note: 'KYOWA VN' },

      { code: 'FAN-7RFT', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút #7 RFT-RB (FRP)', specs: '850 CMM   1500 Pa   45 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 389100000, base: 778200000, note: 'KYOWA JP' },
      { code: 'FAN-8RFT', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút #8 RFT-RB (FRP)', specs: '950 CMM   1500 Pa   37 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 519400000, base: 1038800000, note: 'KYOWA JP' },
      { code: 'FAN-200NKS', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút 200NKS (FRP)', specs: '80 CMM   750 Pa   2.2 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 115048000, base: 230096000, note: 'KYOWA' },
      { code: 'FAN-3FRP', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút #3 (FRP)', specs: '130 CMM   1200 Pa   5.5 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 74603000, base: 149206000, note: 'KYOWA' },
      { code: 'FAN-4FRP', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút #4 (FRP)', specs: '180 CMM   1200 Pa   7.5 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 80833000, base: 161666000, note: 'KYOWA' },
      { code: 'FAN-5FRP', cat: 'fan', jp: '排気ファン', vi: 'Quạt hút #5 (FRP)', specs: '360 CMM   1200 Pa   15 Kw, 3phase ,380V,50Hz, 4P,IE3', unit: 'Pc/Cái', cost: 99853000, base: 199706000, note: 'KYOWA' },

      { code: 'PUMP-40VO-1.5', cat: 'pump', jp: '循環ポンプ', vi: 'Bơm tuần hoàn 40 VO (PVC)', specs: '125 L/min x 10 m x 1.5 kW', unit: 'Pc/Cái', cost: 52814500, base: 75180000, note: 'KYOWA JP' },
      { code: 'PUMP-65VO-2.2', cat: 'pump', jp: '循環ポンプ', vi: 'Bơm tuần hoàn 65 VO (PVC)', specs: '385 L/min x 10 m x 2.2 kW', unit: 'Pc/Cái', cost: 68000000, base: 97180000, note: 'KYOWA JP' },
      { code: 'PUMP-100VO-5.5', cat: 'pump', jp: '循環ポンプ', vi: 'Bơm tuần hoàn 100 VO (PVC)', specs: '1330 L/min x 10 m x 5.5 kW', unit: 'Pc/Cái', cost: 110000000, base: 159050000, note: 'KYOWA JP' },
      { code: 'PUMP-40VO3-0.75', cat: 'pump', jp: '循環ポンプ', vi: 'Bơm tuần hoàn 40 VO3 (PVC)', specs: '150 L/min x 10 m x 0.75 kW', unit: 'Pc/Cái', cost: 91328000, base: 182656000, note: 'KYOWA JP' },
      { code: 'PUMP-50VO3-1.5', cat: 'pump', jp: '循環ポンプ', vi: 'Bơm tuần hoàn 50 VO3 (PVC)', specs: '250 L/min x 10 m x 1.5 kW', unit: 'Pc/Cái', cost: 92696500, base: 185393000, note: 'KYOWA JP' },

      { code: 'SRV-MGMT', cat: 'service', jp: '現場管理・設計・試運転費', vi: 'Thiết kế, quản lí, vận hành', specs: '', unit: 'Lot/Lần', cost: 23700000, base: 47400000, note: '' },
      { code: 'SRV-TRANS', cat: 'service', jp: '運送費', vi: 'Vận chuyển', specs: '', unit: 'Lot/Lần', cost: 18000000, base: 26000000, note: 'ko cẩu vào vị trí' },
      { code: 'SRV-INSTALL', cat: 'service', jp: '現場設置', vi: 'Lắp đặt tại công trình', specs: '', unit: 'Lot/Lần', cost: 70000000, base: 104000000, note: '' },
      { code: 'SRV-DOM-TRANS', cat: 'service', jp: '', vi: 'Phí vận chuyển trong nước', specs: '', unit: 'Lot/Lần', cost: 6000000, base: 8250000, note: '' },
      { code: 'SRV-CUSTOMS', cat: 'service', jp: '', vi: 'Phí hải quan đầu xuất', specs: '', unit: 'Lot/Lần', cost: 1500000, base: 2000000, note: '' },
      { code: 'SRV-INTL-TRANS', cat: 'service', jp: '', vi: 'Phí vận chuyển về Việt Nam', specs: '', unit: 'Lot/Lần', cost: 28000000, base: 36000000, note: '' }
    ];

    for (const item of extraOptions) {
      insEquip.run(
        item.cat, item.code, item.jp, item.vi, item.specs, item.unit,
        item.cost, item.base, 0, 1, item.note
      );
    }
  }

  const quoteCount = db.prepare('SELECT COUNT(*) as cnt FROM quotations').get().cnt;
  if (quoteCount === 0) {
    seedSampleQuotations();
  }
}

function seedSampleQuotations() {
  // Handled on initial creation
}

initDatabase();

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  getDefaultPermissionsForRole,
  parseUserPermissions,
  logAudit,
  getPumpSpecHint,
  getTowerDimensionHint
};
