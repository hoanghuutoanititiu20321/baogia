const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const {
  db,
  nowVN,
  todayVN,
  hashPassword,
  verifyPassword,
  getDefaultPermissionsForRole,
  parseUserPermissions,
  logAudit,
  getPumpSpecHint,
  getTowerDimensionHint
} = require('./db');
const { parseCatalogExcelFile, buildCatalogExcelBuffer } = require('./excel');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sanitizeUser(userRow) {
  if (!userRow) return null;
  const permissions = parseUserPermissions(userRow);
  return {
    id: userRow.id,
    username: userRow.username,
    full_name: userRow.full_name,
    email: userRow.email || '',
    phone: userRow.phone || '',
    role: userRow.role,
    title_vi: userRow.title_vi || '',
    title_jp: userRow.title_jp || '',
    is_active: Number(userRow.is_active ?? 1),
    last_login: userRow.last_login || null,
    created_at: userRow.created_at || null,
    permissions
  };
}

function getAuthenticatedUser(req, parsedUrl) {
  let token = '';
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (parsedUrl && parsedUrl.searchParams.get('token')) {
    token = parsedUrl.searchParams.get('token').trim();
  }

  if (token) {
    const sess = db.prepare(`
      SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now', '+7 hours')
    `).get(token);
    if (sess) {
      const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(sess.user_id);
      if (user) return { user, permissions: parseUserPermissions(user), token };
    }
  }

  return null;
}

function formatModelRow(row, includeCost) {
  let specs = {};
  try {
    specs = row.specs_json ? JSON.parse(row.specs_json) : {};
  } catch {}
  const item = {
    ...row,
    specs
  };
  if (!includeCost) {
    item.tower_cost = null;
    item.fan_cost = null;
    item.pump_cost = null;
    item.panel_cost = null;
    item.stage_cost = null;
    item.mgmt_cost = null;
    item.total_cost = null;
  }
  return item;
}

function formatEquipRow(row, includeCost) {
  const item = { ...row };
  if (!includeCost) {
    item.cost_price = null;
  }
  return item;
}

function formatQuoteRow(row, includeCost) {
  if (!row) return null;
  let sections = [];
  let terms = {};
  try { sections = JSON.parse(row.sections_json || '[]'); } catch {}
  try { terms = JSON.parse(row.terms_json || '{}'); } catch {}
  if (!includeCost) {
    sections = sections.map(sec => ({
      ...sec,
      items: (sec.items || []).map(it => ({
        ...it,
        cost_price: null,
        breakdown: (it.breakdown || []).map(b => ({ ...b, cost: null }))
      }))
    }));
  }
  const mgmtFeePct = (terms && terms.mgmt_fee_percent !== undefined)
    ? Number(terms.mgmt_fee_percent)
    : (row.mgmt_fee_percent !== undefined ? Number(row.mgmt_fee_percent) : 5);
  return {
    ...row,
    mgmt_fee_percent: mgmtFeePct,
    subtotal_cost: includeCost ? row.subtotal_cost : null,
    sections,
    terms: { ...terms, mgmt_fee_percent: mgmtFeePct }
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // =========================================================================
    // PUBLIC AUTH ROUTES (No token required)
    // =========================================================================
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');

      if (!username || !password) {
        return sendJson(res, 400, { error: 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu.' });
      }

      const userRow = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!userRow) {
        return sendJson(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
      }

      if (!Number(userRow.is_active)) {
        return sendJson(res, 403, { error: 'Tài khoản này đã bị khóa. Vui lòng liên hệ Quản trị viên.' });
      }

      if (!verifyPassword(password, userRow.password_hash)) {
        return sendJson(res, 401, { error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      db.prepare(`
        INSERT INTO sessions (token, user_id, username, created_at, expires_at)
        VALUES (?, ?, ?, datetime('now', '+7 hours'), datetime('now', '+7 hours', '+7 days'))
      `).run(token, userRow.id, userRow.username);

      db.prepare(`
        UPDATE users SET last_login = datetime('now', '+7 hours') WHERE id = ?
      `).run(userRow.id);

      const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id);
      const cleanUser = sanitizeUser(updatedUser);
      logAudit(cleanUser.username, cleanUser.full_name, 'LOGIN', `Đăng nhập hệ thống (Vai trò: ${cleanUser.role})`);

      return sendJson(res, 200, {
        token,
        user: cleanUser,
        permissions: cleanUser.permissions
      });
    }

    // =========================================================================
    // PROTECTED API ROUTES (Require Authentication)
    // =========================================================================
    if (pathname.startsWith('/api/')) {
      const auth = getAuthenticatedUser(req, parsedUrl);
      if (!auth) {
        return sendJson(res, 401, { error: 'Phiên đăng nhập đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại.' });
      }

      const currentUser = auth.user;
      const perms = auth.permissions;
      const showCost = Boolean(perms.canViewCost);

      if (pathname === '/api/auth/me' && method === 'GET') {
        return sendJson(res, 200, {
          user: sanitizeUser(currentUser),
          permissions: perms
        });
      }

      if (pathname === '/api/auth/logout' && method === 'POST') {
        if (auth.token) {
          db.prepare('DELETE FROM sessions WHERE token = ?').run(auth.token);
        }
        logAudit(currentUser.username, currentUser.full_name, 'LOGOUT', 'Đăng xuất khỏi hệ thống');
        return sendJson(res, 200, { success: true });
      }

      if (pathname === '/api/auth/change-password' && method === 'POST') {
        const body = await readJsonBody(req);
        const currentPass = String(body.currentPassword || '');
        const newPass = String(body.newPassword || '');
        if (!newPass || newPass.length < 4) {
          return sendJson(res, 400, { error: 'Mật khẩu mới phải có ít nhất 4 ký tự.' });
        }
        if (!verifyPassword(currentPass, currentUser.password_hash)) {
          return sendJson(res, 400, { error: 'Mật khẩu hiện tại không đúng.' });
        }
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPass), currentUser.id);
        logAudit(currentUser.username, currentUser.full_name, 'CHANGE_PASSWORD', 'Tự đổi mật khẩu cá nhân');
        return sendJson(res, 200, { success: true });
      }

      // --- BOOTSTRAP DATA ---
      if (pathname === '/api/bootstrap' && method === 'GET') {
        const users = db.prepare('SELECT * FROM users ORDER BY id ASC').all().map(u => sanitizeUser(u));
        const rawModels = db.prepare('SELECT * FROM tower_models ORDER BY id ASC').all();
        const rawEquip = db.prepare('SELECT * FROM equipment_catalog ORDER BY id ASC').all();

        let rawQuotes = db.prepare('SELECT * FROM quotations ORDER BY updated_at DESC, id DESC').all();
        if (!perms.canViewAllQuotes) {
          rawQuotes = rawQuotes.filter(q =>
            q.created_by === currentUser.username ||
            (q.pic_name && q.pic_name.toLowerCase().includes(currentUser.full_name.toLowerCase()))
          );
        }

        return sendJson(res, 200, {
          currentUser: sanitizeUser(currentUser),
          permissions: perms,
          users,
          tower_models: rawModels.map(m => formatModelRow(m, showCost)),
          equipment_catalog: rawEquip.map(e => formatEquipRow(e, showCost)),
          quotations: rawQuotes.map(q => formatQuoteRow(q, showCost))
        });
      }

      // =======================================================================
      // USER ACCOUNT & PERMISSION MANAGEMENT APIs
      // =======================================================================
      if (pathname === '/api/users' && method === 'GET') {
        const allUsers = db.prepare('SELECT * FROM users ORDER BY id ASC').all();
        const quoteCounts = db.prepare('SELECT created_by, COUNT(*) as cnt FROM quotations GROUP BY created_by').all();
        const countMap = {};
        quoteCounts.forEach(r => { countMap[r.created_by] = r.cnt; });

        const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 40').all();

        return sendJson(res, 200, {
          users: allUsers.map(u => ({
            ...sanitizeUser(u),
            quotes_count: countMap[u.username] || 0
          })),
          audit_logs: logs,
          role_presets: {
            admin: getDefaultPermissionsForRole('admin'),
            manager: getDefaultPermissionsForRole('manager'),
            sale: getDefaultPermissionsForRole('sale'),
            sale_own: getDefaultPermissionsForRole('sale_own')
          }
        });
      }

      if (pathname === '/api/users' && method === 'POST') {
        if (!perms.canManageUsers) {
          return sendJson(res, 403, { error: 'Bạn không có quyền quản lý tài khoản người dùng.' });
        }
        const b = await readJsonBody(req);
        const username = String(b.username || '').trim().toLowerCase();
        const password = String(b.password || '123456');
        const fullName = String(b.full_name || '').trim();
        const role = b.role || 'sale';

        if (!username || !fullName) {
          return sendJson(res, 400, { error: 'Vui lòng nhập Tên đăng nhập và Họ tên.' });
        }

        const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (exists) {
          return sendJson(res, 400, { error: `Tên đăng nhập "${username}" đã tồn tại.` });
        }

        const userPerms = b.permissions || getDefaultPermissionsForRole(role);
        const info = db.prepare(`
          INSERT INTO users (username, password_hash, full_name, email, phone, role, title_vi, title_jp, permissions_json, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          username,
          hashPassword(password),
          fullName,
          b.email || `${username}@kyowakako.vn`,
          b.phone || '',
          role,
          b.title_vi || (role === 'admin' ? 'Ban Giám Đốc / Admin' : role === 'manager' ? 'Quản lý Kinh doanh' : 'Nhân viên Kinh doanh'),
          b.title_jp || (role === 'admin' || role === 'manager' ? '承認者' : '担当者'),
          JSON.stringify(userPerms),
          b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1
        );

        const created = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        logAudit(currentUser.username, currentUser.full_name, 'CREATE_USER', `Tạo tài khoản mới: ${username} (${fullName} - Vai trò: ${role})`);
        return sendJson(res, 201, sanitizeUser(created));
      }

      const userIdMatch = pathname.match(/^\/api\/users\/(\d+)$/);
      if (userIdMatch && method === 'PUT') {
        if (!perms.canManageUsers) {
          return sendJson(res, 403, { error: 'Bạn không có quyền chỉnh sửa tài khoản và phân quyền.' });
        }
        const targetId = Number(userIdMatch[1]);
        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
        if (!existing) return sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });

        const b = await readJsonBody(req);
        const nextRole = b.role || existing.role;
        const nextPerms = b.permissions || parseUserPermissions(existing);
        const nextActive = b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active;

        // Prevent locking or revoking own admin user management permission accidentally
        if (targetId === currentUser.id && !nextActive) {
          return sendJson(res, 400, { error: 'Không thể tự khóa tài khoản đang đăng nhập của chính bạn.' });
        }
        if (targetId === currentUser.id && !nextPerms.canManageUsers) {
          return sendJson(res, 400, { error: 'Không thể tự gỡ quyền Quản lý tài khoản của chính bạn.' });
        }

        db.prepare(`
          UPDATE users SET
            full_name = ?,
            email = ?,
            phone = ?,
            role = ?,
            title_vi = ?,
            title_jp = ?,
            permissions_json = ?,
            is_active = ?
          WHERE id = ?
        `).run(
          b.full_name ?? existing.full_name,
          b.email ?? existing.email,
          b.phone ?? existing.phone,
          nextRole,
          b.title_vi ?? existing.title_vi,
          b.title_jp ?? existing.title_jp,
          JSON.stringify(nextPerms),
          nextActive,
          targetId
        );

        if (b.newPassword && String(b.newPassword).trim().length >= 4) {
          db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.newPassword).trim()), targetId);
        }

        if (!nextActive) {
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
        }

        const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
        logAudit(currentUser.username, currentUser.full_name, 'UPDATE_USER', `Cập nhật tài khoản & phân quyền: ${updated.username} (Vai trò: ${updated.role}, Active: ${updated.is_active})`);
        return sendJson(res, 200, sanitizeUser(updated));
      }

      if (userIdMatch && method === 'DELETE') {
        if (!perms.canManageUsers) {
          return sendJson(res, 403, { error: 'Bạn không có quyền xóa tài khoản.' });
        }
        const targetId = Number(userIdMatch[1]);
        if (targetId === currentUser.id) {
          return sendJson(res, 400, { error: 'Không thể tự xóa tài khoản đang đăng nhập.' });
        }
        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
        if (!target) return sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });

        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
        db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
        logAudit(currentUser.username, currentUser.full_name, 'DELETE_USER', `Xóa tài khoản: ${target.username} (${target.full_name})`);
        return sendJson(res, 200, { success: true });
      }

      // =======================================================================
      // QUOTATIONS CRUD
      // =======================================================================
      if (pathname === '/api/quotations' && method === 'GET') {
        let rows = db.prepare('SELECT * FROM quotations ORDER BY updated_at DESC, id DESC').all();
        if (!perms.canViewAllQuotes) {
          rows = rows.filter(q =>
            q.created_by === currentUser.username ||
            (q.pic_name && q.pic_name.toLowerCase().includes(currentUser.full_name.toLowerCase()))
          );
        }
        return sendJson(res, 200, rows.map(q => formatQuoteRow(q, showCost)));
      }

      const quoteMatch = pathname.match(/^\/api\/quotations\/(\d+)$/);
      if (quoteMatch && method === 'GET') {
        const id = Number(quoteMatch[1]);
        const row = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        if (!row) return sendJson(res, 404, { error: 'Không tìm thấy báo giá' });
        if (!perms.canViewAllQuotes && row.created_by !== currentUser.username && !(row.pic_name || '').toLowerCase().includes(currentUser.full_name.toLowerCase())) {
          return sendJson(res, 403, { error: 'Bạn chỉ được phân quyền xem các báo giá do chính mình phụ trách.' });
        }
        const revisions = db.prepare('SELECT id, quote_number, revision, quote_date, status, total_after_tax, updated_at FROM quotations WHERE base_code = ? ORDER BY revision ASC').all(row.base_code);
        return sendJson(res, 200, {
          ...formatQuoteRow(row, showCost),
          revisions
        });
      }

      if (pathname === '/api/quotations' && method === 'POST') {
        const body = await readJsonBody(req);
        const rev = Number(body.revision || 1);
        const baseCode = (body.base_code || body.quote_number || `2601-${String(Date.now()).slice(-3)}`).replace(/-\d{2}$/, '');
        const quoteNumber = body.quote_number || `${baseCode}-${String(rev).padStart(2, '0')}`;

        const stmt = db.prepare(`
          INSERT INTO quotations (
            quote_number, base_code, revision, parent_quote_id, quote_date,
            doc_title, flow_type, layout_template, mgmt_fee_mode, status,
            customer_name, customer_address, customer_phone, customer_contact,
            project_name, install_location, lead_time_days, lead_time_note,
            kkvn_address, stamp_type, approver_name, approver_phone,
            pic_name, pic_phone, signer_name,
            selected_product_line, selected_model_code,
            subtotal_cost, subtotal_base, subtotal_before_tax,
            vat_percent, vat_amount, total_after_tax,
            sections_json, terms_json, internal_notes, created_by,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            datetime('now', '+7 hours'), datetime('now', '+7 hours')
          )
        `);

        const info = stmt.run(
          quoteNumber,
          baseCode,
          rev,
          body.parent_quote_id || null,
          body.quote_date || todayVN(),
          body.doc_title || '御見積 BÁO GIÁ',
          body.flow_type || 'detailed',
          body.layout_template || 'tower_bundle',
          body.mgmt_fee_mode || 'separate_to_b',
          body.status || 'draft',
          body.customer_name || 'KHÁCH HÀNG MỚI',
          body.customer_address || '',
          body.customer_phone || '',
          body.customer_contact || '',
          body.project_name || '',
          body.install_location || '',
          Number(body.lead_time_days ?? 180),
          body.lead_time_note || 'Ngày (kể từ ngày nhận cọc)',
          body.kkvn_address || 'KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh',
          body.stamp_type || 'longan',
          body.approver_name || 'Mr Yamanaka Masayuki',
          body.approver_phone || '0908-687-147',
          body.pic_name || currentUser.full_name,
          body.pic_phone || currentUser.phone,
          body.signer_name || 'NGUYỄN BẢO TRƯỜNG',
          body.selected_product_line || '',
          body.selected_model_code || '',
          Number(body.subtotal_cost || 0),
          Number(body.subtotal_base || 0),
          Number(body.subtotal_before_tax || 0),
          Number(body.vat_percent ?? 8),
          Number(body.vat_amount || 0),
          Number(body.total_after_tax || 0),
          JSON.stringify(body.sections || []),
          JSON.stringify({
            ...(body.terms || {}),
            mgmt_fee_percent: Number(body.mgmt_fee_percent ?? body.terms?.mgmt_fee_percent ?? 5)
          }),
          body.internal_notes || '',
          currentUser.username
        );

        const created = db.prepare('SELECT * FROM quotations WHERE id = ?').get(info.lastInsertRowid);
        logAudit(currentUser.username, currentUser.full_name, 'CREATE_QUOTE', `Tạo báo giá ${created.quote_number} - KH: ${created.customer_name}`);
        return sendJson(res, 201, formatQuoteRow(created, showCost));
      }

      if (quoteMatch && method === 'PUT') {
        const id = Number(quoteMatch[1]);
        const existing = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        if (!existing) return sendJson(res, 404, { error: 'Không tìm thấy báo giá' });

        // Rule 1: Approved or Sent quotations are locked and cannot be edited directly
        if (existing.status === 'approved' || existing.status === 'sent') {
          return sendJson(res, 403, {
            error: `Báo giá ${existing.quote_number} đã được phê duyệt / gửi khách hàng nên đã khóa chỉnh sửa. Vui lòng tạo Phiên bản mới (Revision +1) để điều chỉnh.`
          });
        }

        // Rule 2: Only the creator of the quotation or an Admin can edit it
        const isCreator = existing.created_by === currentUser.username;
        const isAdmin = currentUser.role === 'admin';
        if (!isCreator && !isAdmin) {
          return sendJson(res, 403, {
            error: `Chỉ người tạo báo giá (@${existing.created_by}) hoặc Admin mới có quyền chỉnh sửa báo giá này.`
          });
        }

        const body = await readJsonBody(req);
        const subtotalCost = (body.subtotal_cost !== null && body.subtotal_cost !== undefined && showCost)
          ? Number(body.subtotal_cost)
          : existing.subtotal_cost;

        db.prepare(`
          UPDATE quotations SET
            quote_number = ?,
            base_code = ?,
            revision = ?,
            quote_date = ?,
            doc_title = ?,
            flow_type = ?,
            layout_template = ?,
            mgmt_fee_mode = ?,
            status = ?,
            customer_name = ?,
            customer_address = ?,
            customer_phone = ?,
            customer_contact = ?,
            project_name = ?,
            install_location = ?,
            lead_time_days = ?,
            lead_time_note = ?,
            kkvn_address = ?,
            stamp_type = ?,
            approver_name = ?,
            approver_phone = ?,
            pic_name = ?,
            pic_phone = ?,
            signer_name = ?,
            selected_product_line = ?,
            selected_model_code = ?,
            subtotal_cost = ?,
            subtotal_base = ?,
            subtotal_before_tax = ?,
            vat_percent = ?,
            vat_amount = ?,
            total_after_tax = ?,
            sections_json = ?,
            terms_json = ?,
            internal_notes = ?,
            updated_at = datetime('now', '+7 hours')
          WHERE id = ?
        `).run(
          body.quote_number || existing.quote_number,
          body.base_code || existing.base_code,
          Number(body.revision ?? existing.revision),
          body.quote_date || existing.quote_date,
          body.doc_title || existing.doc_title,
          body.flow_type || existing.flow_type,
          body.layout_template || existing.layout_template,
          body.mgmt_fee_mode || existing.mgmt_fee_mode,
          body.status || existing.status,
          body.customer_name ?? existing.customer_name,
          body.customer_address ?? existing.customer_address,
          body.customer_phone ?? existing.customer_phone,
          body.customer_contact ?? existing.customer_contact,
          body.project_name ?? existing.project_name,
          body.install_location ?? existing.install_location,
          Number(body.lead_time_days ?? existing.lead_time_days),
          body.lead_time_note ?? existing.lead_time_note,
          body.kkvn_address ?? existing.kkvn_address,
          body.stamp_type ?? existing.stamp_type,
          body.approver_name ?? existing.approver_name,
          body.approver_phone ?? existing.approver_phone,
          body.pic_name ?? existing.pic_name,
          body.pic_phone ?? existing.pic_phone,
          body.signer_name ?? existing.signer_name,
          body.selected_product_line ?? existing.selected_product_line,
          body.selected_model_code ?? existing.selected_model_code,
          subtotalCost,
          Number(body.subtotal_base ?? existing.subtotal_base),
          Number(body.subtotal_before_tax ?? existing.subtotal_before_tax),
          Number(body.vat_percent ?? existing.vat_percent),
          Number(body.vat_amount ?? existing.vat_amount),
          Number(body.total_after_tax ?? existing.total_after_tax),
          JSON.stringify(body.sections || JSON.parse(existing.sections_json)),
          JSON.stringify({
            ...(body.terms || JSON.parse(existing.terms_json)),
            mgmt_fee_percent: Number(body.mgmt_fee_percent ?? body.terms?.mgmt_fee_percent ?? JSON.parse(existing.terms_json || '{}').mgmt_fee_percent ?? 5)
          }),
          body.internal_notes ?? existing.internal_notes,
          id
        );

        const updated = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        logAudit(currentUser.username, currentUser.full_name, 'UPDATE_QUOTE', `Cập nhật báo giá ${updated.quote_number}`);
        return sendJson(res, 200, formatQuoteRow(updated, showCost));
      }

      if (quoteMatch && method === 'DELETE') {
        if (!perms.canDeleteQuote) {
          return sendJson(res, 403, { error: 'Tài khoản của bạn không được cấp quyền xóa báo giá.' });
        }
        const id = Number(quoteMatch[1]);
        const existing = db.prepare('SELECT quote_number FROM quotations WHERE id = ?').get(id);
        db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
        logAudit(currentUser.username, currentUser.full_name, 'DELETE_QUOTE', `Xóa báo giá ${existing?.quote_number || id}`);
        return sendJson(res, 200, { success: true });
      }

      const revMatch = pathname.match(/^\/api\/quotations\/(\d+)\/revision$/);
      if (revMatch && method === 'POST') {
        const id = Number(revMatch[1]);
        const orig = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        if (!orig) return sendJson(res, 404, { error: 'Không tìm thấy báo giá gốc' });

        const maxRevRow = db.prepare('SELECT MAX(revision) as max_rev FROM quotations WHERE base_code = ?').get(orig.base_code);
        const nextRev = (maxRevRow?.max_rev || orig.revision || 1) + 1;
        const nextQuoteNumber = `${orig.base_code}-${String(nextRev).padStart(2, '0')}`;
        const today = todayVN();

        const info = db.prepare(`
          INSERT INTO quotations (
            quote_number, base_code, revision, parent_quote_id, quote_date,
            doc_title, flow_type, layout_template, mgmt_fee_mode, status,
            customer_name, customer_address, customer_phone, customer_contact,
            project_name, install_location, lead_time_days, lead_time_note,
            kkvn_address, stamp_type, approver_name, approver_phone,
            pic_name, pic_phone, signer_name,
            selected_product_line, selected_model_code,
            subtotal_cost, subtotal_base, subtotal_before_tax,
            vat_percent, vat_amount, total_after_tax,
            sections_json, terms_json, internal_notes, created_by,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, 'draft',
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            datetime('now', '+7 hours'), datetime('now', '+7 hours')
          )
        `).run(
          nextQuoteNumber, orig.base_code, nextRev, orig.id, today,
          orig.doc_title, orig.flow_type, orig.layout_template, orig.mgmt_fee_mode,
          orig.customer_name, orig.customer_address, orig.customer_phone, orig.customer_contact,
          orig.project_name, orig.install_location, orig.lead_time_days, orig.lead_time_note,
          orig.kkvn_address, orig.stamp_type, orig.approver_name, orig.approver_phone,
          orig.pic_name, orig.pic_phone, orig.signer_name,
          orig.selected_product_line, orig.selected_model_code,
          orig.subtotal_cost, orig.subtotal_base, orig.subtotal_before_tax,
          orig.vat_percent, orig.vat_amount, orig.total_after_tax,
          orig.sections_json, orig.terms_json,
          `Phiên bản mới (${nextQuoteNumber}) tạo từ ${orig.quote_number}. ${orig.internal_notes || ''}`,
          currentUser.username
        );

        const created = db.prepare('SELECT * FROM quotations WHERE id = ?').get(info.lastInsertRowid);
        logAudit(currentUser.username, currentUser.full_name, 'NEW_REVISION', `Tạo revision ${created.quote_number} từ ${orig.quote_number}`);
        return sendJson(res, 201, formatQuoteRow(created, showCost));
      }

      const statusMatch = pathname.match(/^\/api\/quotations\/(\d+)\/status$/);
      if (statusMatch && method === 'POST') {
        const id = Number(statusMatch[1]);
        const existing = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        if (!existing) return sendJson(res, 404, { error: 'Không tìm thấy báo giá.' });

        const body = await readJsonBody(req);
        const nextStatus = body.status;

        if ((nextStatus === 'approved' || nextStatus === 'rejected') && !perms.canApproveQuote) {
          return sendJson(res, 403, { error: 'Tài khoản của bạn không có quyền phê duyệt báo giá.' });
        }

        if (nextStatus === 'pending_approval') {
          const isCreator = existing.created_by === currentUser.username;
          const isAdmin = currentUser.role === 'admin';
          if (!isCreator && !isAdmin) {
            return sendJson(res, 403, { error: `Chỉ người tạo báo giá (@${existing.created_by}) hoặc Admin mới có quyền gửi duyệt báo giá này.` });
          }
        }

        if (nextStatus === 'sent') {
          if (existing.status !== 'approved') {
            return sendJson(res, 400, { error: 'Chỉ báo giá Đã duyệt mới có thể chuyển sang trạng thái Đã gửi KH.' });
          }
          const isCreator = existing.created_by === currentUser.username;
          const isAdmin = currentUser.role === 'admin';
          if (!isCreator && !isAdmin && !perms.canApproveQuote) {
            return sendJson(res, 403, { error: 'Chỉ người tạo báo giá hoặc Quản lý/Admin mới có quyền đánh dấu Đã gửi KH.' });
          }
        }

        const isApproving = nextStatus === 'approved';
        const keepApprovedInfo = nextStatus === 'sent';
        const approvedBy = isApproving ? currentUser.full_name : (keepApprovedInfo ? existing.approved_by : null);
        const approvedAt = isApproving ? nowVN() : (keepApprovedInfo ? existing.approved_at : null);
        db.prepare(`
          UPDATE quotations
          SET status = ?, approved_by = ?, approved_at = ?, updated_at = datetime('now', '+7 hours')
          WHERE id = ?
        `).run(nextStatus, approvedBy, approvedAt, id);
        const updated = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
        logAudit(currentUser.username, currentUser.full_name, 'STATUS_CHANGE', `Chuyển trạng thái báo giá ${updated.quote_number} -> ${nextStatus}`);
        return sendJson(res, 200, formatQuoteRow(updated, showCost));
      }

      // --- CATALOG CRUD ---
      if (pathname === '/api/catalog/models' && method === 'POST') {
        if (!perms.canManageCatalog) return sendJson(res, 403, { error: 'Bạn không có quyền quản lý danh mục Model.' });
        const b = await readJsonBody(req);
        const tc = Number(b.tower_cost || 0);
        const tb = Number(b.tower_base || tc * 2);
        const fc = Number(b.fan_cost || 0);
        const fb = Number(b.fan_base || fc * 2);
        const pc = Number(b.pump_cost || 0);
        const pb = Number(b.pump_base || pc * 2);
        const pnc = Number(b.panel_cost || 0);
        const pnb = Number(b.panel_base || pnc * 2);
        const sc = Number(b.stage_cost || 0);
        const sb = Number(b.stage_base || sc * 2);
        const mc = Number(b.mgmt_cost || Math.round((tc + fc + pc + pnc + sc) * 0.05));
        const mb = Number(b.mgmt_base || Math.round((tb + fb + pb + pnb + sb) * 0.05));
        const totCost = tc + fc + pc + pnc + sc + mc;
        const totBase = tb + fb + pb + pnb + sb + mb;
        const dims = getTowerDimensionHint(b.product_line || 'FSW 1.0L', b.model_code || '80');
        const specs = b.specs || {
          tower_dim: dims.towerDim,
          stack_dim: dims.stackDim,
          material: 'FRP',
          pump_spec: getPumpSpecHint(b.pump_model),
          fan_spec: `${(Number(b.flow_rate || 0) * 60).toLocaleString('en-US')} CMH   ${b.fan_pressure_pa || 1000} Pa   ${b.motor_kw || 1.5} Kw, 3phase ,380V,50Hz, 4P,IE3`
        };

        const info = db.prepare(`
          INSERT INTO tower_models (
            product_line, model_code, flow_rate, flow_cmh,
            tower_cost, tower_base, fan_model, motor_kw, fan_pressure_pa, fan_cost, fan_base,
            pump_model, pump_cost, pump_base, panel_cost, panel_base,
            stage_cost, stage_base, mgmt_cost, mgmt_base, total_cost, total_base, specs_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          b.product_line, String(b.model_code), Number(b.flow_rate || 0), Math.round(Number(b.flow_rate || 0) * 60),
          tc, tb, b.fan_model || '', Number(b.motor_kw || 0), Number(b.fan_pressure_pa || 0), fc, fb,
          b.pump_model || '', pc, pb, pnc, pnb, sc, sb, mc, mb, totCost, totBase, JSON.stringify(specs)
        );
        const row = db.prepare('SELECT * FROM tower_models WHERE id = ?').get(info.lastInsertRowid);
        logAudit(currentUser.username, currentUser.full_name, 'ADD_MODEL', `Thêm Model ${row.product_line} - ${row.model_code}`);
        return sendJson(res, 201, formatModelRow(row, showCost));
      }

      if (pathname === '/api/catalog/equipment' && method === 'POST') {
        if (!perms.canManageCatalog) return sendJson(res, 403, { error: 'Bạn không có quyền quản lý danh mục Thiết bị.' });
        const b = await readJsonBody(req);
        const info = db.prepare(`
          INSERT INTO equipment_catalog (
            category, code, name_jp, name_vi, specs, unit,
            cost_price, base_price, is_default_included, default_qty, origin_note
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          b.category || 'option',
          b.code || `EQ-${Date.now().toString().slice(-4)}`,
          b.name_jp || '',
          b.name_vi,
          b.specs || '',
          b.unit || 'Pc/Cái',
          b.cost_price !== null && b.cost_price !== '' ? Number(b.cost_price) : null,
          b.base_price !== null && b.base_price !== '' ? Number(b.base_price) : null,
          b.is_default_included ? 1 : 0,
          Number(b.default_qty || 1),
          b.origin_note || ''
        );
        const row = db.prepare('SELECT * FROM equipment_catalog WHERE id = ?').get(info.lastInsertRowid);
        logAudit(currentUser.username, currentUser.full_name, 'ADD_EQUIP', `Thêm thiết bị ${row.name_vi}`);
        return sendJson(res, 201, formatEquipRow(row, showCost));
      }

      const equipIdMatch = pathname.match(/^\/api\/catalog\/equipment\/(\d+)$/);
      if (equipIdMatch && method === 'DELETE') {
        if (!perms.canManageCatalog) return sendJson(res, 403, { error: 'Bạn không có quyền xóa Thiết bị.' });
        db.prepare('DELETE FROM equipment_catalog WHERE id = ?').run(Number(equipIdMatch[1]));
        return sendJson(res, 200, { success: true });
      }

      // --- EXCEL IMPORT / EXPORT ---
      if (pathname === '/api/catalog/import-excel' && method === 'POST') {
        if (!perms.canManageCatalog) return sendJson(res, 403, { error: 'Bạn không có quyền Import Excel.' });
        const body = await readJsonBody(req);
        let targetPath = path.join(__dirname, '..', 'tài_liệu_từ_khách_hàng', 'Data báo giá.xlsx');
        let tempCreated = false;

        if (body.fileBase64) {
          targetPath = path.join(os.tmpdir(), `kkvn_upload_${Date.now()}.xlsx`);
          fs.writeFileSync(targetPath, Buffer.from(body.fileBase64, 'base64'));
          tempCreated = true;
        } else if (!fs.existsSync(targetPath)) {
          return sendJson(res, 400, { error: 'Không tìm thấy file Excel mặc định trên máy chủ. Vui lòng chọn file .xlsx để tải lên.' });
        }

        const parsed = parseCatalogExcelFile(targetPath);
        if (tempCreated) {
          try { fs.unlinkSync(targetPath); } catch {}
        }

        if (parsed.models && parsed.models.length > 0) {
          db.exec('DELETE FROM tower_models;');
          const insModel = db.prepare(`
            INSERT INTO tower_models (
              product_line, model_code, flow_rate, flow_cmh,
              tower_cost, tower_base, fan_model, motor_kw, fan_pressure_pa, fan_cost, fan_base,
              pump_model, pump_cost, pump_base, panel_cost, panel_base,
              stage_cost, stage_base, mgmt_cost, mgmt_base, total_cost, total_base, specs_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const m of parsed.models) {
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
              m.tower_cost, m.tower_base, m.fan_model, m.motor_kw, m.fan_pressure_pa, m.fan_cost, m.fan_base,
              m.pump_model, m.pump_cost, m.pump_base, m.panel_cost, m.panel_base,
              m.stage_cost, m.stage_base, m.mgmt_cost, m.mgmt_base, m.total_cost, m.total_base,
              JSON.stringify(specs)
            );
          }
        }

        if (parsed.instruments && parsed.instruments.length > 0) {
          const updInst = db.prepare('UPDATE equipment_catalog SET base_price = ?, cost_price = ? WHERE name_vi = ?');
          for (const inst of parsed.instruments) {
            const bp = inst.base_price;
            const cp = bp ? Math.round(bp / 2) : null;
            updInst.run(bp, cp, inst.name_vi);
          }
        }

        logAudit(currentUser.username, currentUser.full_name, 'IMPORT_EXCEL', `Đồng bộ ${parsed.models?.length || 0} model từ file Excel`);
        return sendJson(res, 200, {
          success: true,
          importedModelsCount: parsed.models ? parsed.models.length : 0,
          importedInstrumentsCount: parsed.instruments ? parsed.instruments.length : 0
        });
      }

      if (pathname === '/api/catalog/export-excel' && method === 'GET') {
        const models = db.prepare('SELECT * FROM tower_models ORDER BY id ASC').all();
        const instruments = db.prepare("SELECT * FROM equipment_catalog WHERE category = 'instrument' ORDER BY id ASC").all();
        const xlsxBuf = buildCatalogExcelBuffer(models, instruments);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="Data_bao_gia_Kyowa_Kako.xlsx"'
        });
        return res.end(xlsxBuf);
      }

      return sendJson(res, 404, { error: 'API route not found' });
    }

    // =========================================================================
    // STATIC FILES
    // =========================================================================
    let relPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
    const safePath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`Kyowa Kako Quotation App running at http://localhost:${PORT}`);
});
