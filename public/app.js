const App = (() => {
  let state = {
    authToken: localStorage.getItem('kkvn_auth_token') || '',
    currentUser: null,
    permissions: {
      canViewCost: false,
      canApproveQuote: false,
      canManageCatalog: false,
      canManageUsers: false,
      canViewAllQuotes: true,
      canDeleteQuote: false,
      canExportExcel: false
    },
    users: [],
    usersAdminList: [],
    auditLogs: [],
    rolePresets: {},
    models: [],
    equipment: [],
    quotations: [],
    activeTab: 'flow1',

    // Flow 1 state
    f1: {
      productLine: 'FSD 0.5',
      modelCode: '55',
      flowSearch: '',
      projectName: '',
      customerName: ''
    },

    // Flow 2 active quotation state
    activeQuote: null,
    revisionsList: [],

    // Catalog & filter state
    catFilterProd: 'ALL',
    equipFilterCat: 'ALL',
    quoteSearch: '',
    quoteStatusFilter: 'ALL',

    // Editing user modal state
    editingUser: null
  };

  const PERM_DEFINITIONS = [
    { key: 'canViewCost', label: 'Xem Giá Cost nội bộ & Biên lợi nhuận', desc: 'Hiển thị cột Giá Cost (Sheet 1 Excel) và lợi nhuận gộp trong Báo giá cơ bản, Báo giá chi tiết & Danh mục.' },
    { key: 'canApproveQuote', label: 'Phê duyệt / Từ chối Báo giá', desc: 'Cho phép bấm nút Phê duyệt báo giá (Duyệt giá báo) hoặc yêu cầu chỉnh sửa.' },
    { key: 'canManageCatalog', label: 'Quản lý Danh mục & Đồng bộ Excel', desc: 'Thêm/sửa/xóa Model tháp, Thiết bị đo, Quạt, Bơm, Dịch vụ và Import file Data báo giá.xlsx.' },
    { key: 'canManageUsers', label: 'Quản lý Tài khoản & Phân quyền', desc: 'Tạo tài khoản mới, cấp/thu hồi quyền hạn, đặt lại mật khẩu và khóa/mở khóa tài khoản.' },
    { key: 'canViewAllQuotes', label: 'Xem Báo giá của tất cả nhân viên', desc: 'Nếu tắt, nhân viên chỉ nhìn thấy các báo giá do chính mình lập hoặc đứng tên phụ trách (PIC).' },
    { key: 'canDeleteQuote', label: 'Xóa Hồ sơ Báo giá', desc: 'Cho phép xóa báo giá khỏi cơ sở dữ liệu.' },
    { key: 'canExportExcel', label: 'Xuất dữ liệu Bảng giá ra Excel (.xlsx)', desc: 'Cho phép tải xuống file Excel danh mục gồm cả Giá Cost & Giá Cơ Bản.' }
  ];

  const ROLE_LABELS = {
    admin: 'Admin / Giám Đốc',
    manager: 'Quản lý Kinh doanh',
    sale: 'Nhân viên Kinh doanh (Sale)',
    sale_own: 'Sale (Chỉ xem BG cá nhân)'
  };

  const fmtVnd = (n) => {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    return Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const fmtPdfNum = (n) => {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '-';
    const val = Math.round(Number(n));
    if (val === 0) return '-';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const esc = (s) => {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  function toast(msg) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(state.authToken ? { 'Authorization': `Bearer ${state.authToken}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.includes('/api/auth/login')) {
      showLoginScreen();
      throw new Error(data.error || 'Vui lòng đăng nhập.');
    }
    if (!res.ok) {
      throw new Error(data.error || `Lỗi HTTP ${res.status}`);
    }
    return data;
  }

  // ===========================================================================
  // AUTHENTICATION & LOGIN FLOW
  // ===========================================================================
  async function init() {
    if (!state.authToken) {
      showLoginScreen();
      return;
    }
    try {
      await loadBootstrap();
      hideLoginScreen();
      if (state.quotations.length > 0 && !state.activeQuote) {
        state.activeQuote = JSON.parse(JSON.stringify(state.quotations[0]));
      }
      renderAll();
    } catch (err) {
      console.warn('Session invalid or expired:', err.message);
      showLoginScreen();
    }
  }

  function showLoginScreen(errorMsg = '') {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('hidden');
    const errBox = document.getElementById('loginErrorBox');
    if (errBox) {
      if (errorMsg) {
        errBox.textContent = errorMsg;
        errBox.classList.remove('hidden');
      } else {
        errBox.classList.add('hidden');
      }
    }
  }

  function hideLoginScreen() {
    document.getElementById('loginOverlay')?.classList.add('hidden');
  }

  function toggleLoginPassVisibility() {
    const inp = document.getElementById('loginPassword');
    const btn = document.getElementById('loginPassToggleBtn');
    if (!inp) return;
    const isPass = inp.type === 'password';
    inp.type = isPass ? 'text' : 'password';
    if (btn) btn.textContent = isPass ? 'Ẩn' : 'Hiện';
  }

  async function submitLogin(e) {
    if (e) e.preventDefault();
    const username = document.getElementById('loginUsername')?.value.trim();
    const password = document.getElementById('loginPassword')?.value || '';
    await performLogin(username, password);
  }

  async function performLogin(username, password) {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      state.authToken = data.token;
      localStorage.setItem('kkvn_auth_token', data.token);
      state.currentUser = data.user;
      state.permissions = data.permissions;

      hideLoginScreen();
      await loadBootstrap();
      if (state.quotations.length > 0) {
        state.activeQuote = JSON.parse(JSON.stringify(state.quotations[0]));
      }
      renderAll();
      toast(`Xin chào ${state.currentUser.full_name} (${ROLE_LABELS[state.currentUser.role] || state.currentUser.role})!`);
    } catch (err) {
      showLoginScreen(err.message);
    }
  }

  async function logout() {
    try {
      if (state.authToken) {
        await api('/api/auth/logout', { method: 'POST' }).catch(() => { });
      }
    } finally {
      state.authToken = '';
      state.currentUser = null;
      localStorage.removeItem('kkvn_auth_token');
      showLoginScreen();
      toast('Đã đăng xuất khỏi hệ thống.');
    }
  }

  function openChangePasswordModal() {
    document.getElementById('cpCurrent').value = '';
    document.getElementById('cpNew').value = '';
    document.getElementById('cpConfirm').value = '';
    document.getElementById('changePassModal')?.classList.remove('hidden');
  }

  function closeChangePasswordModal() {
    document.getElementById('changePassModal')?.classList.add('hidden');
  }

  async function submitChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('cpCurrent').value;
    const newPassword = document.getElementById('cpNew').value;
    const confirmPassword = document.getElementById('cpConfirm').value;

    if (newPassword !== confirmPassword) {
      toast('Mật khẩu mới và xác nhận mật khẩu không khớp!');
      return;
    }
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      closeChangePasswordModal();
      toast('Đã đổi mật khẩu thành công!');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  // ===========================================================================
  // BOOTSTRAP & HEADER SYNC
  // ===========================================================================
  async function loadBootstrap() {
    const data = await api('/api/bootstrap');
    state.currentUser = data.currentUser;
    state.permissions = data.permissions;
    state.users = data.users || [];
    state.models = data.tower_models || [];
    state.equipment = data.equipment_catalog || [];
    state.quotations = data.quotations || [];

    // Update Header user info & Dropdown menu
    const u = state.currentUser;
    if (u) {
      const avatar = document.getElementById('headerAvatar');
      if (avatar) avatar.textContent = (u.full_name || u.username || 'U').trim().charAt(0).toUpperCase();
      const nameEl = document.getElementById('headerUserName');
      if (nameEl) nameEl.textContent = u.full_name;
      const badge = document.getElementById('roleBadge');
      if (badge) {
        const rClass = u.role === 'admin' ? 'admin' : u.role === 'manager' ? 'manager' : 'sale';
        badge.className = `role-badge ${rClass}`;
        badge.textContent = u.role === 'admin' ? 'ADMIN' : u.role === 'manager' ? 'QUẢN LÝ' : 'SALE';
      }

      const permChip = document.getElementById('permHeaderChip');
      if (permChip) {
        permChip.innerHTML = state.permissions.canViewCost
          ? '✅ Xem Giá Cost & Duyệt BG'
          : '🔒 Chế độ Sale: Ẩn Giá Cost';
      }

      const ddName = document.getElementById('dropdownFullName');
      if (ddName) ddName.textContent = `${u.full_name} (@${u.username})`;
      const ddTitle = document.getElementById('dropdownUserTitle');
      if (ddTitle) ddTitle.textContent = `${u.title_vi || 'Nhân viên'} · ${u.phone || ''}`;
      const ddPerm = document.getElementById('dropdownPermHint');
      if (ddPerm) {
        const activePerms = [];
        if (state.permissions.canViewCost) activePerms.push('Xem Cost');
        if (state.permissions.canApproveQuote) activePerms.push('Duyệt BG');
        if (state.permissions.canManageCatalog) activePerms.push('Sửa Danh mục');
        if (state.permissions.canManageUsers) activePerms.push('QL Tài khoản');
        ddPerm.textContent = activePerms.length > 0
          ? `Quyền: ${activePerms.join(' · ')}`
          : 'Quyền: Lập & Xuất Báo Giá (Ẩn Giá Cost)';
      }
    }

    document.getElementById('quotesCountBadge').textContent = state.quotations.length;
    document.getElementById('modelsCountBadge').textContent = state.models.length;
    document.getElementById('usersCountBadge').textContent = state.users.length;

    if (state.activeQuote && state.activeQuote.id) {
      const refreshed = state.quotations.find(q => q.id === state.activeQuote.id);
      if (refreshed) {
        state.activeQuote = JSON.parse(JSON.stringify(refreshed));
      } else if (state.quotations.length > 0) {
        state.activeQuote = JSON.parse(JSON.stringify(state.quotations[0]));
      }
    }
    updateActiveQuoteBadge();
  }

  function updateActiveQuoteBadge() {
    const b = document.getElementById('activeQuoteBadge');
    if (b && state.activeQuote) {
      b.textContent = state.activeQuote.quote_number || 'Mới';
    }
  }

  function showTab(tabName) {
    state.activeTab = tabName;
    ['flow1', 'flow2', 'print', 'quotes', 'catalog', 'users'].forEach(t => {
      document.getElementById(`view-${t}`)?.classList.toggle('hidden', t !== tabName);
      document.getElementById(`tabBtn-${t}`)?.classList.toggle('active', t === tabName);
    });
    if (tabName === 'flow1') renderFlow1();
    if (tabName === 'flow2') renderFlow2();
    if (tabName === 'print') renderPrintView();
    if (tabName === 'quotes') renderQuotesList();
    if (tabName === 'catalog') renderCatalogView();
    if (tabName === 'users') loadAndRenderUsersTab();
  }

  function renderAll() {
    renderFlow1();
    renderFlow2();
    renderPrintView();
    renderQuotesList();
    renderCatalogView();
    if (state.activeTab === 'users') {
      loadAndRenderUsersTab();
    }
  }

  // ===========================================================================
  // TAB 1: FLOW 1 – BÁO GIÁ CƠ BẢN (QUICK CONFIGURATOR)
  // ===========================================================================
  function getSelectedF1Model() {
    const list = state.models.filter(m => m.product_line === state.f1.productLine);
    return list.find(m => String(m.model_code) === String(state.f1.modelCode)) || list[0] || state.models[0];
  }

  function buildF1RecommendedHtml() {
    const reqFlow = parseFloat(state.f1.flowSearch);
    if (isNaN(reqFlow) || reqFlow <= 0) return '';
    const productLines = [...new Set(state.models.map(m => m.product_line))];
    const recommendedModels = [];
    productLines.forEach(pl => {
      const match = state.models
        .filter(m => m.product_line === pl && m.flow_rate >= reqFlow)
        .sort((a, b) => a.flow_rate - b.flow_rate)[0];
      if (match) recommendedModels.push(match);
    });
    if (recommendedModels.length === 0) {
      return `
        <div class="alert-box alert-warn">
          <strong>Không tìm thấy Model tiêu chuẩn có lưu lượng ≥ ${reqFlow} m³/min (${fmtVnd(reqFlow * 60)} CMH).</strong>
        </div>
      `;
    }
    return `
      <div class="alert-box alert-info">
        <strong>Gợi ý Model đáp ứng lưu lượng ≥ ${reqFlow} m³/min (${fmtVnd(reqFlow * 60)} CMH):</strong>
        <div class="row" style="margin-top:6px;">
          ${recommendedModels.map(rm => `
            <button class="btn btn-sm" onclick="App.selectRecommendedModel('${esc(rm.product_line)}', '${esc(rm.model_code)}')">
              <strong>${esc(rm.product_line)} - Model ${esc(rm.model_code)}</strong> (${rm.flow_rate} m³/min) · ${fmtVnd(rm.total_base)} đ
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }


  function renderFlow1() {
    const container = document.getElementById('view-flow1');
    if (!container) return;

    const productLines = [...new Set(state.models.map(m => m.product_line))];
    if (!productLines.includes(state.f1.productLine) && productLines.length > 0) {
      state.f1.productLine = productLines[0];
    }
    const modelsInLine = state.models.filter(m => m.product_line === state.f1.productLine);
    const cur = getSelectedF1Model();
    if (cur) state.f1.modelCode = String(cur.model_code);

    const showCost = state.permissions.canViewCost;
    const defaultInstruments = state.equipment.filter(e => e.category === 'instrument' && e.is_default_included);

    const lines = cur ? [
      {
        name: '1. Hệ tháp xử lý khí (FRP)',
        detail: `Dòng ${cur.product_line} – Model ${cur.model_code} · Lưu lượng ${cur.flow_rate} m³/min (${fmtVnd(cur.flow_cmh)} CMH) · KT tham khảo: ${cur.specs?.tower_dim || ''} (FRP)`,
        cost: cur.tower_cost,
        base: cur.tower_base
      },
      {
        name: '2. Quạt hút (Exhaust Fan)',
        detail: `Model ${cur.fan_model} · Motor ${cur.motor_kw} kW · Áp suất ${cur.fan_pressure_pa} Pa (3phase, 380V, 50Hz, 4P, IE3)`,
        cost: cur.fan_cost,
        base: cur.fan_base
      },
      {
        name: '3. Bơm tuần hoàn (Circulation Pump)',
        detail: `Model ${cur.pump_model} (${cur.specs?.pump_spec || ''})`,
        cost: cur.pump_cost,
        base: cur.pump_base
      },
      {
        name: '4. Tủ điện (Control Panel)',
        detail: 'Tủ điều khiển tiêu chuẩn, đấu dây',
        cost: cur.panel_cost,
        base: cur.panel_base
      },
      {
        name: '5. Hệ sắt Stage',
        detail: `Stage, ladder (cầu thang), sàn thao tác, ống khói (${cur.specs?.stack_dim || ''})`,
        cost: cur.stage_cost,
        base: cur.stage_base
      },
      {
        name: '6. Chi phí quản lý, thiết kế (5%)',
        detail: 'Chi phí quản lý dự án, bản vẽ thiết kế & vận hành thử (= 5% tổng 5 mục trên)',
        cost: cur.mgmt_cost,
        base: cur.mgmt_base
      }
    ] : [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Tra Cứu Cấu Hình & Báo Giá Cơ Bản</h2>
          <div class="row">
            <button class="btn btn-primary" onclick="App.startDetailedFromF1('tower_bundle')">
              Báo Giá Chi Tiết (Gộp 1 Set – Mẫu Taikisha) →
            </button>
            <button class="btn btn-navy" onclick="App.startDetailedFromF1('itemized')">
              Báo Giá Chi Tiết (Tách rời từng hạng mục) →
            </button>
          </div>
        </div>

        <div class="grid-4" style="margin-bottom: 14px;">
          <label class="field">
            1. Chọn Dòng sản phẩm (Tháp)
            <select onchange="App.setF1Product(this.value)">
              ${productLines.map(p => `<option value="${esc(p)}" ${p === state.f1.productLine ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
          </label>

          <label class="field">
            2. Chọn Model thuộc dòng ${esc(state.f1.productLine)}
            <select onchange="App.setF1Model(this.value)">
              ${modelsInLine.map(m => `<option value="${esc(m.model_code)}" ${String(m.model_code) === String(state.f1.modelCode) ? 'selected' : ''}>Model ${esc(m.model_code)} · Lưu lượng ${m.flow_rate} m³/min (${fmtVnd(m.flow_cmh)} CMH)</option>`).join('')}
            </select>
          </label>

          <label class="field">
            Tra nhanh theo Lưu lượng cần xử lý (m³/min)
            <input type="number" id="f1FlowSearchInput" placeholder="VD: 55 hoặc 130..." value="${esc(state.f1.flowSearch)}" oninput="App.setF1FlowSearch(this.value)">
          </label>

          <label class="field">
            Tên dự án / Khách hàng
            <input type="text" placeholder="VD: Murata - Biên Hòa" value="${esc(state.f1.projectName)}" oninput="App.setF1Project(this.value)">
          </label>
        </div>

        <div id="f1RecommendedBox">${buildF1RecommendedHtml()}</div>

        ${cur ? `
          <div class="kpi-grid">
            <div class="kpi-box">
              <div class="kpi-label">Cấu hình đang chọn</div>
              <div class="kpi-val">${esc(cur.product_line)} – Model ${esc(cur.model_code)}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-label">Lưu lượng thiết kế</div>
              <div class="kpi-val">${cur.flow_rate} m³/min <small style="font-weight:600;color:#555">(${fmtVnd(cur.flow_cmh)} CMH)</small></div>
            </div>
            ${showCost ? `
              <div class="kpi-box amber">
                <div class="kpi-label">Tổng Giá Cost Nội Bộ (Sheet 1)</div>
                <div class="kpi-val">${fmtVnd(cur.total_cost)} VND</div>
              </div>
            ` : ''}
            <div class="kpi-box green">
              <div class="kpi-label">Tổng Giá Báo Cơ Bản (Sheet 2)</div>
              <div class="kpi-val">${fmtVnd(cur.total_base)} VND</div>
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 24%; min-width: 170px;">Hạng mục cấu hình</th>
                  <th style="min-width: 240px;">Thông số kỹ thuật & Chi tiết tiêu chuẩn</th>
                  ${showCost ? '<th class="r cost-col" style="width: 16%;">Giá Cost nội bộ (VND)</th>' : ''}
                  <th class="r" style="width: 18%;">Giá báo cơ bản (VND)</th>
                </tr>
              </thead>
              <tbody>
                ${lines.map(l => `
                  <tr>
                    <td><strong>${esc(l.name)}</strong></td>
                    <td>${esc(l.detail)}</td>
                    ${showCost ? `<td class="r cost-col">${fmtVnd(l.cost)}</td>` : ''}
                    <td class="r"><strong>${fmtVnd(l.base)}</strong></td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td colspan="2">Tổng báo giá cơ bản (Hệ tháp + Quạt + Bơm + Tủ điện + Hệ sắt Stage + Quản lý, thiết kế)</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(cur.total_cost)}</td>` : ''}
                  <td class="r">${fmtVnd(cur.total_base)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="alert-box alert-warn" style="margin-top: 12px; margin-bottom: 0;">
            <strong>* Lưu ý phạm vi cấu hình cơ bản (Quy tắc chống cộng trùng):</strong>
            <ul style="margin: 4px 0 0 18px; padding: 0;">
              <li><strong>Thiết bị đi kèm mặc định (Đã tính trong giá Hệ tháp):</strong>
                ${defaultInstruments.map(d => `<span class="tag-included">${esc(d.name_vi)} x ${d.default_qty}</span>`).join(' ')}
              </li>
              <li><strong>Chưa bao gồm:</strong> Chi phí vận chuyển và chi phí lắp đặt tại công trình (sẽ được bổ sung tại <em>Báo giá chi tiết</em>).</li>
            </ul>
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Bảng Đối Chiếu Toàn Bộ Model Thuộc Dòng ${esc(state.f1.productLine)} (${modelsInLine.length} model)</h3>
          <span style="font-size:12px;color:var(--muted)">Nhấn vào một dòng bất kỳ để chọn nhanh model đó</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="min-width: 90px;">Model</th>
                <th class="r">Lưu lượng (m³/min)</th>
                <th class="r">Hệ tháp</th>
                <th style="min-width: 140px;">Quạt (Motor / Pa)</th>
                <th class="r">Giá Quạt</th>
                <th style="min-width: 130px;">Dòng Bơm</th>
                <th class="r">Giá Bơm</th>
                <th class="r">Tủ điện</th>
                <th class="r">Hệ sắt Stage</th>
                <th class="r">QL & Thiết kế</th>
                ${showCost ? '<th class="r cost-col">Tổng Cost</th>' : ''}
                <th class="r">Tổng Giá Cơ Bản</th>
              </tr>
            </thead>
            <tbody>
              ${modelsInLine.map(m => `
                <tr class="clickable-row ${String(m.model_code) === String(state.f1.modelCode) ? 'selected-row' : ''}"
                    onclick="App.setF1Model('${esc(m.model_code)}')">
                  <td><strong>Model ${esc(m.model_code)}</strong></td>
                  <td class="r">${m.flow_rate}</td>
                  <td class="r">${fmtVnd(m.tower_base)}</td>
                  <td>${esc(m.fan_model)} (${m.motor_kw}kW, ${m.fan_pressure_pa}Pa)</td>
                  <td class="r">${fmtVnd(m.fan_base)}</td>
                  <td>${esc(m.pump_model)}</td>
                  <td class="r">${fmtVnd(m.pump_base)}</td>
                  <td class="r">${fmtVnd(m.panel_base)}</td>
                  <td class="r">${fmtVnd(m.stage_base)}</td>
                  <td class="r">${fmtVnd(m.mgmt_base)}</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(m.total_cost)}</td>` : ''}
                  <td class="r"><strong>${fmtVnd(m.total_base)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }


  function setF1Product(prod) {
    const prevModel = getSelectedF1Model();
    const prevFlow = prevModel ? Number(prevModel.flow_rate) : null;
    const prevCode = state.f1.modelCode;

    state.f1.productLine = prod;
    const modelsInNewProd = state.models.filter(m => m.product_line === prod);

    // Ưu tiên giữ lại model có cùng Lưu lượng (flow_rate) đã chọn trước đó nếu dòng sản phẩm mới có mức lưu lượng này
    const sameFlowModel = (prevFlow !== null && !Number.isNaN(prevFlow))
      ? modelsInNewProd.find(m => Number(m.flow_rate) === prevFlow)
      : null;
    const sameCodeModel = modelsInNewProd.find(m => String(m.model_code) === String(prevCode));
    const targetModel = sameFlowModel || sameCodeModel || modelsInNewProd[0];

    if (targetModel) {
      state.f1.modelCode = String(targetModel.model_code);
    }
    renderFlow1();
  }

  function setF1Model(code) {
    state.f1.modelCode = String(code);
    renderFlow1();
  }

  function setF1FlowSearch(val) {
    state.f1.flowSearch = val;
    const recBox = document.getElementById('f1RecommendedBox');
    if (recBox) {
      recBox.innerHTML = buildF1RecommendedHtml();
    } else {
      renderFlow1();
    }
  }

  function setF1Project(val) {
    state.f1.projectName = val;
  }

  function selectRecommendedModel(prod, code) {
    state.f1.productLine = prod;
    state.f1.modelCode = String(code);
    renderFlow1();
  }

  function startDetailedFromF1(mode = 'tower_bundle') {
    const m = getSelectedF1Model();
    if (!m) return;

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const seq = String(state.quotations.length + 26).padStart(3, '0');
    const baseCode = `2601-${seq}`;
    const quoteNumber = `${baseCode}-01`;
    const prodSlug = m.product_line.replace(/\s+/g, '-').replace(/L$/, '');
    const towerTitleCode = `${prodSlug.split('-')[0]}-${m.model_code}-${prodSlug.split('-')[1] || '1.0'}`;

    const prodCostSum = (m.tower_cost || 0) + (m.fan_cost || 0) + (m.pump_cost || 0) + (m.panel_cost || 0) + (m.stage_cost || 0);
    const prodBaseSum = (m.tower_base || 0) + (m.fan_base || 0) + (m.pump_base || 0) + (m.panel_base || 0) + (m.stage_base || 0);

    let sections = [];
    if (mode === 'tower_bundle') {
      sections = [
        {
          id: 'sec-a',
          code: 'A./製造 Sản xuất',
          title: 'A./製造 Sản xuất',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (A)',
          bundleMode: 'bundled_set',
          items: [
            {
              id: 'item-a1',
              stt: '1',
              item_type: 'tower_bundle',
              name_jp: '洗浄塔',
              name_vi: `Tháp xử lý   ${towerTitleCode}   ${m.specs?.tower_dim || ''}   (FRP)`,
              specs_text: '',
              unit: 'Set/Bộ',
              quantity: 1,
              cost_price: prodCostSum,
              base_price: prodBaseSum,
              adjustment: 1,
              unit_price: prodBaseSum,
              total_price: prodBaseSum,
              remark: 'KYOWA VN',
              sub_lines: [
                { text: '込む Bao gồm :', right_text: '', remark: '', is_header: true },
                { text: `- Stage,Ladder, 煙thang,sàn thao tác, ống khói: ${m.specs?.stack_dim || 'φ 350 x 850 H'}`, right_text: '', remark: '' },
                { text: '- 計装品Thiết bị đi kèm', right_text: 'x 1 set', remark: '' },
                { text: '   + 差圧計 chênh áp (x1 - đã gồm)', right_text: '', remark: '', is_default_inst: true },
                { text: '   + レベル計 Đo mức tuần hoàn & hóa chất (SUS, cơ x2 - đã gồm)', right_text: '', remark: '', is_default_inst: true },
                { text: '   + 給水電磁弁 Van điện từ nước cấp (Brass x1 - đã gồm)', right_text: '', remark: '', is_default_inst: true },
                { text: `- 排気ファンQuạt hút ${m.fan_model}`, right_text: 'x 1 set', remark: 'KYOWA' },
                { text: `   ${m.specs?.fan_spec || `${m.flow_cmh} CMH   ${m.fan_pressure_pa} Pa   ${m.motor_kw} Kw, 3phase ,380V,50Hz, 4P,IE3`}`, right_text: '', remark: 'Motor Toshiba VN', is_spec_box: true },
                { text: `- 循環ポンプ Bơm tuần hoàn   ${m.pump_model}`, right_text: 'x 1 set', remark: 'KYOWA JP' },
                { text: `   ${m.specs?.pump_spec || m.pump_model}`, right_text: '', remark: '', is_spec_box: true },
                { text: '- 制御盤(INV)・配線Tủ điều khiển + Đấu dây 2m', right_text: 'x 1 set', remark: '' }
              ]
            }
          ]
        },
        {
          id: 'sec-b',
          code: 'B./他Khác',
          title: 'B./他Khác',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (B)',
          bundleMode: 'itemized',
          items: [
            {
              id: 'item-b1', stt: '1', item_type: 'service_mgmt',
              name_jp: '現場管理・設計・試運転費', name_vi: 'Thiết kế, quản lí, vận hành',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: m.mgmt_cost || 0, base_price: m.mgmt_base || 0, adjustment: 1,
              unit_price: m.mgmt_base || 0, total_price: m.mgmt_base || 0, remark: ''
            },
            {
              id: 'item-b2', stt: '2', item_type: 'service',
              name_jp: '運送費', name_vi: 'Vận chuyển',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 18000000, base_price: 26000000, adjustment: 1,
              unit_price: 26000000, total_price: 26000000, remark: 'ko cẩu vào vị trí'
            },
            {
              id: 'item-b3', stt: '3', item_type: 'service',
              name_jp: '現場設置', name_vi: 'Lắp đặt tại công trình',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 70000000, base_price: 104000000, adjustment: 1,
              unit_price: 104000000, total_price: 104000000, remark: ''
            }
          ]
        }
      ];
    } else {
      sections = [
        {
          id: 'sec-a',
          code: 'A./製造 Sản xuất',
          title: 'A./製造 Sản xuất',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (A)',
          bundleMode: 'itemized',
          items: [
            {
              id: 'item-1', stt: '1', item_type: 'tower',
              name_jp: '洗浄塔', name_vi: `Hệ tháp xử lý ${m.product_line} - Model ${m.model_code} (${m.flow_rate} m³/min, FRP)`,
              specs_text: `KT tham khảo: ${m.specs?.tower_dim || ''} · Đã gồm đo mức x2, van điện từ x1, đồng hồ chênh áp x1`,
              unit: 'Set/Bộ', quantity: 1, cost_price: m.tower_cost, base_price: m.tower_base, adjustment: 1,
              unit_price: m.tower_base, total_price: m.tower_base, remark: 'KYOWA VN', sub_lines: []
            },
            {
              id: 'item-2', stt: '2', item_type: 'fan',
              name_jp: '排気ファン', name_vi: `Quạt hút ${m.fan_model} (FRP)`,
              specs_text: `${m.flow_cmh} CMH   ${m.fan_pressure_pa} Pa   ${m.motor_kw} Kw, 3phase ,380V,50Hz, 4P,IE3`,
              unit: 'Set/Bộ', quantity: 1, cost_price: m.fan_cost, base_price: m.fan_base, adjustment: 1,
              unit_price: m.fan_base, total_price: m.fan_base, remark: 'KYOWA', sub_lines: []
            },
            {
              id: 'item-3', stt: '3', item_type: 'pump',
              name_jp: '循環ポンプ', name_vi: `Bơm tuần hoàn ${m.pump_model}`,
              specs_text: m.specs?.pump_spec || m.pump_model,
              unit: 'Set/Bộ', quantity: 1, cost_price: m.pump_cost, base_price: m.pump_base, adjustment: 1,
              unit_price: m.pump_base, total_price: m.pump_base, remark: 'KYOWA JP', sub_lines: []
            },
            {
              id: 'item-4', stt: '4', item_type: 'panel',
              name_jp: '制御盤', name_vi: 'Tủ điện điều khiển + Đấu dây',
              specs_text: '',
              unit: 'Set/Bộ', quantity: 1, cost_price: m.panel_cost, base_price: m.panel_base, adjustment: 1,
              unit_price: m.panel_base, total_price: m.panel_base, remark: 'KYOWA VN', sub_lines: []
            },
            {
              id: 'item-5', stt: '5', item_type: 'stage',
              name_jp: '架台・階段', name_vi: 'Hệ sắt Stage, Ladder, sàn thao tác, ống khói',
              specs_text: `Ống khói: ${m.specs?.stack_dim || 'φ 350 x 850 H'}`,
              unit: 'Set/Bộ', quantity: 1, cost_price: m.stage_cost, base_price: m.stage_base, adjustment: 1,
              unit_price: m.stage_base, total_price: m.stage_base, remark: 'KYOWA VN', sub_lines: []
            }
          ]
        },
        {
          id: 'sec-b',
          code: 'B./他Khác',
          title: 'B./他Khác',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (B)',
          bundleMode: 'itemized',
          items: [
            {
              id: 'item-b1', stt: '1', item_type: 'service_mgmt',
              name_jp: '現場管理・設計・試運転費', name_vi: 'Thiết kế, quản lí, vận hành',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: m.mgmt_cost, base_price: m.mgmt_base, adjustment: 1,
              unit_price: m.mgmt_base, total_price: m.mgmt_base, remark: ''
            },
            {
              id: 'item-b2', stt: '2', item_type: 'service',
              name_jp: '運送費', name_vi: 'Vận chuyển',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 18000000, base_price: 26000000, adjustment: 1,
              unit_price: 26000000, total_price: 26000000, remark: 'ko cẩu vào vị trí'
            },
            {
              id: 'item-b3', stt: '3', item_type: 'service',
              name_jp: '現場設置', name_vi: 'Lắp đặt tại công trình',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 70000000, base_price: 104000000, adjustment: 1,
              unit_price: 104000000, total_price: 104000000, remark: ''
            }
          ]
        }
      ];
    }

    state.activeQuote = {
      id: null,
      quote_number: quoteNumber,
      base_code: baseCode,
      revision: 1,
      quote_date: today,
      doc_title: '御見積 BÁO GIÁ',
      flow_type: 'detailed',
      layout_template: mode === 'tower_bundle' ? 'tower_bundle' : 'itemized',
      mgmt_fee_mode: 'separate_to_b',
      mgmt_fee_percent: 5,
      status: 'draft',
      customer_name: state.f1.customerName || 'CÔNG TY KHÁCH HÀNG',
      customer_address: '',
      customer_phone: '',
      customer_contact: 'Mr. / Mrs.',
      project_name: state.f1.projectName || `Hệ thống xử lý khí ${m.product_line} - Model ${m.model_code}`,
      install_location: '',
      lead_time_days: 180,
      lead_time_note: 'Ngày (kể từ ngày nhận cọc)',
      kkvn_address: 'KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh',
      stamp_type: 'longan',
      approver_name: 'Mr Yamanaka Masayuki',
      approver_phone: '0908-687-147',
      pic_name: state.currentUser?.full_name || 'Mr Bảo Trường',
      pic_phone: state.currentUser?.phone || '0898-687-331',
      signer_name: 'NGUYỄN BẢO TRƯỜNG',
      selected_product_line: m.product_line,
      selected_model_code: String(m.model_code),
      vat_percent: 8,
      sections,
      terms: {
        validity_days: 30,
        delivery_place_vi: 'Tại chân công trình',
        delivery_place_jp: '工事現場で引き渡し',
        delivery_days: 180,
        delivery_note_vi: 'Ngày (Tính từ khi nhận cọc)',
        delivery_note_jp: '日間 (頭金を受けてから)',
        warranty_months: 12,
        warranty_note_vi: 'Tháng (Tính từ khi giao hàng)',
        warranty_note_jp: 'か月（設置後から計算）',
        note_5_vi: 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.\nBG trên chưa bao gồm phí nâng hạ tại công trình và cẩu đưa vào vị trí lắp đặt.',
        payment_mode: 'installments_30_60_10',
        payment_lines: [
          '- Thanh toán lần 1 1回目 : Cọc 30% 契約時に30％前金',
          '- Thanh toán lần 2 2回目 : 60% sau khi giao hàng 納品後に60％',
          '- Thanh toán lần 3 3回目 : 10% sau khi lắp đặt 設置後に残り10％'
        ],
        bank_account_name_vi: 'KYOWA KAKO VIETNAM CO.,LTD',
        bank_account_no: '3680022466',
        bank_name_vi: 'BIDV Bank - Tan Binh Branch, HCMC',
        total_label_before_tax: 'Total (A) + (B) - Before TAX',
        mgmt_fee_percent: 5
      },
      internal_notes: `Khởi tạo từ cấu hình cơ bản ${m.product_line} - Model ${m.model_code} (Tổng giá cơ bản gốc: ${fmtVnd(m.total_base)} VND).`
    };

    recalcActiveQuoteTotals();
    updateActiveQuoteBadge();
    showTab('flow2');
    toast(`Đã nạp cấu hình ${m.product_line} - Model ${m.model_code} sang Báo giá chi tiết!`);
  }

  // ===========================================================================
  // TAB 2: FLOW 2 – LẬP & ĐIỀU CHỈNH BÁO GIÁ CHI TIẾT
  // ===========================================================================
  function isMgmtFeeItem(it) {
    if (!it) return false;
    if (it.item_type === 'service_mgmt') return true;
    const vi = (it.name_vi || '').toLowerCase();
    const jp = (it.name_jp || '').trim();
    return (
      jp === '現場管理・設計・試運転費' ||
      vi.includes('thiết kế, quản l') ||
      vi.includes('chi phí quản lý, thiết kế')
    );
  }

  function computeMgmtFeeAmounts(q, customPct) {
    if (!q) return { pct: 5, prodCostSum: 0, prodBaseSum: 0, cost: 0, base: 0 };
    const rawPct = customPct !== undefined
      ? customPct
      : (q.mgmt_fee_percent ?? q.terms?.mgmt_fee_percent ?? 5);
    const pct = Math.min(100, Math.max(0, Number(rawPct ?? 5)));

    let prodCostSum = 0;
    let prodBaseSum = 0;
    const primarySec = (q.sections && q.sections[0]) ? q.sections[0] : null;
    if (primarySec && Array.isArray(primarySec.items)) {
      primarySec.items.forEach(it => {
        if (!isMgmtFeeItem(it) && it.item_type !== 'service') {
          const qty = Math.max(1, Number(it.quantity || 1));
          prodBaseSum += Math.round(Number(it.base_price || 0) * qty);
          if (it.cost_price !== null && it.cost_price !== undefined) {
            prodCostSum += Math.round(Number(it.cost_price || 0) * qty);
          }
        }
      });
    }

    if (prodBaseSum <= 0 && q.selected_product_line && q.selected_model_code) {
      const refModel = state.models.find(
        m => m.product_line === q.selected_product_line && String(m.model_code) === String(q.selected_model_code)
      );
      if (refModel) {
        prodCostSum = (refModel.tower_cost || 0) + (refModel.fan_cost || 0) + (refModel.pump_cost || 0) + (refModel.panel_cost || 0) + (refModel.stage_cost || 0);
        prodBaseSum = (refModel.tower_base || 0) + (refModel.fan_base || 0) + (refModel.pump_base || 0) + (refModel.panel_base || 0) + (refModel.stage_base || 0);
      }
    }

    const base = Math.round(prodBaseSum * (pct / 100));
    const cost = prodCostSum > 0 ? Math.round(prodCostSum * (pct / 100)) : Math.round(base / 2);
    return { pct, prodCostSum, prodBaseSum, cost, base };
  }

  function normalizeItemPricing(it) {
    if (!it) return;
    it.quantity = Math.max(1, Number(it.quantity || 1));
    if (it.cost_price !== null && it.cost_price !== undefined) {
      it.cost_price = Math.max(0, Number(it.cost_price || 0));
    }
    it.base_price = Math.max(0, Number(it.base_price || 0));

    let adj = it.adjustment;
    if (adj === null || adj === undefined || adj === '' || Number.isNaN(Number(adj))) {
      adj = 1;
    } else {
      adj = Number(adj);
    }

    // Tương thích dữ liệu cũ (chênh lệch cộng/trừ VND chuyển sang hệ số nhân)
    if (adj < 0) {
      adj = (it.base_price > 0 && Number(it.unit_price) >= 0)
        ? Number((Math.max(0, Number(it.unit_price)) / it.base_price).toFixed(4))
        : 1;
    } else if (adj === 0 && it.base_price > 0 && Number(it.unit_price) === it.base_price) {
      adj = 1;
    } else if (adj > 100 && it.base_price > 0) {
      const legacyUnit = Number(it.unit_price) > 0 ? Number(it.unit_price) : (it.base_price + adj);
      adj = Number((legacyUnit / it.base_price).toFixed(4));
    }

    it.adjustment = Math.max(0, adj);
    if (it.unit_price === undefined || it.unit_price === null || Number.isNaN(Number(it.unit_price))) {
      it.unit_price = Math.max(0, Math.round(it.base_price * it.adjustment));
    } else if (!it._keepExactUnitPrice && it.base_price > 0) {
      const expectedUnit = Math.max(0, Math.round(it.base_price * it.adjustment));
      if (Math.abs(Number(it.unit_price) - expectedUnit) > Math.max(1000, it.base_price * 0.0002)) {
        it.unit_price = expectedUnit;
      } else {
        it.unit_price = Math.max(0, Math.round(Number(it.unit_price)));
      }
    } else {
      it.unit_price = Math.max(0, Math.round(Number(it.unit_price || 0)));
    }
  }

  function recalcActiveQuoteTotals() {
    const q = state.activeQuote;
    if (!q) return;
    let subCost = 0;
    let subBase = 0;
    let subBeforeTax = 0;

    (q.sections || []).forEach(sec => {
      let secTotal = 0;
      (sec.items || []).forEach(it => {
        normalizeItemPricing(it);
        const qty = it.quantity;
        const base = it.base_price;
        const unitP = it.unit_price;
        it.total_price = Math.round(unitP * qty);
        secTotal += it.total_price;
        subBeforeTax += it.total_price;
        subBase += Math.round(base * qty);
        if (it.cost_price !== null && it.cost_price !== undefined) {
          subCost += Math.round(Number(it.cost_price) * qty);
        }
      });
      sec.subtotal = secTotal;
    });

    q.subtotal_cost = subCost;
    q.subtotal_base = subBase;
    q.subtotal_before_tax = subBeforeTax;
    q.vat_amount = Math.round(subBeforeTax * (Math.max(0, Number(q.vat_percent || 0)) / 100));
    q.total_after_tax = subBeforeTax + q.vat_amount;
  }

  function renderFlow2() {
    const container = document.getElementById('view-flow2');
    if (!container) return;
    if (!state.activeQuote) {
      container.innerHTML = `<div class="card"><p>Chưa có báo giá nào đang mở. Vui lòng chọn từ Luồng 1 hoặc Danh sách báo giá.</p></div>`;
      return;
    }

    recalcActiveQuoteTotals();
    const q = state.activeQuote;
    const showCost = state.permissions.canViewCost;
    const canApprove = state.permissions.canApproveQuote;
    const canEdit = canUserEditQuote(q);

    const statusLabels = {
      draft: 'Bản nháp',
      pending_approval: 'Chờ duyệt',
      approved: 'Đã duyệt',
      sent: 'Đã gửi KH',
      rejected: 'Cần chỉnh sửa'
    };

    const instrumentsAndOptions = state.equipment.filter(e => e.category === 'instrument' || e.category === 'option');
    const standaloneFansPumps = state.equipment.filter(e => e.category === 'fan' || e.category === 'pump');
    const serviceCatalog = state.equipment.filter(e => e.category === 'service');

    container.innerHTML = `
      ${!canEdit ? `
        <div class="alert-box alert-warn" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div>
            ${(q.status === 'approved' || q.status === 'sent') ? `
              <strong>Báo giá đã ${q.status === 'sent' ? 'gửi khách hàng' : 'được phê duyệt'} (Đã khóa chỉnh sửa):</strong> Hồ sơ <strong>${esc(q.quote_number)}</strong> đã được duyệt nên không thể sửa trực tiếp để đảm bảo tính toàn vẹn dữ liệu. Nếu cần điều chỉnh cho khách hàng, vui lòng tạo <strong>Phiên bản mới (Revision +1)</strong>.
            ` : `
              <strong>Chế độ Chỉ xem (Read-only):</strong> Báo giá này do tài khoản <strong>@${esc(q.created_by || 'khác')}</strong> tạo.
              Theo quy định phân quyền, chỉ <strong>người tạo báo giá</strong> hoặc <strong>Admin</strong> mới có quyền chỉnh sửa nội dung.
            `}
          </div>
          <button class="btn btn-sm btn-navy" onclick="App.createNewRevision(${q.id})">
            📑 Tạo Phiên Bản Mới (Rev +1)
          </button>
        </div>
      ` : ''}

      <div class="card" style="background: linear-gradient(90deg, #f8fafc 0%, #f0fdf4 100%); border-left: 5px solid var(--green);">
        <div class="row-between">
          <div>
            <div class="row" style="align-items:center; gap:10px;">
              <h2 class="card-title" style="margin:0;">
                Báo Giá Chi Tiết: <span style="color:var(--red)">${esc(q.quote_number)}</span>
              </h2>
              <span class="status-pill status-${esc(q.status)}">${statusLabels[q.status] || q.status}</span>
              ${q.id ? `<span style="font-size:12px;color:var(--muted)">(ID: #${q.id} · Rev ${String(q.revision || 1).padStart(2, '0')})</span>` : '<span class="tag-optional">Báo giá mới (Chưa lưu)</span>'}
            </div>
            <div style="font-size:12.5px; color:var(--muted); margin-top:4px;">
              Khách hàng: <strong>${esc(q.customer_name)}</strong> · Dự án: <strong>${esc(q.project_name || '—')}</strong>
              · Người tạo: <strong>@${esc(q.created_by || state.currentUser?.username || '—')}</strong>
              ${q.updated_at ? ` · Cập nhật gần nhất: <strong>${esc(formatDateTimeVN(q.updated_at))}</strong>` : ''}
              ${(q.status === 'approved' || q.status === 'sent') && (q.approved_by || q.approver_name) ? ` · Duyệt bởi: <strong style="color:var(--green)">${esc(q.approved_by || q.approver_name)}</strong>` : ''}
            </div>
          </div>

          <div class="row">
            <label class="field" style="min-width: 230px;">
              Chuyển nhanh giữa các Báo giá đã lưu:
              <select onchange="App.loadQuotationById(this.value)">
                <option value="">-- Chọn báo giá (${state.quotations.length}) --</option>
                ${state.quotations.map(sq => `
                  <option value="${sq.id}" ${sq.id === q.id ? 'selected' : ''}>
                    [${esc(sq.quote_number)}] ${esc(sq.customer_name)} (${fmtVnd(sq.total_after_tax)} đ)
                  </option>
                `).join('')}
              </select>
            </label>

            ${canEdit ? `
              <button class="btn btn-primary" onclick="App.saveActiveQuotation()">
                💾 Lưu Báo Giá
              </button>
              ${(q.status === 'draft' || q.status === 'rejected' || !q.id) ? `
                <button class="btn" style="background:#f59e0b;color:#fff;border-color:#d97706;" onclick="App.saveAndSubmitForApproval()" title="Lưu báo giá và chuyển sang trạng thái Chờ duyệt">
                  📤 Gửi Duyệt
                </button>
              ` : ''}
            ` : `
              <button class="btn" disabled style="opacity:0.65;cursor:not-allowed;"
                      title="${(q.status === 'approved' || q.status === 'sent') ? 'Báo giá đã duyệt/gửi KH không được chỉnh sửa trực tiếp' : `Chỉ người tạo (@${esc(q.created_by)}) hoặc Admin mới có quyền chỉnh sửa`}">
                🔒 ${(q.status === 'approved' || q.status === 'sent') ? 'Đã duyệt (Khóa sửa)' : 'Chỉ xem'}
              </button>
            `}
            ${q.id ? `
              <button class="btn btn-navy" onclick="App.createNewRevision(${q.id})" title="Tạo phiên bản chỉnh sửa mới (-02, -03) giữ nguyên lịch sử giá cũ">
                📑 Tạo Phiên Bản Mới (Rev +1)
              </button>
            ` : ''}
            ${q.id && canApprove && q.status !== 'approved' && q.status !== 'sent' ? `
              <button class="btn btn-primary" style="background:#0284c7;border-color:#0284c7" onclick="App.changeQuoteStatus(${q.id}, 'approved')">
                ✅ Phê Duyệt Báo Giá
              </button>
            ` : ''}
            ${canUserMarkSent(q) ? `
              <button class="btn" style="background:#2563eb;color:#fff;border-color:#1d4ed8;" onclick="App.changeQuoteStatus(${q.id}, 'sent')" title="Xác nhận báo giá này đã được xuất và gửi cho khách hàng">
                📨 Đánh dấu Đã gửi KH
              </button>
            ` : ''}
            <button class="btn btn-navy" onclick="App.showTab('print')">
              🖨️ Xem Bản In / Xuất PDF Chuẩn KKVN
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row-between">
          <div>
            <strong style="color:var(--navy)">Khởi tạo nhanh mẫu bố cục mới:</strong>
            <span style="font-size:12.5px;color:var(--muted);margin-left:6px;">Hỗ trợ đầy đủ 3 định dạng báo giá thực tế của Kyowa Kako Việt Nam</span>
          </div>
          <div class="row">
            <button class="btn btn-sm" onclick="App.showTab('flow1')">
              + Mẫu 1: Trọn bộ Hệ tháp từ Cấu hình cơ bản (Mẫu Taikisha)
            </button>
            <button class="btn btn-sm" onclick="App.createBlankQuoteTemplate('standalone')">
              + Mẫu 2: Báo giá Thiết bị lẻ Quạt / Bơm (Mẫu SMC)
            </button>
            <button class="btn btn-sm" onclick="App.createBlankQuoteTemplate('grouped_areas')">
              + Mẫu 3: Chia theo Khu vực / Nhiều Tháp I, II, III, IV (Mẫu Mektec)
            </button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">1. Thông Tin Hành Chính, Khách Hàng & Dự Án</h3>
          <span style="font-size:12px;color:var(--muted)">Hiển thị trực tiếp trên phần đầu biểu mẫu báo giá song ngữ Nhật – Việt</span>
        </div>

        <div class="grid-4" style="margin-bottom: 12px;">
          <label class="field">
            Số báo giá (Mã - Revision)
            <input type="text" value="${esc(q.quote_number)}" oninput="App.updateQField('quote_number', this.value)">
          </label>
          <label class="field">
            Ngày báo giá
            <input type="date" value="${esc(q.quote_date)}" oninput="App.updateQField('quote_date', this.value)">
          </label>
          <label class="field">
            Tiêu đề biểu mẫu (Song ngữ)
            <select onchange="App.updateQField('doc_title', this.value)">
              <option value="御見積 BÁO GIÁ" ${q.doc_title === '御見積 BÁO GIÁ' ? 'selected' : ''}>御見積 BÁO GIÁ (Tiêu chuẩn)</option>
              <option value="御見積 BÁO GIÁ BƠM KYOWA" ${q.doc_title === '御見積 BÁO GIÁ BƠM KYOWA' ? 'selected' : ''}>御見積 BÁO GIÁ BƠM KYOWA (Mẫu Bơm)</option>
              <option value="御見積 BÁO GIÁ QUẠT KYOWA" ${q.doc_title === '御見積 BÁO GIÁ QUẠT KYOWA' ? 'selected' : ''}>御見積 BÁO GIÁ QUẠT KYOWA (Mẫu Quạt)</option>
            </select>
          </label>
          <label class="field">
            Thời gian đặt hàng (納期 - Ngày)
            <input type="number" value="${esc(q.lead_time_days)}" oninput="App.updateQField('lead_time_days', Number(this.value)); App.updateTermField('delivery_days', Number(this.value));">
          </label>
        </div>

        <div class="grid-2">
          <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--red); display:block; margin-bottom:8px;">THÔNG TIN KHÁCH HÀNG</strong>
            <div class="grid-2" style="gap:10px;">
              <label class="field" style="grid-column: 1 / -1;">
                Tên công ty Khách hàng
                <input type="text" value="${esc(q.customer_name)}" oninput="App.updateQField('customer_name', this.value)">
              </label>
              <label class="field" style="grid-column: 1 / -1;">
                住所 Địa chỉ khách hàng
                <input type="text" value="${esc(q.customer_address)}" oninput="App.updateQField('customer_address', this.value)">
              </label>
              <label class="field">
                電話番号 Điện thoại
                <input type="text" value="${esc(q.customer_phone)}" oninput="App.updateQField('customer_phone', this.value)">
              </label>
              <label class="field">
                連絡先 Liên hệ (Mr./Mrs.)
                <input type="text" value="${esc(q.customer_contact)}" oninput="App.updateQField('customer_contact', this.value)">
              </label>
              <label class="field">
                プロジェクト Dự Án
                <input type="text" value="${esc(q.project_name)}" oninput="App.updateQField('project_name', this.value)">
              </label>
              <label class="field">
                設置先 Nơi lắp đặt
                <input type="text" value="${esc(q.install_location)}" oninput="App.updateQField('install_location', this.value)">
              </label>
            </div>
          </div>

          <div style="background:#f0f4fa; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--navy); display:block; margin-bottom:8px;">KYOWA KAKO VIET NAM CO., LTD</strong>
            <div class="grid-2" style="gap:10px;">
              <label class="field" style="grid-column: 1 / -1;">
                住所 Địa chỉ nhà máy KKVN
                <select onchange="App.updateQField('kkvn_address', this.value)">
                  <option value="KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh" ${q.kkvn_address.includes('Tây Ninh') ? 'selected' : ''}>KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh</option>
                  <option value="KCN Hòa Bình, Huyện Thủ Thừa. Tỉnh Long An" ${q.kkvn_address.includes('Long An') ? 'selected' : ''}>KCN Hòa Bình, Huyện Thủ Thừa. Tỉnh Long An</option>
                </select>
              </label>
              ${(() => {
        const approverUsers = (state.users || []).filter(u =>
          Number(u.is_active ?? 1) !== 0 &&
          (u.role === 'admin' || u.role === 'manager' || u.permissions?.canApproveQuote)
        );
        const curName = String(q.approver_name || '').trim().toLowerCase();
        const matchedApprover = !q._customApprover && approverUsers.find(
          u => String(u.full_name || '').trim().toLowerCase() === curName
        );
        const showCustomInput = Boolean(q._customApprover || (!matchedApprover && curName));

        return `
                  <label class="field">
                    承認者 Người duyệt (Chọn Admin / Giám đốc / Quản lý)
                    <select id="approverUserSelect" onchange="App.onSelectApproverUser(this.value)">
                      ${approverUsers.map(u => {
          const roleNote = u.role === 'admin' ? 'Admin / Giám Đốc' : (u.role === 'manager' ? 'Quản lý KD' : 'Có quyền duyệt');
          return `
                          <option value="${u.id}" ${matchedApprover && matchedApprover.id === u.id ? 'selected' : ''}>
                            ${esc(u.full_name)} (${roleNote})${u.phone ? ` · ${esc(u.phone)}` : ''}
                          </option>
                        `;
        }).join('')}
                      <option value="__custom__" ${showCustomInput ? 'selected' : ''}>✍️ Tùy chỉnh tên người duyệt khác...</option>
                    </select>
                    <input type="text" id="approverNameCustomInput"
                           style="margin-top:4px; display:${showCustomInput ? 'block' : 'none'};"
                           value="${esc(q.approver_name || '')}"
                           placeholder="Nhập họ tên người duyệt..."
                           oninput="App.updateQField('approver_name', this.value)">
                  </label>
                  <label class="field">
                    SĐT Người duyệt
                    <input type="text" id="approverPhoneInput" value="${esc(q.approver_phone || '')}"
                           oninput="App.updateQField('approver_phone', this.value)">
                  </label>
                `;
      })()}
              <label class="field">
                担当者 Người đảm trách (Sale/PIC)
                <input type="text" value="${esc(q.pic_name)}" oninput="App.updateQField('pic_name', this.value)">
              </label>
              <label class="field">
                SĐT Người đảm trách
                <input type="text" value="${esc(q.pic_phone)}" oninput="App.updateQField('pic_phone', this.value)">
              </label>
              <label class="field">
                Con dấu & Chữ ký trên bản in
                <select onchange="App.updateQField('stamp_type', this.value)">
                  <option value="longan" ${q.stamp_type === 'longan' ? 'selected' : ''}>Mộc đỏ Long An + Chữ ký Nguyễn Bảo Trường</option>
                  <option value="tayninh" ${q.stamp_type === 'tayninh' ? 'selected' : ''}>Mộc đỏ Tây Ninh + Chữ ký Nguyễn Bảo Trường</option>
                  <option value="none" ${q.stamp_type === 'none' ? 'selected' : ''}>Không hiển thị con dấu (Đóng dấu tươi sau khi in)</option>
                </select>
              </label>
              <label class="field">
                Người ký đại diện Phòng KD
                <input type="text" value="${esc(q.signer_name || 'NGUYỄN BẢO TRƯỜNG')}" oninput="App.updateQField('signer_name', this.value)">
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">2. Quy Tắc Chi Phí Quản Lý/Thiết Kế & Bộ Công Cụ Thêm Nhanh Thiết Bị / Dịch Vụ</h3>
        </div>

        <div class="grid-3" style="margin-bottom: 14px;">
          ${(() => {
        const mgmtInfo = computeMgmtFeeAmounts(q);
        const mgmtPct = mgmtInfo.pct;
        return `
              <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
                <div class="row-between" style="margin-bottom:6px; gap:6px;">
                  <strong style="color:var(--navy);">Quy tắc "Chi phí quản lý, thiết kế" (<span id="mgmtFeePctTitle">${mgmtPct}</span>%)</strong>
                  <div style="display:flex; align-items:center; gap:4px; background:#fff; padding:3px 8px; border-radius:6px; border:1px solid #93c5fd;">
                    <span style="font-size:12px; font-weight:700; color:var(--navy);">Mức phí:</span>
                    <input type="number" id="mgmtFeePercentInput" class="num" min="0" max="100" step="0.1"
                           style="width:62px; padding:3px 6px; font-weight:700; color:var(--navy); border:1px solid #cbd5e1;"
                           value="${mgmtPct}"
                           title="Mặc định 5%, có thể điều chỉnh tỷ lệ % tùy ý"
                           onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                           oninput="App.onMgmtFeePercentInput(this.value, this)"
                           onblur="App.onMgmtFeePercentBlur(this)">
                    <span style="font-size:12.5px; font-weight:700; color:var(--navy);">%</span>
                  </div>
                </div>
                <div class="row-between" style="margin-bottom:8px; gap:6px;">
                  <div class="row" style="gap:4px;">
                    ${[0, 3, 5, 8, 10].map(pct => `
                      <button type="button" class="btn btn-sm ${Number(mgmtPct) === pct ? 'btn-navy' : ''}"
                              id="mgmtPctBtn-${pct}"
                              style="padding:2px 7px; font-size:11.5px;"
                              onclick="App.setQuickMgmtFeePercent(${pct})">
                        ${pct === 5 ? '5%' : `${pct}%`}
                      </button>
                    `).join('')}
                  </div>
                  <span id="mgmtFeeCalcHint" style="font-size:11.5px; font-weight:700; color:var(--green);" title="Giá gốc cơ bản của khoản Chi phí quản lý, thiết kế tương ứng với tỷ lệ % đang chọn">
                    = ${fmtVnd(mgmtInfo.base)} đ
                  </span>
                </div>
                <p style="font-size:12px; color:var(--muted); margin:0 0 8px;">
                  Tránh tính trùng khoản Quản lý & Thiết kế đã có trong cấu hình cơ bản khi thêm mục B. Khác:
                </p>
                <select style="width:100%" onchange="App.handleMgmtFeeModeChange(this.value)">
                  <option value="separate_to_b" ${q.mgmt_fee_mode === 'separate_to_b' ? 'selected' : ''}>1. Thay thế / Tách sang mục B. Khác (Chuẩn mẫu Taikisha - Không cộng trùng)</option>
                  <option value="included_in_a" ${q.mgmt_fee_mode === 'included_in_a' ? 'selected' : ''}>2. Gộp chung trong mục Sản xuất A (Không tách mục B)</option>
                  <option value="additional" ${q.mgmt_fee_mode === 'additional' ? 'selected' : ''}>3. Cộng bổ sung riêng (Giữ nguyên giá cơ bản + Thêm phí thiết kế mới)</option>
                </select>
              </div>
            `;
      })()}

          <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--navy); display:block; margin-bottom:6px;">Thêm Thiết bị đo & Option vào Báo giá</strong>
            <p style="font-size:12px; color:var(--muted); margin:0 0 8px;">
              4 thiết bị mặc định đã đánh dấu <span class="tag-included">Đã gồm</span> để tránh cộng trùng:
            </p>
            <div class="quick-add-row">
              <select id="quickAddInstSelect">
                ${instrumentsAndOptions.map(eq => `
                  <option value="${eq.id}">
                    ${eq.is_default_included ? '[ĐÃ GỒM MẶC ĐỊNH] ' : '[+ OPTION] '}
                    ${esc(eq.name_vi)} — ${eq.base_price ? fmtVnd(eq.base_price) + ' đ' : 'Chưa có giá'}
                  </option>
                `).join('')}
              </select>
              <button class="btn btn-sm btn-primary" onclick="App.quickAddEquipment('quickAddInstSelect')">
                + Thêm dòng
              </button>
            </div>
          </div>

          <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--navy); display:block; margin-bottom:6px;">Thêm nhanh Quạt / Bơm lẻ & Dịch vụ</strong>
            <div class="quick-add-row" style="margin-bottom:6px;">
              <select id="quickAddFanPumpSelect">
                ${standaloneFansPumps.map(eq => `
                  <option value="${eq.id}">[${eq.category.toUpperCase()}] ${esc(eq.name_vi)} — ${fmtVnd(eq.base_price)} đ</option>
                `).join('')}
              </select>
              <button class="btn btn-sm btn-navy" onclick="App.quickAddEquipment('quickAddFanPumpSelect')">
                + Thêm TB
              </button>
            </div>
            <div class="quick-add-row">
              <select id="quickAddServiceSelect">
                ${serviceCatalog.map(eq => `
                  <option value="${eq.id}">[DỊCH VỤ] ${esc(eq.name_vi)} — ${fmtVnd(eq.base_price)} đ</option>
                `).join('')}
              </select>
              <button class="btn btn-sm btn-primary" onclick="App.quickAddEquipment('quickAddServiceSelect')">
                + Thêm DV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">3. Chi Tiết Các Hạng Mục Báo Giá & Điều Chỉnh Thương Lượng</h3>
          <div class="row">
            <button class="btn btn-sm btn-navy" onclick="App.addSection()">
              + Thêm Nhóm / Khu Vực Mới (VD: B./Khác, II. PH1 - Tháp SCR...)
            </button>
          </div>
        </div>

        ${(() => {
        const allItems = (q.sections || []).flatMap(s => s.items || []);
        const firstFactor = allItems.length > 0 ? Number(allItems[0].adjustment ?? 1) : 1;
        const isUniform = allItems.length > 0 && allItems.every(it => Math.abs(Number(it.adjustment ?? 1) - firstFactor) < 0.0001);
        const bulkVal = isUniform ? firstFactor : (q.bulk_factor ?? 1);
        return `
            <div style="background: linear-gradient(90deg, #f8fafc 0%, #eff6ff 100%); border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <div class="row-between" style="flex-wrap: wrap; gap: 12px;">
                <div>
                  <div class="row" style="align-items: center; gap: 8px; margin-bottom: 4px;">
                    <strong style="color: var(--navy); font-size: 13.5px;">⚙️ Điều Chỉnh Hệ Số Chênh Lệch Giá (Đơn giá = Giá gốc × Hệ số)</strong>
                    <span id="bulkFactorStatusBadge" class="status-pill ${isUniform ? 'status-approved' : 'status-pending_approval'}" style="font-size: 11.5px;">
                      ${isUniform ? `Đang đồng bộ tất cả: ×${firstFactor}` : 'Đang tùy chỉnh riêng từng hạng mục'}
                    </span>
                  </div>
                </div>

                <div class="row" style="align-items: center; gap: 8px; flex-wrap: wrap;">
                  <div class="bulk-factor-box">
                    <span style="font-size: 12.5px; font-weight: 700; color: var(--navy);">Hệ số tất cả: ×</span>
                    <input type="number" id="bulkFactorInput" class="num" min="0" step="0.01"
                           style="width: 82px; padding: 4px 6px; font-weight: 700; color: var(--navy); border: 1px solid #cbd5e1;"
                           value="${bulkVal}"
                           onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                           oninput="App.applyBulkFactorToAll(this.value, this, false)"
                           onblur="App.handleBulkFactorBlur(this)">
                    <button type="button" class="btn btn-sm btn-primary"
                            onclick="App.applyBulkFactorToAll(document.getElementById('bulkFactorInput')?.value, document.getElementById('bulkFactorInput'), true)">
                      Áp dụng tất cả
                    </button>
                  </div>
                  <div class="row" style="gap: 4px;">
                    <button type="button" class="btn btn-sm" style="padding: 4px 7px; font-size: 11.5px; font-weight: 700;" onclick="App.setQuickBulkFactor(1)" title="Đưa tất cả về Giá gốc cơ bản (×1)">×1.0 (Gốc)</button>
                    <button type="button" class="btn btn-sm" style="padding: 4px 7px; font-size: 11.5px;" onclick="App.setQuickBulkFactor(1.05)" title="Tăng 5% toàn bộ">×1.05</button>
                    <button type="button" class="btn btn-sm" style="padding: 4px 7px; font-size: 11.5px;" onclick="App.setQuickBulkFactor(1.1)" title="Tăng 10% toàn bộ">×1.1</button>
                    <button type="button" class="btn btn-sm" style="padding: 4px 7px; font-size: 11.5px;" onclick="App.setQuickBulkFactor(1.15)" title="Tăng 15% toàn bộ">×1.15</button>
                    <button type="button" class="btn btn-sm" style="padding: 4px 7px; font-size: 11.5px;" onclick="App.setQuickBulkFactor(1.2)" title="Tăng 20% toàn bộ">×1.2</button>
                  </div>
                </div>
              </div>
            </div>
          `;
      })()}

        ${(q.sections || []).map((sec, sIdx) => `
          <div style="border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; background: #fff;">
            <div class="row-between sec-header-bar">
              <div class="row sec-header-fields">
                <label class="field sec-title-field">
                  Tiêu đề Nhóm / Phân khu (Để trống nếu không chia nhóm như mẫu SMC)
                  <input type="text" value="${esc(sec.title)}" placeholder="VD: A./製造 Sản xuất hoặc I. PH1 - Tháp SCR 1-1"
                         oninput="App.updateSectionField(${sIdx}, 'title', this.value)">
                </label>
                <label class="field sec-sublabel-field">
                  Nhãn dòng Tổng nhóm
                  <input type="text" value="${esc(sec.subtotalLabel || '')}" placeholder="VD: TOTAL (A)"
                         oninput="App.updateSectionField(${sIdx}, 'subtotalLabel', this.value)">
                </label>
                <label class="sec-subcheck-label">
                  <input type="checkbox" ${sec.showSubtotal ? 'checked' : ''}
                         onchange="App.updateSectionField(${sIdx}, 'showSubtotal', this.checked)">
                  Hiện Tổng nhóm
                </label>
              </div>
              <div class="row">
                <button class="btn btn-sm btn-primary" onclick="App.addBlankItem(${sIdx})">
                  + Thêm Hạng Mục Vào Nhóm Này
                </button>
                ${q.sections.length > 1 ? `
                  <button class="btn btn-sm btn-danger" onclick="App.removeSection(${sIdx})" title="Xóa nhóm này">
                    Xóa Nhóm
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:45px" class="c">STT</th>
                    <th style="width:120px; min-width:115px;">Tên tiếng Nhật</th>
                    <th style="min-width:290px;">Tên hạng mục (Tiếng Việt) & Thông số / Cấu hình đi kèm</th>
                    <th style="width:78px" class="c">Đơn vị</th>
                    <th style="width:65px" class="r">SL</th>
                    ${showCost ? '<th style="width:125px" class="r cost-col">Giá Cost (VND)</th>' : ''}
                    <th style="width:130px" class="r">Giá gốc cơ bản</th>
                    <th style="width:130px" class="r" title="Hệ số nhân điều chỉnh cho từng hạng mục (Đơn giá = Giá gốc × Hệ số)">Chênh lệch</th>
                    <th style="width:135px" class="r">Đơn giá sau ĐC</th>
                    <th style="width:135px" class="r">Thành tiền</th>
                    <th style="width:110px">Ghi chú</th>
                    <th style="width:44px" class="c">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  ${(sec.items || []).map((it, iIdx) => {
        const belowCost = showCost && it.cost_price && it.unit_price < it.cost_price;
        return `
                      <tr>
                        <td class="c">
                          <input type="text" style="width:38px;text-align:center;padding:4px" value="${esc(it.stt)}"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'stt', this.value)">
                        </td>
                        <td>
                          <input type="text" style="width:100%;padding:5px" value="${esc(it.name_jp || '')}" placeholder="洗浄塔 / 排気ファン"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'name_jp', this.value)">
                        </td>
                        <td>
                          <input type="text" style="width:100%;font-weight:700;margin-bottom:4px;" value="${esc(it.name_vi || '')}"
                                 placeholder="Tên thiết bị / dịch vụ..."
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'name_vi', this.value)">
                          <input type="text" style="width:100%;font-size:12px;color:#374151;" value="${esc(it.specs_text || '')}"
                                 placeholder="Dòng thông số phụ (VD: 850 CMM  1500 Pa  45 Kw, 3phase, 380V... hoặc 385 L/min x 10m x 2.2kW)"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'specs_text', this.value)">

                          <div style="margin-top:6px;">
                            <div class="row-between" style="margin-bottom:4px;">
                              <button class="btn btn-sm" style="padding:2px 8px;font-size:11px;" onclick="App.addSubLine(${sIdx}, ${iIdx})">
                                + Thêm dòng mô tả con
                              </button>
                            </div>
                            ${(it.sub_lines || []).map((sl, slIdx) => `
                              <div class="subline-row">
                                <input type="text" style="flex:1;min-width:140px;padding:3px 6px;font-size:12px;background:#f8fafc"
                                       value="${esc(sl.text)}" placeholder="Nội dung dòng con (VD: + pH計Đo pH)"
                                       oninput="App.updateSubLine(${sIdx}, ${iIdx}, ${slIdx}, 'text', this.value)">
                                <input type="text" style="width:72px;padding:3px 6px;font-size:12px;background:#f8fafc"
                                       value="${esc(sl.right_text || '')}" placeholder="x 1 set"
                                       oninput="App.updateSubLine(${sIdx}, ${iIdx}, ${slIdx}, 'right_text', this.value)">
                                <input type="text" style="width:110px;padding:3px 6px;font-size:12px;background:#f8fafc"
                                       value="${esc(sl.remark || '')}" placeholder="Ghi chú dòng con"
                                       oninput="App.updateSubLine(${sIdx}, ${iIdx}, ${slIdx}, 'remark', this.value)">
                                <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:11px;"
                                        onclick="App.removeSubLine(${sIdx}, ${iIdx}, ${slIdx})">×</button>
                              </div>
                            `).join('')}
                          </div>
                        </td>
                        <td class="c">
                          <input type="text" style="width:70px;text-align:center;padding:5px" value="${esc(it.unit || 'Pc/Cái')}"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'unit', this.value)">
                        </td>
                        <td class="r">
                          <input type="number" id="input-qty-${sIdx}-${iIdx}" class="num" style="width:56px;padding:5px" min="1" value="${it.quantity || 1}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'quantity', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'quantity', this)">
                        </td>
                        ${showCost ? `
                          <td class="r cost-col">
                            <input type="number" id="input-cost-${sIdx}-${iIdx}" class="num" style="width:115px;padding:5px;background:#fffbeb" min="0" value="${it.cost_price || 0}"
                                   onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                   oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'cost_price', this.value, this)"
                                   onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'cost_price', this)">
                          </td>
                        ` : ''}
                        <td class="r">
                          <input type="number" id="input-base-${sIdx}-${iIdx}" class="num" style="width:120px;padding:5px" min="0" value="${it.base_price || 0}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'base_price', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'base_price', this)">
                        </td>
                        <td class="r">
                          <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;">
                            <span style="font-size:12px;color:var(--muted);font-weight:700;">×</span>
                            <input type="number" id="input-adj-${sIdx}-${iIdx}" class="num" min="0" step="0.01"
                                   style="width:96px;padding:5px;color:${Number(it.adjustment ?? 1) < 1 ? 'var(--red)' : Number(it.adjustment ?? 1) > 1 ? 'var(--green)' : 'inherit'};font-weight:700;"
                                   value="${it.adjustment ?? 1}"
                                   onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                   oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'adjustment', this.value, this)"
                                   onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'adjustment', this)">
                          </div>
                          <div id="adj-diff-hint-${sIdx}-${iIdx}" style="font-size:10.5px;color:${(it.unit_price - it.base_price) < 0 ? 'var(--red)' : (it.unit_price - it.base_price) > 0 ? 'var(--green)' : 'var(--muted)'};margin-top:2px;">
                            ${(it.unit_price - it.base_price) === 0 ? 'Giá gốc (×1)' : `${(it.unit_price - it.base_price) > 0 ? '+' : ''}${fmtVnd(it.unit_price - it.base_price)} đ`}
                          </div>
                        </td>
                        <td class="r">
                          <input type="number" id="input-unit-${sIdx}-${iIdx}" class="num" style="width:125px;padding:5px;font-weight:700;background:#f0fdf4;" min="0"
                                 value="${it.unit_price || 0}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'unit_price', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'unit_price', this)">
                          <div id="below-cost-${sIdx}-${iIdx}" style="color:var(--red);font-size:10.5px;font-weight:700;display:${belowCost ? 'block' : 'none'};">⚠️ Thấp hơn Cost!</div>
                        </td>
                        <td class="r" id="cell-total-${sIdx}-${iIdx}" style="font-weight:700;">
                          ${fmtVnd(it.total_price)}
                        </td>
                        <td>
                          <input type="text" style="width:100px;padding:5px" value="${esc(it.remark || '')}" placeholder="KYOWA JP..."
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'remark', this.value)">
                        </td>
                        <td class="c">
                          <button class="btn btn-sm btn-danger" onclick="App.removeItem(${sIdx}, ${iIdx})" title="Xóa hạng mục này">🗑</button>
                        </td>
                      </tr>
                    `;
      }).join('')}
                  ${sec.showSubtotal ? `
                    <tr class="sub-row">
                      <td colspan="${showCost ? 9 : 8}" class="r">${esc(sec.subtotalLabel || 'Cộng nhóm')}</td>
                      <td class="r" id="sec-subtotal-${sIdx}">${fmtVnd(sec.subtotal)}</td>
                      <td colspan="2"></td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">4. Điều Kiện Thương Mại (記 Ghi chú ① → ⑦)</h3>
            <div class="row">
              <button class="btn btn-sm" onclick="App.applyTermsPreset('taikisha')">Mẫu Hệ Tháp (30-60-10)</button>
              <button class="btn btn-sm" onclick="App.applyTermsPreset('smc')">Mẫu Thiết Bị Lẻ (Thỏa thuận)</button>
              <button class="btn btn-sm" onclick="App.applyTermsPreset('mektec')">Mẫu Bơm (BH 6T)</button>
            </div>
          </div>

          <div class="grid-2" style="gap:10px;">
            <label class="field">
              ① Thời hạn báo giá (Ngày / 日間)
              <input type="number" value="${esc(q.terms?.validity_days ?? 30)}"
                     oninput="App.updateTermField('validity_days', Number(this.value))">
            </label>
            <label class="field">
              ② Địa điểm giao hàng (Tiếng Việt)
              <input type="text" value="${esc(q.terms?.delivery_place_vi || '')}"
                     oninput="App.updateTermField('delivery_place_vi', this.value)">
            </label>
            <label class="field">
              ③ Thời gian giao hàng (Ngày / 日間)
              <input type="number" value="${esc(q.terms?.delivery_days ?? 180)}"
                     oninput="App.updateTermField('delivery_days', Number(this.value))">
            </label>
            <label class="field">
              ④ Thời hạn bảo hành (Tháng / か月)
              <input type="number" value="${esc(q.terms?.warranty_months ?? 12)}"
                     oninput="App.updateTermField('warranty_months', Number(this.value))">
            </label>
            <label class="field" style="grid-column: 1 / -1;">
              ⑤ Ghi chú phạm vi kỹ thuật / điều kiện áp dụng
              <textarea rows="2" oninput="App.updateTermField('note_5_vi', this.value)">${esc(q.terms?.note_5_vi || '')}</textarea>
            </label>
            <label class="field" style="grid-column: 1 / -1;">
              ⑥ Phương pháp thanh toán (Mỗi dòng 1 đợt thanh toán)
              <textarea rows="3" oninput="App.updatePaymentLines(this.value)">${esc((q.terms?.payment_lines || []).join('\n'))}</textarea>
            </label>
            <label class="field">
              ⑦ Tên tài khoản ngân hàng
              <input type="text" value="${esc(q.terms?.bank_account_name_vi || 'KYOWA KAKO VIETNAM CO.,LTD')}"
                     oninput="App.updateTermField('bank_account_name_vi', this.value)">
            </label>
            <label class="field">
              Số tài khoản & Ngân hàng
              <input type="text" value="${esc(q.terms?.bank_account_no || '3680022466')} - ${esc(q.terms?.bank_name_vi || 'BIDV - CN Tân Bình')}"
                     oninput="App.updateBankCombined(this.value)">
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">5. Tổng Hợp Giá Báo, Chênh Lệch & Thuế VAT</h3>
            <div class="row" style="align-items:center;gap:6px;">
              <span style="font-weight:700;font-size:13px;">Thuế suất VAT:</span>
              <div class="row" style="gap:4px;">
                ${[0, 5, 8, 10].map(pct => `
                  <button type="button" class="btn btn-sm ${Number(q.vat_percent) === pct ? 'btn-navy' : ''}"
                          id="vatPresetBtn-${pct}"
                          style="padding:4px 8px;font-size:12px;"
                          onclick="App.setQuickVatPercent(${pct})">${pct}%</button>
                `).join('')}
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="vatPercentInput" class="num" min="0" max="100" step="0.1"
                       style="width:72px;padding:5px 7px;font-weight:700;"
                       value="${q.vat_percent ?? 8}"
                       title="Nhập mức thuế VAT tùy ý (%)"
                       onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                       oninput="App.onVatPercentInput(this.value, this)">
                <span style="font-weight:700;">%</span>
              </div>
            </div>
          </div>

          <table class="data-table" id="summaryTotalsTable">
            <tbody>
              ${showCost ? `
                <tr>
                  <td class="cost-col"><strong>Tổng Giá Cost Nội Bộ (Snapshot tại thời điểm lập)</strong></td>
                  <td class="r cost-col" id="sumCostVal"><strong>${fmtVnd(q.subtotal_cost)} VND</strong></td>
                </tr>
              ` : ''}
              <tr>
                <td>Tổng Giá Gốc Cơ Bản (Trước điều chỉnh thương lượng)</td>
                <td class="r" id="sumBaseVal">${fmtVnd(q.subtotal_base)} VND</td>
              </tr>
              <tr>
                <td>Tổng Chênh Lệch Thương Lượng (+/-)</td>
                <td class="r" id="sumDiffVal" style="font-weight:700;color:${(q.subtotal_before_tax - q.subtotal_base) < 0 ? 'var(--red)' : 'var(--green)'}">
                  ${(q.subtotal_before_tax - q.subtotal_base) >= 0 ? '+' : ''}${fmtVnd(q.subtotal_before_tax - q.subtotal_base)} VND
                </td>
              </tr>
              <tr class="sub-row">
                <td>${esc(q.terms?.total_label_before_tax || 'Tổng trước thuế (Total Before TAX)')}</td>
                <td class="r" id="sumPreTaxVal">${fmtVnd(q.subtotal_before_tax)} VND</td>
              </tr>
              <tr>
                <td id="sumVatLabel">Thuế GTGT (TAX VAT ${q.vat_percent}%)</td>
                <td class="r" id="sumVatVal">${fmtVnd(q.vat_amount)} VND</td>
              </tr>
              <tr class="total-row">
                <td>TỔNG CỘNG SAU THUẾ (Total - After TAX)</td>
                <td class="r" id="sumPostTaxVal">${fmtVnd(q.total_after_tax)} VND</td>
              </tr>
              ${showCost ? `
                <tr>
                  <td class="cost-col"><strong>Lợi nhuận gộp dự kiến (Giá trước thuế − Giá Cost)</strong></td>
                  <td class="r cost-col" id="sumMarginVal">
                    <strong>+${fmtVnd(q.subtotal_before_tax - q.subtotal_cost)} VND</strong>
                    (${q.subtotal_before_tax > 0 ? Math.round(((q.subtotal_before_tax - q.subtotal_cost) / q.subtotal_before_tax) * 100) : 0}%)
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>

          <label class="field" style="margin-top: 12px;">
            Ghi chú nội bộ (Chỉ lưu trong hệ thống, không in ra báo giá khách hàng)
            <textarea rows="2" placeholder="Ghi chú lịch sử thương lượng, chiết khấu, yêu cầu đặc biệt..."
                      oninput="App.updateQField('internal_notes', this.value)">${esc(q.internal_notes || '')}</textarea>
          </label>

          <div class="row" style="margin-top: 14px; justify-content: flex-end;">
            ${canEdit ? `
              <button class="btn btn-primary" onclick="App.saveActiveQuotation()">
                💾 Lưu Báo Giá Hiện Tại
              </button>
              ${(q.status === 'draft' || q.status === 'rejected' || !q.id) ? `
                <button class="btn" style="background:#f59e0b;color:#fff;border-color:#d97706;" onclick="App.saveAndSubmitForApproval()">
                  📤 Lưu & Gửi Duyệt
                </button>
              ` : ''}
            ` : ''}
            <button class="btn btn-navy" onclick="App.showTab('print')">
              🖨️ Chuyển Sang Bản In / Xuất PDF Chuẩn Mẫu KKVN →
            </button>
          </div>
        </div>
      </div>
    `;
  }


  function updateQField(field, value) {
    if (!state.activeQuote) return;
    state.activeQuote[field] = value;
    updateActiveQuoteBadge();
  }

  function onSelectApproverUser(val) {
    const q = state.activeQuote;
    if (!q) return;

    const customInput = document.getElementById('approverNameCustomInput');
    const phoneInput = document.getElementById('approverPhoneInput');

    if (val === '__custom__') {
      q._customApprover = true;
      if (customInput) {
        customInput.style.display = 'block';
        customInput.focus();
      }
      return;
    }

    const user = (state.users || []).find(u => String(u.id) === String(val));
    if (!user) return;

    q._customApprover = false;
    q.approver_name = user.full_name || '';
    q.approver_phone = user.phone || '';

    if (customInput) {
      customInput.value = q.approver_name;
      customInput.style.display = 'none';
    }
    if (phoneInput) {
      phoneInput.value = q.approver_phone;
    }
    toast(`Đã chọn Người duyệt: ${q.approver_name}${q.approver_phone ? ` (SĐT: ${q.approver_phone})` : ''}`);
  }

  function updateTermField(field, value) {
    if (!state.activeQuote) return;
    state.activeQuote.terms = state.activeQuote.terms || {};
    state.activeQuote.terms[field] = value;
  }

  function updatePaymentLines(text) {
    if (!state.activeQuote) return;
    state.activeQuote.terms = state.activeQuote.terms || {};
    state.activeQuote.terms.payment_lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  }

  function updateBankCombined(val) {
    if (!state.activeQuote) return;
    const parts = val.split('-');
    state.activeQuote.terms.bank_account_no = (parts[0] || '').trim();
    state.activeQuote.terms.bank_name_vi = parts.slice(1).join('-').trim();
  }

  function applyTermsPreset(preset) {
    if (!state.activeQuote) return;
    const t = state.activeQuote.terms || {};
    if (preset === 'taikisha') {
      Object.assign(t, {
        validity_days: 30,
        delivery_place_vi: 'Tại chân công trình',
        delivery_place_jp: '工事現場で引き渡し',
        delivery_days: 180,
        warranty_months: 12,
        note_5_vi: 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.\nBG trên chưa bao gồm phí nâng hạ tại công trình và cẩu đưa vào vị trí lắp đặt.',
        note_5_highlight: false,
        payment_lines: [
          '- Thanh toán lần 1 1回目 : Cọc 30% 契約時に30％前金',
          '- Thanh toán lần 2 2回目 : 60% sau khi giao hàng 納品後に60％',
          '- Thanh toán lần 3 3回目 : 10% sau khi lắp đặt 設置後に残り10％'
        ],
        total_label_before_tax: 'Total (A) + (B) - Before TAX'
      });
      state.activeQuote.vat_percent = 8;
    } else if (preset === 'smc') {
      Object.assign(t, {
        validity_days: 30,
        delivery_place_vi: 'Tại công trình',
        delivery_place_jp: '工事現場で引き渡し',
        delivery_days: 180,
        warranty_months: 12,
        note_5_vi: 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.',
        note_5_highlight: false,
        payment_lines: [
          'Phương pháp thanh toán: Theo thỏa thuận',
          '支払方法：打ち合わせによる'
        ],
        total_label_before_tax: 'TOTAL'
      });
      state.activeQuote.vat_percent = 0;
    } else if (preset === 'mektec') {
      Object.assign(t, {
        validity_days: 30,
        delivery_place_vi: 'KCN Thăng Long II, Hưng Yên, Hà Nội',
        delivery_place_jp: 'KCN Thăng Long II, Hưng Yên, Hà Nội',
        delivery_days: 120,
        warranty_months: 6,
        note_5_vi: 'Báo giá trên chỉ áp dụng khi lấy toàn bộ sản phẩm. TH lấy lẻ báo giá sẽ thay đổi.',
        note_5_highlight: true,
        payment_lines: [
          '支払方法：打ち合わせによる',
          'Phương pháp thanh toán: Theo thỏa thuận'
        ],
        total_label_before_tax: 'TOTAL before TAX'
      });
      state.activeQuote.vat_percent = 0;
    }
    renderFlow2();
    toast('Đã áp dụng mẫu điều kiện thương mại!');
  }

  function applyMgmtFeePercentToQuote(pct, inputEl = null, showToastMsg = false) {
    const q = state.activeQuote;
    if (!q) return;

    const cleanPct = Math.min(100, Math.max(0, Number(pct || 0)));
    q.mgmt_fee_percent = cleanPct;
    q.terms = q.terms || {};
    q.terms.mgmt_fee_percent = cleanPct;

    const mgmtInfo = computeMgmtFeeAmounts(q, cleanPct);
    let foundAny = false;

    (q.sections || []).forEach(sec => {
      (sec.items || []).forEach(it => {
        if (isMgmtFeeItem(it)) {
          foundAny = true;
          it.item_type = 'service_mgmt';
          it.cost_price = mgmtInfo.cost;
          it.base_price = mgmtInfo.base;
          it._keepExactUnitPrice = false;
          it.unit_price = Math.max(0, Math.round(mgmtInfo.base * Number(it.adjustment ?? 1)));
          it.total_price = Math.round(it.unit_price * Math.max(1, Number(it.quantity || 1)));
          if (it.specs_text && /Khoản\s+[\d.]+\s*%/i.test(it.specs_text)) {
            it.specs_text = it.specs_text.replace(/Khoản\s+[\d.]+\s*%/i, `Khoản ${cleanPct}%`);
          }
          if (it.name_vi && /\([\d.]+\s*%\)/.test(it.name_vi)) {
            it.name_vi = it.name_vi.replace(/\([\d.]+\s*%\)/, `(${cleanPct}%)`);
          }
        }
      });
    });

    if (!foundAny && showToastMsg && cleanPct > 0 && (q.sections || []).length > 0) {
      const targetSec = q.mgmt_fee_mode === 'included_in_a'
        ? q.sections[0]
        : (q.sections.length > 1 ? q.sections[q.sections.length - 1] : q.sections[0]);
      targetSec.items = targetSec.items || [];
      targetSec.items.unshift({
        id: 'mgmt-' + Date.now(),
        stt: '1',
        item_type: 'service_mgmt',
        name_jp: '現場管理・設計・試運転費',
        name_vi: 'Thiết kế, quản lí, vận hành',
        specs_text: `Khoản ${cleanPct}% chi phí quản lý, thiết kế`,
        unit: 'Lot/Lần',
        quantity: 1,
        cost_price: mgmtInfo.cost,
        base_price: mgmtInfo.base,
        adjustment: 1,
        unit_price: mgmtInfo.base,
        total_price: mgmtInfo.base,
        remark: ''
      });
      targetSec.items.forEach((it, idx) => { it.stt = String(idx + 1); });
      renderFlow2();
      toast(`Đã thêm và áp dụng Chi phí quản lý, thiết kế (${cleanPct}% = ${fmtVnd(mgmtInfo.base)} đ)!`);
      return;
    }

    const titleEl = document.getElementById('mgmtFeePctTitle');
    if (titleEl) titleEl.textContent = cleanPct;
    const hintEl = document.getElementById('mgmtFeeCalcHint');
    if (hintEl) hintEl.textContent = `= ${fmtVnd(mgmtInfo.base)} đ`;
    [0, 3, 5, 8, 10].forEach(p => {
      const btn = document.getElementById(`mgmtPctBtn-${p}`);
      if (btn) btn.classList.toggle('btn-navy', Number(cleanPct) === p);
    });

    refreshFlow2PriceDom(inputEl);
    if (showToastMsg) {
      toast(`Đã cập nhật tỷ lệ Chi phí quản lý, thiết kế: ${cleanPct}% (${fmtVnd(mgmtInfo.base)} đ)!`);
    }
  }

  function onMgmtFeePercentInput(rawVal, inputEl = null) {
    const q = state.activeQuote;
    if (!q) return;
    const strVal = String(rawVal ?? '').trim();
    if (strVal.includes('-') || Number(strVal) < 0) {
      toast('⚠️ Tỷ lệ phần trăm không được để giá trị âm (-)!');
      if (inputEl) inputEl.value = 0;
      applyMgmtFeePercentToQuote(0, inputEl, false);
      return;
    }
    if (strVal === '') return;
    const numVal = Math.min(100, Math.max(0, Number(strVal)));
    if (Number.isNaN(numVal)) return;
    applyMgmtFeePercentToQuote(numVal, inputEl, false);
  }

  function onMgmtFeePercentBlur(inputEl) {
    if (!inputEl || !state.activeQuote) return;
    const strVal = String(inputEl.value ?? '').trim();
    if (strVal === '' || Number(strVal) < 0 || Number.isNaN(Number(strVal))) {
      const fallback = state.activeQuote.mgmt_fee_percent ?? state.activeQuote.terms?.mgmt_fee_percent ?? 5;
      inputEl.value = fallback;
      applyMgmtFeePercentToQuote(fallback, inputEl, false);
    }
  }

  function setQuickMgmtFeePercent(pct) {
    const cleanPct = Math.min(100, Math.max(0, Number(pct ?? 5)));
    const inp = document.getElementById('mgmtFeePercentInput');
    if (inp) inp.value = cleanPct;
    applyMgmtFeePercentToQuote(cleanPct, inp, true);
  }

  function handleMgmtFeeModeChange(mode) {
    const q = state.activeQuote;
    if (!q) return;
    q.mgmt_fee_mode = mode;

    const mgmtInfo = computeMgmtFeeAmounts(q);
    const defaultMgmtCost = mgmtInfo.cost;
    const defaultMgmtBase = mgmtInfo.base;
    const mgmtPct = mgmtInfo.pct;

    if (mode === 'separate_to_b') {
      if (q.sections && q.sections.length > 1 && q.sections[0]) {
        q.sections[0].items = (q.sections[0].items || []).filter(it => !isMgmtFeeItem(it));
      }
      let secB = (q.sections || []).find((s, idx) => idx > 0 || (s.code || '').startsWith('B'));
      if (!secB && q.sections) {
        secB = {
          id: 'sec-b',
          code: 'B./他Khác',
          title: 'B./他Khác',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (B)',
          items: []
        };
        q.sections.push(secB);
      }
      if (secB) {
        const hasInB = (secB.items || []).some(it => isMgmtFeeItem(it));
        if (!hasInB) {
          secB.items = secB.items || [];
          secB.items.unshift({
            id: 'mgmt-' + Date.now(),
            stt: '1',
            item_type: 'service_mgmt',
            name_jp: '現場管理・設計・試運転費',
            name_vi: 'Thiết kế, quản lí, vận hành',
            specs_text: ``,
            unit: 'Lot/Lần',
            quantity: 1,
            cost_price: defaultMgmtCost,
            base_price: defaultMgmtBase,
            adjustment: 1,
            unit_price: defaultMgmtBase,
            total_price: defaultMgmtBase,
            remark: ''
          });
          secB.items.forEach((it, idx) => { it.stt = String(idx + 1); });
        }
      }
      toast(`Chế độ: Tách khoản Quản lý & Thiết kế (${mgmtPct}%) xuống mục B. Khác (Không cộng trùng ở mục A).`);
    } else if (mode === 'included_in_a') {
      q.sections.forEach((sec, idx) => {
        if (idx > 0 || (sec.code || '').startsWith('B')) {
          sec.items = (sec.items || []).filter(it => !isMgmtFeeItem(it));
        }
      });
      if (q.sections[0]) {
        const hasInA = q.sections[0].items.some(it => isMgmtFeeItem(it));
        if (!hasInA) {
          q.sections[0].items.push({
            id: 'mgmt-' + Date.now(),
            stt: String(q.sections[0].items.length + 1),
            item_type: 'service_mgmt',
            name_jp: '現場管理・設計・試運転費',
            name_vi: `Chi phí quản lý, thiết kế (${mgmtPct}%)`,
            specs_text: '',
            unit: 'Lot/Lần',
            quantity: 1,
            cost_price: defaultMgmtCost,
            base_price: defaultMgmtBase,
            adjustment: 1,
            unit_price: defaultMgmtBase,
            total_price: defaultMgmtBase,
            remark: ''
          });
        }
      }
      toast(`Đã gộp khoản Quản lý & Thiết kế (${mgmtPct}%) vào mục A và bỏ khỏi mục B!`);
    } else if (mode === 'additional') {
      toast(`Chế độ: Cộng bổ sung thêm khoản Quản lý / Thiết kế (${mgmtPct}%) riêng ngoài giá cơ bản.`);
    }
    renderFlow2();
  }

  function quickAddEquipment(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel || !state.activeQuote) return;
    const eqId = Number(sel.value);
    const eq = state.equipment.find(e => e.id === eqId);
    if (!eq) return;

    const q = state.activeQuote;
    if (!q.sections || q.sections.length === 0) {
      q.sections = [{ id: 'sec-1', code: '', title: '', showSubtotal: false, items: [] }];
    }

    let targetSecIdx = 0;
    if (eq.category === 'service' && q.sections.length > 1) {
      targetSecIdx = q.sections.length - 1;
    }
    const sec = q.sections[targetSecIdx];

    if (eq.is_default_included) {
      toast(`Lưu ý: "${eq.name_vi}" đã bao gồm mặc định (${eq.default_qty} cái) trong Hệ tháp. Hệ thống thêm với đơn giá chỉ tính cho phần mua thêm vượt định mức!`);
    }

    const nextStt = String((sec.items?.length || 0) + 1);
    sec.items.push({
      id: 'item-' + Date.now(),
      stt: nextStt,
      item_type: eq.category,
      name_jp: eq.name_jp || '',
      name_vi: eq.name_vi + (eq.is_default_included ? ' (Mua thêm ngoài gói mặc định)' : ''),
      specs_text: eq.specs || '',
      unit: eq.unit || 'Pc/Cái',
      quantity: 1,
      cost_price: eq.cost_price || 0,
      base_price: eq.base_price || 0,
      adjustment: 1,
      unit_price: eq.base_price || 0,
      total_price: eq.base_price || 0,
      remark: eq.origin_note || '',
      sub_lines: []
    });

    renderFlow2();
    toast(`Đã thêm "${eq.name_vi}" vào báo giá!`);
  }

  function updateSectionField(sIdx, field, val) {
    const sec = state.activeQuote?.sections?.[sIdx];
    if (!sec) return;
    sec[field] = val;
    if (field === 'title') sec.code = val;
    if (field === 'showSubtotal') renderFlow2();
  }

  function addSection() {
    if (!state.activeQuote) return;
    state.activeQuote.sections = state.activeQuote.sections || [];
    const idx = state.activeQuote.sections.length + 1;
    state.activeQuote.sections.push({
      id: 'sec-' + Date.now(),
      code: `Nhóm ${idx}`,
      title: `Nhóm hạng mục ${idx}`,
      showSubtotal: true,
      subtotalLabel: `TOTAL (${idx})`,
      items: []
    });
    renderFlow2();
  }

  function removeSection(sIdx) {
    if (!state.activeQuote) return;
    const sec = state.activeQuote.sections?.[sIdx];
    if (!sec) return;

    if ((state.activeQuote.sections || []).length <= 1) {
      toast('Báo giá phải có ít nhất 1 nhóm hạng mục, không thể xóa nhóm cuối cùng!');
      return;
    }

    const secTitle = (sec.title || sec.code || `Nhóm #${sIdx + 1}`).trim();
    const itemCount = (sec.items || []).length;

    openConfirmModal({
      title: '⚠️ Xác Nhận Xóa Nhóm Hạng Mục',
      okText: '🗑 Xác nhận Xóa Nhóm',
      isDanger: true,
      messageHtml: `
        Bạn có chắc chắn muốn xóa nhóm <strong>${esc(secTitle)}</strong> không?
        ${itemCount > 0 ? `
          <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px;color:#991b1b;">
            ⚠️ Nhóm này hiện đang có <strong>${itemCount}</strong> hạng mục. Tất cả hạng mục bên trong nhóm này sẽ bị xóa!
          </div>
        ` : ''}
      `,
      onConfirm: () => {
        state.activeQuote.sections.splice(sIdx, 1);
        renderFlow2();
        toast(`Đã xóa nhóm "${secTitle}".`);
      }
    });
  }

  function addBlankItem(sIdx) {
    const sec = state.activeQuote?.sections?.[sIdx];
    if (!sec) return;
    sec.items = sec.items || [];
    sec.items.push({
      id: 'item-' + Date.now(),
      stt: String(sec.items.length + 1),
      item_type: 'custom',
      name_jp: '',
      name_vi: 'Hạng mục mới',
      specs_text: '',
      unit: 'Pc/Cái',
      quantity: 1,
      cost_price: 0,
      base_price: 0,
      adjustment: 1,
      unit_price: 0,
      total_price: 0,
      remark: '',
      sub_lines: []
    });
    renderFlow2();
  }

  function removeItem(sIdx, iIdx) {
    const sec = state.activeQuote?.sections?.[sIdx];
    if (!sec) return;
    const it = sec.items?.[iIdx];
    if (!it) return;

    const itemName = (it.name_vi || it.name_jp || `Hạng mục #${iIdx + 1}`).trim();
    const itemStt = it.stt ? `STT ${it.stt} - ` : '';

    openConfirmModal({
      title: '⚠️ Xác Nhận Xóa Hạng Mục',
      okText: '🗑 Xác nhận Xóa Hạng Mục',
      isDanger: true,
      messageHtml: `
        Bạn có chắc chắn muốn xóa hạng mục <strong>${esc(itemStt)}${esc(itemName)}</strong> khỏi bảng báo giá không?
      `,
      onConfirm: () => {
        sec.items.splice(iIdx, 1);
        renderFlow2();
        toast(`Đã xóa hạng mục "${itemName}".`);
      }
    });
  }

  function updateItemField(sIdx, iIdx, field, val) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it) return;
    it[field] = val;
  }

  function refreshFlow2PriceDom(excludeInputEl = null) {
    const q = state.activeQuote;
    if (!q) return;
    recalcActiveQuoteTotals();
    const showCost = state.permissions.canViewCost;

    (q.sections || []).forEach((sec, sIdx) => {
      (sec.items || []).forEach((it, iIdx) => {
        const adjEl = document.getElementById(`input-adj-${sIdx}-${iIdx}`);
        if (adjEl && adjEl !== excludeInputEl) {
          adjEl.value = it.adjustment ?? 1;
        }
        if (adjEl) {
          const f = Number(it.adjustment ?? 1);
          adjEl.style.color = f < 1 ? 'var(--red)' : f > 1 ? 'var(--green)' : 'inherit';
        }

        const unitEl = document.getElementById(`input-unit-${sIdx}-${iIdx}`);
        if (unitEl && unitEl !== excludeInputEl) {
          unitEl.value = it.unit_price || 0;
        }

        const baseEl = document.getElementById(`input-base-${sIdx}-${iIdx}`);
        if (baseEl && baseEl !== excludeInputEl) {
          baseEl.value = it.base_price || 0;
        }

        const costEl = document.getElementById(`input-cost-${sIdx}-${iIdx}`);
        if (costEl && costEl !== excludeInputEl) {
          costEl.value = it.cost_price || 0;
        }

        const diffHint = document.getElementById(`adj-diff-hint-${sIdx}-${iIdx}`);
        if (diffHint) {
          const diffAmt = (it.unit_price || 0) - (it.base_price || 0);
          diffHint.style.color = diffAmt < 0 ? 'var(--red)' : diffAmt > 0 ? 'var(--green)' : 'var(--muted)';
          diffHint.textContent = diffAmt === 0 ? 'Giá gốc (×1)' : `${diffAmt > 0 ? '+' : ''}${fmtVnd(diffAmt)} đ`;
        }

        const belowCostEl = document.getElementById(`below-cost-${sIdx}-${iIdx}`);
        if (belowCostEl) {
          const isBelow = showCost && it.cost_price && it.unit_price < it.cost_price;
          belowCostEl.style.display = isBelow ? 'block' : 'none';
        }

        const cellTotal = document.getElementById(`cell-total-${sIdx}-${iIdx}`);
        if (cellTotal) cellTotal.textContent = fmtVnd(it.total_price);
      });

      const secSub = document.getElementById(`sec-subtotal-${sIdx}`);
      if (secSub) secSub.textContent = fmtVnd(sec.subtotal);
    });

    const allItems = (q.sections || []).flatMap(s => s.items || []);
    const firstFactor = allItems.length > 0 ? Number(allItems[0].adjustment ?? 1) : 1;
    const isUniform = allItems.length > 0 && allItems.every(it => Math.abs(Number(it.adjustment ?? 1) - firstFactor) < 0.0001);

    const badgeEl = document.getElementById('bulkFactorStatusBadge');
    if (badgeEl) {
      badgeEl.className = `status-pill ${isUniform ? 'status-approved' : 'status-pending_approval'}`;
      badgeEl.textContent = isUniform ? `Đang đồng bộ tất cả: ×${firstFactor}` : 'Đang tùy chỉnh riêng từng hạng mục';
    }
    const bulkInput = document.getElementById('bulkFactorInput');
    if (bulkInput && bulkInput !== excludeInputEl && isUniform) {
      bulkInput.value = firstFactor;
    }

    const sumCost = document.getElementById('sumCostVal');
    if (sumCost) sumCost.innerHTML = `<strong>${fmtVnd(q.subtotal_cost)} VND</strong>`;
    const sumBase = document.getElementById('sumBaseVal');
    if (sumBase) sumBase.textContent = `${fmtVnd(q.subtotal_base)} VND`;
    const sumDiff = document.getElementById('sumDiffVal');
    if (sumDiff) {
      const diff = q.subtotal_before_tax - q.subtotal_base;
      sumDiff.style.color = diff < 0 ? 'var(--red)' : 'var(--green)';
      sumDiff.textContent = `${diff >= 0 ? '+' : ''}${fmtVnd(diff)} VND`;
    }
    const sumPre = document.getElementById('sumPreTaxVal');
    if (sumPre) sumPre.textContent = `${fmtVnd(q.subtotal_before_tax)} VND`;
    const sumVatLabel = document.getElementById('sumVatLabel');
    if (sumVatLabel) sumVatLabel.textContent = `Thuế GTGT (TAX VAT ${q.vat_percent}%)`;
    const sumVat = document.getElementById('sumVatVal');
    if (sumVat) sumVat.textContent = `${fmtVnd(q.vat_amount)} VND`;
    const sumPost = document.getElementById('sumPostTaxVal');
    if (sumPost) sumPost.textContent = `${fmtVnd(q.total_after_tax)} VND`;
    [0, 5, 8, 10].forEach(pct => {
      const btn = document.getElementById(`vatPresetBtn-${pct}`);
      if (btn) btn.classList.toggle('btn-navy', Number(q.vat_percent) === pct);
    });
    const sumMargin = document.getElementById('sumMarginVal');
    if (sumMargin) {
      const margin = q.subtotal_before_tax - q.subtotal_cost;
      const pct = q.subtotal_before_tax > 0 ? Math.round((margin / q.subtotal_before_tax) * 100) : 0;
      sumMargin.innerHTML = `<strong>${margin >= 0 ? '+' : ''}${fmtVnd(margin)} VND</strong> (${pct}%)`;
    }
    const mgmtHint = document.getElementById('mgmtFeeCalcHint');
    if (mgmtHint) {
      const mgmtInfo = computeMgmtFeeAmounts(q);
      mgmtHint.textContent = `= ${fmtVnd(mgmtInfo.base)} đ`;
    }
  }

  function updateItemPriceCalc(sIdx, iIdx, field, rawVal, inputEl = null) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it) return;

    const strVal = String(rawVal ?? '').trim();
    if (strVal.includes('-') || Number(strVal) < 0) {
      toast('⚠️ Giá và hệ số điều chỉnh không được để giá trị âm (-)!');
      const fallback = field === 'quantity' ? 1 : (field === 'adjustment' ? 1 : 0);
      if (inputEl) inputEl.value = fallback;
      rawVal = String(fallback);
    } else if (strVal === '') {
      return;
    }

    const numVal = Math.max(0, Number(rawVal || 0));

    if (field === 'quantity') {
      it.quantity = Math.max(1, Math.round(numVal));
    } else if (field === 'cost_price') {
      it.cost_price = Math.max(0, Math.round(numVal));
    } else if (field === 'base_price') {
      it.base_price = Math.max(0, Math.round(numVal));
      it._keepExactUnitPrice = false;
      it.unit_price = Math.max(0, Math.round(it.base_price * Number(it.adjustment ?? 1)));
    } else if (field === 'adjustment') {
      it.adjustment = Math.max(0, numVal);
      it._keepExactUnitPrice = false;
      it.unit_price = Math.max(0, Math.round(Number(it.base_price || 0) * it.adjustment));
    } else if (field === 'unit_price') {
      it.unit_price = Math.max(0, Math.round(numVal));
      it._keepExactUnitPrice = true;
      const base = Number(it.base_price || 0);
      it.adjustment = base > 0 ? Number((it.unit_price / base).toFixed(4)) : 1;
    }

    refreshFlow2PriceDom(inputEl);
  }

  function handleItemPriceBlur(sIdx, iIdx, field, inputEl) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it || !inputEl) return;
    const strVal = String(inputEl.value ?? '').trim();
    if (strVal === '' || Number(strVal) < 0 || Number.isNaN(Number(strVal))) {
      const fallback = field === 'quantity' ? (it.quantity || 1) : (field === 'adjustment' ? (it.adjustment ?? 1) : (it[field] || 0));
      inputEl.value = Math.max(0, fallback);
      updateItemPriceCalc(sIdx, iIdx, field, inputEl.value, inputEl);
    }
  }

  function applyBulkFactorToAll(rawVal, inputEl = null, showToastMsg = false) {
    const q = state.activeQuote;
    if (!q) return;

    const strVal = String(rawVal ?? '').trim();
    if (strVal.includes('-') || Number(strVal) < 0) {
      toast('⚠️ Hệ số chênh lệch không được để giá trị âm (-)!');
      if (inputEl) inputEl.value = 1;
      rawVal = '1';
    } else if (strVal === '') {
      return;
    }

    const factor = Math.max(0, Number(rawVal));
    if (Number.isNaN(factor)) return;

    q.bulk_factor = factor;
    (q.sections || []).forEach(sec => {
      (sec.items || []).forEach(it => {
        it.adjustment = factor;
        it._keepExactUnitPrice = false;
        it.unit_price = Math.max(0, Math.round(Number(it.base_price || 0) * factor));
      });
    });

    refreshFlow2PriceDom(inputEl);
    if (showToastMsg) {
      toast(`Đã áp dụng hệ số chênh lệch ×${factor} cho tất cả hạng mục!`);
    }
  }

  function handleBulkFactorBlur(inputEl) {
    if (!inputEl || !state.activeQuote) return;
    const strVal = String(inputEl.value ?? '').trim();
    if (strVal === '' || Number(strVal) < 0 || Number.isNaN(Number(strVal))) {
      inputEl.value = state.activeQuote.bulk_factor ?? 1;
    }
  }

  function setQuickBulkFactor(factor) {
    const safeFactor = Math.max(0, Number(factor || 1));
    const bulkInput = document.getElementById('bulkFactorInput');
    if (bulkInput) bulkInput.value = safeFactor;
    applyBulkFactorToAll(safeFactor, bulkInput, true);
  }

  function onVatPercentInput(rawVal, inputEl = null) {
    const q = state.activeQuote;
    if (!q) return;
    const strVal = String(rawVal ?? '').trim();
    if (strVal.includes('-') || Number(strVal) < 0) {
      if (inputEl) inputEl.value = 0;
      q.vat_percent = 0;
    } else if (strVal === '') {
      q.vat_percent = 0;
    } else {
      q.vat_percent = Math.min(100, Math.max(0, Number(strVal)));
    }
    refreshFlow2PriceDom(inputEl);
  }

  function setQuickVatPercent(pct) {
    const q = state.activeQuote;
    if (!q) return;
    q.vat_percent = Math.max(0, Number(pct || 0));
    const inp = document.getElementById('vatPercentInput');
    if (inp) inp.value = q.vat_percent;
    refreshFlow2PriceDom(inp);
  }

  function addSubLine(sIdx, iIdx) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it) return;
    it.sub_lines = it.sub_lines || [];
    it.sub_lines.push({ text: '   + Hạng mục / thông số đi kèm', right_text: '', remark: '' });
    renderFlow2();
  }

  function updateSubLine(sIdx, iIdx, slIdx, field, val) {
    const sl = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx]?.sub_lines?.[slIdx];
    if (!sl) return;
    sl[field] = val;
  }

  function removeSubLine(sIdx, iIdx, slIdx) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it || !it.sub_lines) return;
    it.sub_lines.splice(slIdx, 1);
    renderFlow2();
  }

  function createBlankQuoteTemplate(templateType) {
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const seq = String(state.quotations.length + 30).padStart(3, '0');
    const baseCode = `2601-${seq}`;
    const quoteNumber = `${baseCode}-01`;

    if (templateType === 'standalone') {
      state.activeQuote = {
        id: null,
        quote_number: quoteNumber,
        base_code: baseCode,
        revision: 1,
        quote_date: today,
        doc_title: '御見積 BÁO GIÁ',
        flow_type: 'detailed',
        layout_template: 'standalone',
        mgmt_fee_mode: 'included_in_a',
        status: 'draft',
        customer_name: 'CÔNG TY KHÁCH HÀNG',
        customer_address: '',
        customer_phone: '',
        customer_contact: 'Mr. / Mrs.',
        project_name: '',
        install_location: '',
        lead_time_days: 180,
        lead_time_note: 'Ngày (Kể từ ngày nhận cọc)',
        kkvn_address: 'KCN Hòa Bình, Huyện Thủ Thừa. Tỉnh Long An',
        stamp_type: 'longan',
        approver_name: 'Mr Yamanaka Masayuki',
        approver_phone: '0908-687-147',
        pic_name: state.currentUser?.full_name || 'Mr Bảo Trường',
        pic_phone: state.currentUser?.phone || '0898-687-331',
        signer_name: 'NGUYỄN BẢO TRƯỜNG',
        vat_percent: 0,
        sections: [
          {
            id: 'sec-main',
            code: '',
            title: '',
            showSubtotal: false,
            subtotalLabel: '',
            items: [
              {
                id: 'item-1', stt: '1', item_type: 'fan',
                name_jp: '排気ファン', name_vi: 'Quạt hút   #7 RFT-RB          (FRP)',
                specs_text: '850 CMM   1500 Pa   45 Kw, 3phase ,380V,50Hz, 4P,IE3',
                unit: 'Pc/Cái', quantity: 1, cost_price: 389100000, base_price: 778200000,
                adjustment: 1, unit_price: 778200000, total_price: 778200000, remark: 'KYOWA JP', sub_lines: []
              }
            ]
          }
        ],
        terms: {
          validity_days: 30,
          delivery_place_vi: 'Tại công trình',
          delivery_place_jp: '工事現場で引き渡し',
          delivery_days: 180,
          warranty_months: 12,
          note_5_vi: 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.',
          payment_lines: ['Phương pháp thanh toán: Theo thỏa thuận', '支払方法：打ち合わせによる'],
          bank_account_name_vi: 'Công ty TNHH Kyowa Kako Việt nam / KYOWA KAKO VIETNAM CO.,LTD',
          bank_account_no: '3680022466',
          bank_name_vi: 'BIDV - Chi nhánh Tân Bình, Tp.HCM',
          total_label_before_tax: 'TOTAL'
        }
      };
    } else {
      state.activeQuote = {
        id: null,
        quote_number: quoteNumber,
        base_code: baseCode,
        revision: 1,
        quote_date: today,
        doc_title: '御見積 BÁO GIÁ BƠM KYOWA',
        flow_type: 'detailed',
        layout_template: 'grouped_areas',
        mgmt_fee_mode: 'included_in_a',
        status: 'draft',
        customer_name: 'CÔNG TY KHÁCH HÀNG',
        customer_address: '',
        customer_phone: '',
        customer_contact: 'Mr. / Mrs.',
        project_name: 'Thay thế thiết bị theo khu vực',
        install_location: '',
        lead_time_days: 120,
        lead_time_note: 'ngày (kể từ ngày nhận cọc)',
        kkvn_address: 'KCN Hòa Bình, Xã Thủ Thừa. Tỉnh Tây Ninh',
        stamp_type: 'tayninh',
        approver_name: 'Mr Bảo Trường',
        approver_phone: '0898-687-331',
        pic_name: state.currentUser?.full_name || 'Mrs Cẩm Tú',
        pic_phone: state.currentUser?.phone || '0908-470-417',
        signer_name: 'NGUYỄN BẢO TRƯỜNG',
        vat_percent: 0,
        sections: [
          {
            id: 'sec-1',
            code: 'I. Khu vực 1 - Tháp xử lý 1',
            title: 'I. Khu vực 1 - Tháp xử lý 1',
            showSubtotal: false,
            items: [
              {
                id: 'item-1', stt: '1', item_type: 'pump',
                name_jp: '循環ポンプ', name_vi: 'Bơm tuần hoàn   65 VO              (PVC)',
                specs_text: '385 L/min x 10 m x 2.2 kW',
                unit: 'Pc/Cái', quantity: 1, cost_price: 68000000, base_price: 97180000,
                adjustment: 1, unit_price: 97180000, total_price: 97180000, remark: '', sub_lines: []
              }
            ]
          },
          {
            id: 'sec-2',
            code: 'II. Dịch vụ',
            title: 'II. Dịch vụ',
            showSubtotal: false,
            items: [
              {
                id: 'item-2', stt: '1', item_type: 'service',
                name_jp: '', name_vi: 'Phí vận chuyển trong nước',
                specs_text: '', unit: 'Lot/Lần', quantity: 1, cost_price: 6000000, base_price: 8250000,
                adjustment: 1, unit_price: 8250000, total_price: 8250000, remark: '', sub_lines: []
              }
            ]
          }
        ],
        terms: {
          validity_days: 30,
          delivery_place_vi: 'Tại nhà máy khách hàng',
          delivery_place_jp: '工場渡し',
          delivery_days: 120,
          warranty_months: 6,
          note_5_vi: 'Báo giá trên chỉ áp dụng khi lấy toàn bộ sản phẩm. TH lấy lẻ báo giá sẽ thay đổi.',
          note_5_highlight: true,
          payment_lines: ['支払方法：打ち合わせによる', 'Phương pháp thanh toán: Theo thỏa thuận'],
          bank_account_name_vi: 'Công ty TNHH Kyowa Kako Việt nam',
          bank_account_no: '3680022466',
          bank_name_vi: 'BIDV - Chi nhánh Tân Bình, Tp.HCM',
          total_label_before_tax: 'TOTAL before TAX'
        }
      };
    }

    recalcActiveQuoteTotals();
    updateActiveQuoteBadge();
    renderFlow2();
    toast('Đã khởi tạo mẫu báo giá mới!');
  }

  let pendingConfirmAction = null;

  function canUserEditQuote(q) {
    if (!q || !q.id) return true; // New unsaved quotation can be created by anyone
    if (q.status === 'approved' || q.status === 'sent') return false; // Approved or Sent quotations are locked
    if (!state.currentUser) return false;
    return state.currentUser.role === 'admin' || q.created_by === state.currentUser.username;
  }

  function canUserMarkSent(q) {
    if (!q || !q.id || q.status !== 'approved') return false;
    if (!state.currentUser) return false;
    return state.currentUser.role === 'admin' || state.permissions.canApproveQuote || q.created_by === state.currentUser.username;
  }

  function formatDateTimeVN(dtStr) {
    if (!dtStr) return '—';
    const parts = String(dtStr).trim().split(/[\sT]+/);
    const dPart = formatDateDMY(parts[0] || '');
    const tPart = (parts[1] || '').slice(0, 5);
    return tPart ? `${dPart} ${tPart}` : dPart;
  }

  function openConfirmModal({ title, messageHtml, okText = 'Xác nhận', isDanger = false, onConfirm }) {
    pendingConfirmAction = onConfirm;
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmModalOkBtn');
    if (titleEl) titleEl.textContent = title || '⚠️ Xác Nhận Thao Tác';
    if (msgEl) msgEl.innerHTML = messageHtml || '';
    if (okBtn) {
      okBtn.textContent = okText;
      okBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
      if (isDanger) {
        okBtn.style.background = 'var(--red)';
        okBtn.style.color = '#fff';
        okBtn.style.borderColor = 'var(--red)';
      } else {
        okBtn.style.background = '';
        okBtn.style.color = '';
        okBtn.style.borderColor = '';
      }
    }
    document.getElementById('confirmActionModal')?.classList.remove('hidden');
  }

  function closeConfirmModal() {
    pendingConfirmAction = null;
    document.getElementById('confirmActionModal')?.classList.add('hidden');
  }

  async function executeConfirmedAction() {
    const fn = pendingConfirmAction;
    closeConfirmModal();
    if (typeof fn === 'function') {
      await fn();
    }
  }

  async function saveActiveQuotation() {
    if (!state.activeQuote) return;
    if (!canUserEditQuote(state.activeQuote)) {
      toast(`Chỉ người tạo (@${state.activeQuote.created_by}) hoặc Admin mới có quyền chỉnh sửa báo giá này.`);
      return;
    }
    recalcActiveQuoteTotals();
    const q = state.activeQuote;
    try {
      let saved;
      if (q.id) {
        saved = await api(`/api/quotations/${q.id}`, {
          method: 'PUT',
          body: JSON.stringify(q)
        });
      } else {
        saved = await api('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(q)
        });
      }
      state.activeQuote = saved;
      await loadBootstrap();
      renderFlow2();
      toast(`Đã lưu báo giá ${saved.quote_number} thành công!`);
    } catch (err) {
      toast('Lỗi lưu báo giá: ' + err.message);
    }
  }

  function saveAndSubmitForApproval() {
    if (!state.activeQuote) return;
    if (!canUserEditQuote(state.activeQuote)) {
      toast(`Chỉ người tạo (@${state.activeQuote.created_by}) hoặc Admin mới có quyền gửi duyệt báo giá này.`);
      return;
    }
    recalcActiveQuoteTotals();
    const q = state.activeQuote;
    openConfirmModal({
      title: '📤 Xác Nhận Lưu & Gửi Duyệt Báo Giá',
      okText: '📤 Xác nhận Gửi duyệt',
      isDanger: false,
      messageHtml: `
        Bạn có chắc chắn muốn <strong>Lưu và Gửi duyệt</strong> hồ sơ báo giá này lên Quản lý / Người duyệt không?
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px;">
          <div>• Số báo giá: <strong style="color:var(--navy)">${esc(q.quote_number)}</strong></div>
          <div>• Khách hàng: <strong>${esc(q.customer_name)}</strong></div>
          <div>• Tổng cộng sau thuế: <strong style="color:var(--green)">${fmtVnd(q.total_after_tax)} VND</strong></div>
        </div>
      `,
      onConfirm: async () => {
        try {
          let saved;
          if (q.id) {
            saved = await api(`/api/quotations/${q.id}`, {
              method: 'PUT',
              body: JSON.stringify({ ...q, status: 'pending_approval' })
            });
          } else {
            saved = await api('/api/quotations', {
              method: 'POST',
              body: JSON.stringify({ ...q, status: 'pending_approval' })
            });
          }
          state.activeQuote = saved;
          await loadBootstrap();
          renderAll();
          toast(`Đã lưu và gửi duyệt báo giá ${saved.quote_number} thành công!`);
        } catch (err) {
          toast('Lỗi gửi duyệt: ' + err.message);
        }
      }
    });
  }

  async function loadQuotationById(id) {
    if (!id) return;
    try {
      const data = await api(`/api/quotations/${id}`);
      state.activeQuote = data;
      state.revisionsList = data.revisions || [];
      updateActiveQuoteBadge();
      renderFlow2();
      renderPrintView();
      toast(`Đã mở báo giá ${data.quote_number}`);
    } catch (err) {
      toast('Không thể mở báo giá: ' + err.message);
    }
  }

  async function createNewRevision(id) {
    try {
      const created = await api(`/api/quotations/${id}/revision`, { method: 'POST' });
      state.activeQuote = created;
      await loadBootstrap();
      renderFlow2();
      toast(`Đã tạo phiên bản mới: ${created.quote_number}`);
    } catch (err) {
      toast('Lỗi tạo phiên bản mới: ' + err.message);
    }
  }

  function changeQuoteStatus(id, status) {
    const target = state.quotations.find(q => q.id === id) || state.activeQuote;
    const qNum = target ? target.quote_number : `#${id}`;
    const cName = target ? target.customer_name : '';
    const totalStr = target ? fmtVnd(target.total_after_tax) + ' VND' : '';

    const isApprove = status === 'approved';
    const isSent = status === 'sent';
    const title = isApprove
      ? '✅ Xác Nhận Phê Duyệt Báo Giá'
      : isSent
        ? '📨 Xác Nhận Đã Gửi Báo Giá Cho Khách Hàng'
        : '📤 Xác Nhận Gửi Duyệt Báo Giá';
    const actionLabel = isApprove
      ? 'PHÊ DUYỆT'
      : isSent
        ? 'ĐÁNH DẤU ĐÃ GỬI KHÁCH HÀNG'
        : 'GỬI DUYỆT';
    const okText = isApprove
      ? '✅ Xác nhận Phê duyệt'
      : isSent
        ? '📨 Xác nhận Đã gửi KH'
        : '📤 Xác nhận Gửi duyệt';

    openConfirmModal({
      title,
      okText,
      isDanger: false,
      messageHtml: `
        Bạn có chắc chắn muốn <strong>${actionLabel}</strong> đối với hồ sơ báo giá này không?
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px;">
          <div>• Số báo giá: <strong style="color:var(--navy)">${esc(qNum)}</strong></div>
          <div>• Khách hàng: <strong>${esc(cName)}</strong></div>
          <div>• Tổng cộng sau thuế: <strong style="color:var(--green)">${esc(totalStr)}</strong></div>
        </div>
      `,
      onConfirm: async () => {
        try {
          const updated = await api(`/api/quotations/${id}/status`, {
            method: 'POST',
            body: JSON.stringify({ status })
          });
          state.activeQuote = updated;
          await loadBootstrap();
          renderAll();
          toast(`Đã cập nhật trạng thái báo giá ${updated.quote_number} thành công!`);
        } catch (err) {
          toast('Lỗi: ' + err.message);
        }
      }
    });
  }

  // ===========================================================================
  // TAB 3: XEM TRƯỚC & XUẤT BẢN IN PDF CHUẨN MẪU KYOWA KAKO (A4)
  // ===========================================================================
  function formatDateDMY(isoStr) {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${Number(parts[2])}/${Number(parts[1])}/${parts[0]}`;
    }
    return isoStr;
  }

  function formatQuoteNumberSplit(qNum) {
    if (!qNum) return '';
    const m = qNum.match(/^(\d{4})-(\d{3})-(\d{2})$/);
    if (m) {
      return `<span class="q-red">${m[1]} - &nbsp;</span><span class="q-black">${m[2]}</span><span class="q-red">&nbsp; - ${m[3].split('').join(' ')}</span>`;
    }
    return `<span class="q-red">${esc(qNum)}</span>`;
  }

  function renderPrintView() {
    const container = document.getElementById('view-print');
    if (!container) return;
    if (!state.activeQuote) {
      container.innerHTML = `<div class="card"><p>Chưa có báo giá nào được chọn.</p></div>`;
      return;
    }

    recalcActiveQuoteTotals();
    const q = state.activeQuote;
    const t = q.terms || {};

    let tableRowsHtml = '';
    (q.sections || []).forEach(sec => {
      if (sec.title && sec.title.trim()) {
        tableRowsHtml += `
          <tr class="sec-header-row">
            <td colspan="7">${esc(sec.title)}</td>
          </tr>
        `;
      }
      (sec.items || []).forEach(it => {
        tableRowsHtml += `
          <tr>
            <td style="text-align:center;font-weight:600;">${esc(it.stt)}</td>
            <td><strong>${esc(it.name_jp ? it.name_jp + ' ' : '')}${esc(it.name_vi)}</strong></td>
            <td style="text-align:center;">${esc(it.unit)}</td>
            <td style="text-align:center;">${esc(it.quantity)}</td>
            <td style="text-align:right;">${fmtPdfNum(it.unit_price)}</td>
            <td style="text-align:right;font-weight:600;">${fmtPdfNum(it.total_price)}</td>
            <td style="text-align:center;font-weight:700;">${esc(it.remark || '')}</td>
          </tr>
        `;

        if (it.specs_text && it.specs_text.trim()) {
          tableRowsHtml += `
            <tr>
              <td></td>
              <td style="padding-left:18px;">${esc(it.specs_text)}</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
            <tr>
              <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          `;
        }

        if (it.sub_lines && it.sub_lines.length > 0) {
          it.sub_lines.forEach(sl => {
            tableRowsHtml += `
              <tr>
                <td></td>
                <td style="padding-left:${sl.text.startsWith('   +') ? '26px' : '8px'};">
                  <div style="display:flex;justify-content:space-between;">
                    <span>${esc(sl.text.trim())}</span>
                    ${sl.right_text ? `<span>${esc(sl.right_text)}</span>` : ''}
                  </div>
                </td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td style="text-align:center;font-weight:700;">${esc(sl.remark || '')}</td>
              </tr>
            `;
          });
        }
      });

      if (sec.showSubtotal) {
        tableRowsHtml += `
          <tr class="subtotal-row">
            <td colspan="5">${esc(sec.subtotalLabel || 'TOTAL')}</td>
            <td style="text-align:right;">${fmtPdfNum(sec.subtotal)}</td>
            <td></td>
          </tr>
        `;
      }
    });

    const anySecSubtotal = (q.sections || []).some(s => s.showSubtotal);
    if (!anySecSubtotal) {
      tableRowsHtml += `
        <tr class="subtotal-row">
          <td colspan="5">${esc(t.total_label_before_tax || 'TOTAL')}</td>
          <td style="text-align:right;">${fmtPdfNum(q.subtotal_before_tax)}</td>
          <td></td>
        </tr>
      `;
    }

    const stampImgSrc = q.stamp_type === 'tayninh'
      ? '/assets/stamp_tayninh.png'
      : q.stamp_type === 'longan'
        ? '/assets/stamp_longan.png'
        : null;

    const isMobileViewport = window.innerWidth <= 840;
    const fitMobile = state.fitMobileA4 !== false;
    const mobileZoom = (isMobileViewport && fitMobile)
      ? Math.max(0.38, Math.min(1, (window.innerWidth - 28) / 794)).toFixed(3)
      : 1;

    container.innerHTML = `
      <div class="card no-print">
        <div class="row-between">
          <div>
            <h2 class="card-title" style="margin:0">Xem Trước Bản In / Xuất PDF Chuẩn Biểu Mẫu Kyowa Kako Việt Nam</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              Định dạng khổ A4.
            </p>
          </div>
          <div class="row">
            <select onchange="App.loadQuotationById(this.value)">
              ${state.quotations.map(sq => `
                <option value="${sq.id}" ${sq.id === q.id ? 'selected' : ''}>
                  [${esc(sq.quote_number)}] ${esc(sq.customer_name)}
                </option>
              `).join('')}
            </select>
            ${isMobileViewport ? `
              <button class="btn" onclick="App.toggleMobileA4Fit()">
                ${fitMobile ? '🔍 Phóng to 100%' : '📱 Thu vừa màn hình ĐT'}
              </button>
            ` : ''}
            <button class="btn" onclick="App.showTab('flow2')">
              ✏️ Quay lại Chỉnh sửa
            </button>
            ${canUserMarkSent(q) ? `
              <button class="btn" style="background:#2563eb;color:#fff;border-color:#1d4ed8;" onclick="App.changeQuoteStatus(${q.id}, 'sent')">
                📨 Đánh dấu Đã gửi KH
              </button>
            ` : ''}
            <button class="btn" id="btnExportPdfDirect" style="background:#dc2626;color:#fff;border-color:#b91c1c;" onclick="App.exportActiveQuoteToPdf(this)" title="Tải trực tiếp file PDF (.pdf) chuẩn khổ A4 về máy (Không mở hộp thoại máy in)">
              📄 Xuất PDF (.pdf)
            </button>
            <button class="btn" style="background:#1e40af;color:#fff;border-color:#1e3a8a;" onclick="App.exportActiveQuoteToWord()" title="Tải về file Word (.doc) chuẩn bố cục A4 KKVN để chỉnh sửa trong Microsoft Word">
              📝 Xuất Word (.doc)
            </button>
            <button class="btn" style="background:#15803d;color:#fff;border-color:#166534;" onclick="App.exportActiveQuoteToExcel()" title="Tải về file Excel (.xlsx) chuẩn bảng tính báo giá KKVN">
              📊 Xuất Excel (.xlsx)
            </button>
            <button class="btn btn-navy" onclick="window.print()" title="Mở hộp thoại kết nối máy in để in giấy trực tiếp">
              🖨️ In
            </button>
          </div>
        </div>
      </div>

      <div class="a4-preview-wrapper ${isMobileViewport && fitMobile ? 'mobile-fit-mode' : ''}">
        <div class="kkvn-sheet" style="${mobileZoom < 1 ? `zoom: ${mobileZoom};` : ''}">
          <div class="kkvn-top-bar">
            <div class="kkvn-logo-block">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" class="kkvn-logo-img">
              <div class="kkvn-quote-no">${formatQuoteNumberSplit(q.quote_number)}</div>
            </div>
            <h1 class="kkvn-doc-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
            <div class="kkvn-date">${esc(formatDateDMY(q.quote_date))}</div>
          </div>

          <table class="kkvn-party-table">
            <tr>
              <td class="kkvn-party-left">
                <div class="kkvn-cust-name">${esc(q.customer_name)}</div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">住所 Địa chỉ</span>
                  <span class="kkvn-info-val">${esc(q.customer_address || '')}</span>
                </div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">電話番号Điện thoại</span>
                  <span class="kkvn-info-val">${esc(q.customer_phone || '')}</span>
                </div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">連絡先Liên hệ</span>
                  <span class="kkvn-info-val">${esc(q.customer_contact || '')}</span>
                </div>
              </td>
              <td class="kkvn-party-right">
                <div class="kkvn-comp-name">KYOWA KAKO VIET NAM CO., LTD</div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">住所 Địa chỉ</span>
                  <span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span>
                </div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">承認者 Người duyệt</span>
                  <span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span>
                </div>
                <div class="kkvn-info-line">
                  <span class="kkvn-info-label">担当者 Người đảm trách</span>
                  <span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span>
                </div>
              </td>
            </tr>
          </table>

          <div class="kkvn-meta-lines">
            <div class="kkvn-meta-row">
              <span style="min-width:130px">プロジェクトDự Án :</span>
              <strong>${esc(q.project_name || '')}</strong>
            </div>
            <div class="kkvn-meta-row">
              <span style="min-width:130px">設置先Nơi lắp đặt :</span>
              <span>${esc(q.install_location || '')}</span>
            </div>
            <div class="kkvn-meta-row">
              <span style="min-width:130px">納期Thời gian đặt hàng :</span>
              <span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span>
            </div>
          </div>

          <table class="kkvn-items-table">
            <thead>
              <tr>
                <th style="width:42px">番号<br>STT</th>
                <th>明細<br>Chi Tiết</th>
                <th style="width:58px">単位<br>Đơn Vị</th>
                <th style="width:36px">数<br>SL</th>
                <th style="width:98px">単価<br>Đơn giá</th>
                <th style="width:104px">金額(VND)<br>Thành Tiền</th>
                <th style="width:96px">備考<br>Ghi Chú</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>

          <table class="kkvn-summary-block">
            ${anySecSubtotal ? `
              <tr>
                <td style="width:95px"></td>
                <td>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</td>
                <td style="width:104px;text-align:right;">${fmtPdfNum(q.subtotal_before_tax)}</td>
                <td style="width:96px"></td>
              </tr>
            ` : ''}
            <tr>
              <td style="width:95px"></td>
              <td>TAX VAT &nbsp;&nbsp;&nbsp; ${Number(q.vat_percent || 0)}%</td>
              <td style="width:104px;text-align:right;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) : '-'}</td>
              <td style="width:96px"></td>
            </tr>
            <tr>
              <td style="width:95px"></td>
              <td>Total - After TAX</td>
              <td style="width:104px;text-align:right;font-size:10.5pt;">${fmtPdfNum(q.total_after_tax)}</td>
              <td style="width:96px"></td>
            </tr>
          </table>

          <div class="kkvn-footer-grid">
            <div class="kkvn-notes-col">
              <div class="kkvn-notes-title">記 Ghi chú</div>

              <div class="kkvn-note-item">
                <span>①</span>
                <div>
                  <div>Thời hạn báo giá &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; <strong>${esc(t.validity_days ?? 30)}</strong> &nbsp; ngày</div>
                  <div>見積の有効期限 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; <strong>${esc(t.validity_days ?? 30)}</strong> &nbsp; 日間</div>
                </div>
              </div>

              <div class="kkvn-note-item">
                <span>②</span>
                <div>
                  <div>Địa điểm giao hàng &nbsp;: &nbsp; ${esc(t.delivery_place_vi || 'Tại chân công trình')}</div>
                  <div>Delivery先 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; ${esc(t.delivery_place_jp || '工事現場で引き渡し')}</div>
                </div>
              </div>

              <div class="kkvn-note-item">
                <span>③</span>
                <div>
                  <div>Thời gian giao hàng : &nbsp; <strong>${esc(t.delivery_days ?? q.lead_time_days ?? 180)}</strong> Ngày (Tính từ khi nhận cọc)</div>
                  <div>納期日.月.年 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; <strong>${esc(t.delivery_days ?? q.lead_time_days ?? 180)}</strong> 日間 (頭金を受けてから)</div>
                </div>
              </div>

              <div class="kkvn-note-item">
                <span>④</span>
                <div>
                  <div>Thời hạn bảo hành &nbsp;&nbsp;: &nbsp; <strong>${esc(t.warranty_months ?? 12)}</strong> Tháng (Tính từ khi giao hàng)</div>
                  <div>保証期間は設置後: &nbsp; <strong>${esc(t.warranty_months ?? 12)}</strong> か月（設置後から計算）</div>
                </div>
              </div>

              <div class="kkvn-note-item">
                <span>⑤</span>
                <div class="${t.note_5_highlight ? 'kkvn-note-red' : ''}" style="white-space:pre-line;">${esc(t.note_5_vi || '')}</div>
              </div>

              <div class="kkvn-note-item">
                <span>⑥</span>
                <div>
                  <div>Phương pháp thanh toán 支払方法 :</div>
                  ${(t.payment_lines || []).map(pl => `<div style="padding-left:6px;">${esc(pl)}</div>`).join('')}
                </div>
              </div>

              <div class="kkvn-note-item">
                <span>⑦</span>
                <div>
                  <div>Thông tin tài khoản &nbsp; 記銀行口座</div>
                  <div style="padding-left:8px;">
                    Tên tài khoản 口座名義 : &nbsp; ${esc(t.bank_account_name_vi || 'KYOWA KAKO VIETNAM CO.,LTD')}<br>
                    Số tài khoản 口座番号 &nbsp;: &nbsp; <strong>${esc(t.bank_account_no || '3680022466')}</strong><br>
                    Ngân hàng 銀行名 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; ${esc(t.bank_name_vi || 'BIDV Bank - Tan Binh Branch, HCMC')}
                  </div>
                </div>
              </div>

              <div class="kkvn-approval-box">
                <div style="display:flex;justify-content:space-between;">
                  <span>見積承認 Duyệt giá báo</span>
                  <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; /</span>
                </div>
              </div>
            </div>

            <div class="kkvn-sign-col">
              <div style="font-weight:600;margin-bottom:4px;">営業部 Phòng Kinh Doanh</div>
              <div class="kkvn-stamp-wrap">
                ${stampImgSrc ? `<img src="${stampImgSrc}" alt="Stamp" class="kkvn-stamp-img">` : '<div style="height:120px"></div>'}
                ${q.stamp_type === 'tayninh' || q.stamp_type === 'none' ? `
                  <div style="font-weight:700;font-size:10.5pt;margin-top:4px;">${esc(q.signer_name || 'NGUYỄN BẢO TRƯỜNG')}</div>
                ` : ''}
              </div>
            </div>
          </div>

        </div>
      </div>
    `;
  }

  // ===========================================================================
  // XUẤT FILE WORD (.doc) & EXCEL (.xlsx) CHUẨN BIỂU MẪU BÁO GIÁ KKVN
  // ===========================================================================
  async function fetchImageAsDataUrl(url) {
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function makeSafeFileName(q, ext) {
    const qNo = String(q.quote_number || 'BaoGia').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cust = String(q.customer_name || 'KhachHang')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    return `Bao_Gia_${qNo}_${cust || 'KKVN'}.${ext}`;
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 300);
  }

  function ensureHtml2PdfLoaded() {
    if (typeof window.html2pdf === 'function') return Promise.resolve(window.html2pdf);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = () => resolve(window.html2pdf);
      s.onerror = () => reject(new Error('Không thể tải thư viện tạo PDF.'));
      document.head.appendChild(s);
    });
  }

  async function exportActiveQuoteToPdf(btnEl = null) {
    const q = state.activeQuote;
    if (!q) {
      toast('Chưa có báo giá nào đang mở để xuất PDF.');
      return;
    }

    const sheetEl = document.querySelector('#view-print .kkvn-sheet');
    if (!sheetEl) {
      renderPrintView();
    }
    const targetSheet = document.querySelector('#view-print .kkvn-sheet');
    if (!targetSheet) {
      toast('Không tìm thấy khung biểu mẫu báo giá A4.');
      return;
    }

    const origText = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '⏳ Đang xuất PDF...';
    }

    const savedScrollX = window.scrollX || window.pageXOffset || 0;
    const savedScrollY = window.scrollY || window.pageYOffset || 0;

    try {
      await ensureHtml2PdfLoaded();

      // Tạo bản sao .kkvn-sheet với width: 100% để khớp chính xác trong khung 210mm của html2pdf (không bị cắt viền phải/trái)
      const clone = targetSheet.cloneNode(true);
      clone.style.zoom = '1';
      clone.style.width = '100%';
      clone.style.maxWidth = '100%';
      clone.style.minHeight = 'auto';
      clone.style.margin = '0';
      clone.style.padding = '8mm 10mm';
      clone.style.boxShadow = 'none';
      clone.style.boxSizing = 'border-box';
      clone.style.background = '#ffffff';

      // Nhúng ảnh Logo & Con dấu sang Base64 trên bản sao để html2canvas vẽ đầy đủ 100%
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(imgs.map(async (img) => {
        const src = img.getAttribute('src');
        if (src && !src.startsWith('data:')) {
          const dataUrl = await fetchImageAsDataUrl(src);
          if (dataUrl) img.setAttribute('src', dataUrl);
        }
      }));

      // Đưa scroll về (0, 0) trong lúc chụp canvas để tránh html2canvas bị lệch tọa độ khi trang đang cuộn
      window.scrollTo(0, 0);

      const filename = makeSafeFileName(q, 'pdf');
      const opt = {
        margin: 0,
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        }
      };

      const worker = window.html2pdf().set(opt).from(clone).toCanvas();
      await worker;

      // Chuẩn hóa tỷ lệ khung Canvas A4 để toàn bộ tờ báo giá (kể cả khung Duyệt giá báo & Mộc đỏ ở đáy)
      // vừa khít 1 trang A4 mà không bị cắt ngang viền dưới
      const rawCanvas = worker.prop.canvas;
      if (rawCanvas && rawCanvas.width > 0 && rawCanvas.height > 0) {
        const a4Ratio = 297 / 210;
        const maxSinglePageH = Math.floor(rawCanvas.width * a4Ratio);
        if (rawCanvas.height > maxSinglePageH && rawCanvas.height <= maxSinglePageH * 1.28) {
          const normCanvas = document.createElement('canvas');
          normCanvas.height = rawCanvas.height + 16;
          normCanvas.width = Math.ceil(normCanvas.height / a4Ratio);
          const ctx = normCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, normCanvas.width, normCanvas.height);
          const offsetX = Math.round((normCanvas.width - rawCanvas.width) / 2);
          ctx.drawImage(rawCanvas, offsetX, 8);
          worker.prop.canvas = normCanvas;
        }
      }

      await worker.save();
      toast(`Đã tải xuống file PDF: ${filename}`);
    } catch (err) {
      toast('Lỗi khi xuất file PDF: ' + (err.message || err));
    } finally {
      window.scrollTo(savedScrollX, savedScrollY);
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = origText || '📄 Xuất PDF (.pdf)';
      }
    }
  }

  async function exportActiveQuoteToWord() {
    const q = state.activeQuote;
    if (!q) {
      toast('Chưa có báo giá nào đang mở để xuất Word.');
      return;
    }
    recalcActiveQuoteTotals();
    const t = q.terms || {};

    const stampImgPath = q.stamp_type === 'tayninh'
      ? '/assets/stamp_tayninh.png'
      : q.stamp_type === 'longan'
        ? '/assets/stamp_longan.png'
        : null;

    const [logoDataUrl, stampDataUrl] = await Promise.all([
      fetchImageAsDataUrl('/assets/kkvn_logo.jpg'),
      fetchImageAsDataUrl(stampImgPath)
    ]);

    let itemsRowsWord = '';
    (q.sections || []).forEach(sec => {
      if (sec.title && sec.title.trim()) {
        itemsRowsWord += `
          <tr>
            <td colspan="7" style="border:1pt solid #000; padding:4pt 6pt; font-weight:bold; background:#f2f4f8;">
              ${esc(sec.title)}
            </td>
          </tr>
        `;
      }
      (sec.items || []).forEach(it => {
        itemsRowsWord += `
          <tr>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; font-weight:bold;">${esc(it.stt)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; font-weight:bold;">${esc(it.name_jp ? it.name_jp + ' ' : '')}${esc(it.name_vi)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center;">${esc(it.unit)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center;">${esc(it.quantity)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; text-align:right;">${fmtPdfNum(it.unit_price)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; text-align:right; font-weight:bold;">${fmtPdfNum(it.total_price)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; font-weight:bold;">${esc(it.remark || '')}</td>
          </tr>
        `;

        if (it.specs_text && it.specs_text.trim()) {
          itemsRowsWord += `
            <tr>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt;"></td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 6pt 2pt 16pt;">${esc(it.specs_text)}</td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
              <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            </tr>
          `;
        }

        if (it.sub_lines && it.sub_lines.length > 0) {
          it.sub_lines.forEach(sl => {
            const padLeft = sl.text && sl.text.startsWith('   +') ? '22pt' : '10pt';
            itemsRowsWord += `
              <tr>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt;"></td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 6pt 2pt ${padLeft};">
                  <span>${esc((sl.text || '').trim())}</span>
                  ${sl.right_text ? `<span style="float:right; font-weight:bold;"> &nbsp;&nbsp; ${esc(sl.right_text)}</span>` : ''}
                </td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
                <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt; text-align:center; font-weight:bold;">${esc(sl.remark || '')}</td>
              </tr>
            `;
          });
        }
      });

      if (sec.showSubtotal) {
        itemsRowsWord += `
          <tr>
            <td colspan="5" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold; background:#f8fafc;">
              ${esc(sec.subtotalLabel || 'TOTAL')}
            </td>
            <td style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold; background:#f8fafc;">
              ${fmtPdfNum(sec.subtotal)}
            </td>
            <td style="border:1pt solid #000; background:#f8fafc;"></td>
          </tr>
        `;
      }
    });

    const anySecSubtotal = (q.sections || []).some(s => s.showSubtotal);
    if (!anySecSubtotal) {
      itemsRowsWord += `
        <tr>
          <td colspan="5" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold; background:#f8fafc;">
            ${esc(t.total_label_before_tax || 'TOTAL')}
          </td>
          <td style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold; background:#f8fafc;">
            ${fmtPdfNum(q.subtotal_before_tax)}
          </td>
          <td style="border:1pt solid #000; background:#f8fafc;"></td>
        </tr>
      `;
    }

    const rawNo = String(q.quote_number || '');
    const mNo = rawNo.match(/^(\d{4}-\d{3})-(\d{2})$/);
    const qNoHtml = mNo
      ? `<strong>${esc(mNo[1])}-<span style="color:#c00000;">${esc(mNo[2])}</span></strong>`
      : `<strong>${esc(rawNo)}</strong>`;

    const wordHtml = `\ufeff<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(q.quote_number)} - ${esc(q.customer_name)}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page WordSection1 {
    size: 210mm 297mm;
    margin: 10mm 10mm 10mm 10mm;
  }
  div.WordSection1 { page: WordSection1; }
  body {
    font-family: "Times New Roman", "MS Mincho", serif;
    font-size: 10pt;
    color: #000000;
  }
  table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="WordSection1">
  <!-- TOP HEADER -->
  <table width="100%" style="margin-bottom:6pt;">
    <tr>
      <td width="28%" valign="top">
        ${logoDataUrl ? `<img src="${logoDataUrl}" width="115" height="36" alt="KKVN"><br>` : ''}
        <div style="font-size:10.5pt; margin-top:2pt;">${qNoHtml}</div>
      </td>
      <td width="44%" valign="middle" align="center">
        <div style="font-size:16pt; font-weight:bold; letter-spacing:0.5pt;">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
      </td>
      <td width="28%" valign="bottom" align="right" style="font-size:10pt; font-weight:bold;">
        ${esc(formatDateDMY(q.quote_date))}
      </td>
    </tr>
  </table>

  <!-- CUSTOMER & COMPANY PARTY INFO -->
  <table width="100%" style="margin-bottom:8pt;">
    <tr>
      <td width="49%" valign="top" style="padding-right:10pt;">
        <div style="color:#c00000; font-weight:bold; font-size:10.5pt; border-bottom:1.5pt solid #000; padding-bottom:2pt; margin-bottom:4pt;">
          ${esc(q.customer_name)}
        </div>
        <div style="margin-bottom:2pt;"><strong>住所 Địa chỉ:</strong> ${esc(q.customer_address || '')}</div>
        <div style="margin-bottom:2pt;"><strong>電話番号 Điện thoại:</strong> ${esc(q.customer_phone || '')}</div>
        <div style="margin-bottom:2pt;"><strong>連絡先 Liên hệ:</strong> ${esc(q.customer_contact || '')}</div>
      </td>
      <td width="2%"></td>
      <td width="49%" valign="top" style="padding-left:10pt;">
        <div style="color:#1f3864; font-weight:bold; font-size:11pt; border-bottom:1.5pt solid #000; padding-bottom:2pt; margin-bottom:4pt;">
          KYOWA KAKO VIET NAM CO., LTD
        </div>
        <div style="margin-bottom:2pt;"><strong>住所 Địa chỉ:</strong> ${esc(q.kkvn_address || '')}</div>
        <div style="margin-bottom:2pt;"><strong>承認者 Người duyệt:</strong> <em><strong>${esc(q.approver_name)} ${esc(q.approver_phone)}</strong></em></div>
        <div style="margin-bottom:2pt;"><strong>担当者 Người đảm trách:</strong> <em><strong>${esc(q.pic_name)} ${esc(q.pic_phone)}</strong></em></div>
      </td>
    </tr>
  </table>

  <!-- PROJECT META -->
  <table width="100%" style="margin-bottom:8pt; font-size:10pt;">
    <tr>
      <td width="24%" style="padding:1.5pt 0;"><strong>プロジェクト Dự Án :</strong></td>
      <td width="76%" style="padding:1.5pt 0;"><strong>${esc(q.project_name || '')}</strong></td>
    </tr>
    <tr>
      <td style="padding:1.5pt 0;"><strong>設置先 Nơi lắp đặt :</strong></td>
      <td style="padding:1.5pt 0;">${esc(q.install_location || '')}</td>
    </tr>
    <tr>
      <td style="padding:1.5pt 0;"><strong>納期 Thời gian đặt hàng :</strong></td>
      <td style="padding:1.5pt 0;"><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</td>
    </tr>
  </table>

  <!-- ITEMS TABLE -->
  <table width="100%" style="border:1.5pt solid #000; font-size:9.5pt;">
    <thead>
      <tr style="background:#e8eef7;">
        <th width="6%" style="border:1pt solid #000; padding:4pt 2pt; text-align:center;">番号<br>STT</th>
        <th width="42%" style="border:1pt solid #000; padding:4pt 4pt; text-align:center;">明細<br>Chi Tiết</th>
        <th width="9%" style="border:1pt solid #000; padding:4pt 2pt; text-align:center;">単位<br>Đơn Vị</th>
        <th width="6%" style="border:1pt solid #000; padding:4pt 2pt; text-align:center;">数<br>SL</th>
        <th width="12%" style="border:1pt solid #000; padding:4pt 4pt; text-align:center;">単価<br>Đơn giá</th>
        <th width="13%" style="border:1pt solid #000; padding:4pt 4pt; text-align:center;">金額(VND)<br>Thành Tiền</th>
        <th width="12%" style="border:1pt solid #000; padding:4pt 2pt; text-align:center;">備考<br>Ghi Chú</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRowsWord}
    </tbody>
  </table>

  <!-- SUMMARY TOTALS -->
  <table width="100%" style="margin-bottom:10pt; font-size:10pt;">
    ${anySecSubtotal ? `
      <tr>
        <td width="75%" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold;">
          ${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}
        </td>
        <td width="13%" style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold;">
          ${fmtPdfNum(q.subtotal_before_tax)}
        </td>
        <td width="12%" style="border:1pt solid #000;"></td>
      </tr>
    ` : ''}
    <tr>
      <td width="75%" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold;">
        TAX VAT &nbsp;&nbsp;&nbsp; ${Number(q.vat_percent || 0)}%
      </td>
      <td width="13%" style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold;">
        ${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) : '-'}
      </td>
      <td width="12%" style="border:1pt solid #000;"></td>
    </tr>
    <tr>
      <td width="75%" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold; background:#f0fdf4;">
        Total - After TAX
      </td>
      <td width="13%" style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold; font-size:10.5pt; background:#f0fdf4;">
        ${fmtPdfNum(q.total_after_tax)}
      </td>
      <td width="12%" style="border:1pt solid #000; background:#f0fdf4;"></td>
    </tr>
  </table>

  <!-- FOOTER NOTES & STAMP -->
  <table width="100%" style="font-size:9.5pt;">
    <tr>
      <td width="64%" valign="top">
        <div style="font-weight:bold; margin-bottom:4pt;">記 Ghi chú</div>
        <div style="margin-bottom:3pt;">
          <strong>①</strong> Thời hạn báo giá : <strong>${esc(t.validity_days ?? 30)}</strong> ngày<br>
          &nbsp;&nbsp;&nbsp;&nbsp;見積の有効期限 : <strong>${esc(t.validity_days ?? 30)}</strong> 日間
        </div>
        <div style="margin-bottom:3pt;">
          <strong>②</strong> Địa điểm giao hàng : ${esc(t.delivery_place_vi || 'Tại chân công trình')}<br>
          &nbsp;&nbsp;&nbsp;&nbsp;Delivery先 : ${esc(t.delivery_place_jp || '工事現場で引き渡し')}
        </div>
        <div style="margin-bottom:3pt;">
          <strong>③</strong> Thời gian giao hàng : <strong>${esc(t.delivery_days ?? q.lead_time_days ?? 180)}</strong> Ngày (Tính từ khi nhận cọc)<br>
          &nbsp;&nbsp;&nbsp;&nbsp;納期日.月.年 : <strong>${esc(t.delivery_days ?? q.lead_time_days ?? 180)}</strong> 日間 (頭金を受けてから)
        </div>
        <div style="margin-bottom:3pt;">
          <strong>④</strong> Thời hạn bảo hành : <strong>${esc(t.warranty_months ?? 12)}</strong> Tháng (Tính từ khi giao hàng)<br>
          &nbsp;&nbsp;&nbsp;&nbsp;保証期間は設置後: <strong>${esc(t.warranty_months ?? 12)}</strong> か月（設置後から計算）
        </div>
        <div style="margin-bottom:3pt; ${t.note_5_highlight ? 'color:#c00000; font-weight:bold;' : ''}">
          <strong>⑤</strong> ${esc(t.note_5_vi || '').replace(/\n/g, '<br>&nbsp;&nbsp;&nbsp;&nbsp;')}
        </div>
        <div style="margin-bottom:3pt;">
          <strong>⑥</strong> Phương pháp thanh toán 支払方法 :<br>
          ${(t.payment_lines || []).map(pl => `&nbsp;&nbsp;&nbsp;&nbsp;${esc(pl)}`).join('<br>')}
        </div>
        <div style="margin-bottom:6pt;">
          <strong>⑦</strong> Thông tin tài khoản 記銀行口座<br>
          &nbsp;&nbsp;&nbsp;&nbsp;Tên tài khoản 口座名義 : ${esc(t.bank_account_name_vi || 'KYOWA KAKO VIETNAM CO.,LTD')}<br>
          &nbsp;&nbsp;&nbsp;&nbsp;Số tài khoản 口座番号 : <strong>${esc(t.bank_account_no || '3680022466')}</strong><br>
          &nbsp;&nbsp;&nbsp;&nbsp;Ngân hàng 銀行名 : ${esc(t.bank_name_vi || 'BIDV Bank - Tan Binh Branch, HCMC')}
        </div>

        <table width="260" style="border:1.2pt solid #000; margin-top:4pt;">
          <tr>
            <td style="padding:4pt 6pt 38pt 6pt; font-weight:bold;">
              見積承認 Duyệt giá báo &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; /
            </td>
          </tr>
        </table>
      </td>
      <td width="36%" valign="top" align="center" style="padding-top:12pt;">
        <div style="font-weight:bold; margin-bottom:6pt;">営業部 Phòng Kinh Doanh</div>
        ${stampDataUrl ? `<img src="${stampDataUrl}" width="175" alt="Stamp"><br>` : '<div style="height:95pt;"></div>'}
        ${(q.stamp_type === 'tayninh' || q.stamp_type === 'none') ? `
          <div style="font-weight:bold; font-size:10.5pt; margin-top:4pt;">${esc(q.signer_name || 'NGUYỄN BẢO TRƯỜNG')}</div>
        ` : ''}
      </td>
    </tr>
  </table>
</div>
</body>
</html>`;

    const blob = new Blob([wordHtml], { type: 'application/msword;charset=utf-8' });
    const filename = makeSafeFileName(q, 'doc');
    triggerBlobDownload(blob, filename);
    toast(`Đã xuất file Word: ${filename}`);
  }

  // --- Pure-JS OpenXML (.xlsx) Generator for Active Quotation ---
  function createStoreZipBuffer(filesMap) {
    const enc = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c >>> 0;
    }
    function crc32(bytes) {
      let c = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) {
        c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
      }
      return (c ^ 0xffffffff) >>> 0;
    }

    const entries = Object.keys(filesMap).map(name => {
      const nameBytes = enc.encode(name);
      const dataBytes = typeof filesMap[name] === 'string' ? enc.encode(filesMap[name]) : filesMap[name];
      const crc = crc32(dataBytes);
      return { nameBytes, dataBytes, crc };
    });

    let localSize = 0;
    let centralSize = 0;
    entries.forEach(e => {
      localSize += 30 + e.nameBytes.length + e.dataBytes.length;
      centralSize += 46 + e.nameBytes.length;
    });

    const out = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(out.buffer);
    let localOffset = 0;
    let centralOffset = localSize;

    entries.forEach(e => {
      const myLocalOffset = localOffset;
      // Local file header
      view.setUint32(localOffset, 0x04034b50, true);
      view.setUint16(localOffset + 4, 20, true);
      view.setUint16(localOffset + 6, 0x0800, true); // UTF-8 flag
      view.setUint16(localOffset + 8, 0, true);      // STORE (no compression)
      view.setUint16(localOffset + 10, 0, true);
      view.setUint16(localOffset + 12, 0x5421, true);
      view.setUint32(localOffset + 14, e.crc, true);
      view.setUint32(localOffset + 18, e.dataBytes.length, true);
      view.setUint32(localOffset + 22, e.dataBytes.length, true);
      view.setUint16(localOffset + 26, e.nameBytes.length, true);
      view.setUint16(localOffset + 28, 0, true);
      out.set(e.nameBytes, localOffset + 30);
      out.set(e.dataBytes, localOffset + 30 + e.nameBytes.length);
      localOffset += 30 + e.nameBytes.length + e.dataBytes.length;

      // Central directory header
      view.setUint32(centralOffset, 0x02014b50, true);
      view.setUint16(centralOffset + 4, 20, true);
      view.setUint16(centralOffset + 6, 20, true);
      view.setUint16(centralOffset + 8, 0x0800, true);
      view.setUint16(centralOffset + 10, 0, true);
      view.setUint16(centralOffset + 12, 0, true);
      view.setUint16(centralOffset + 14, 0x5421, true);
      view.setUint32(centralOffset + 16, e.crc, true);
      view.setUint32(centralOffset + 20, e.dataBytes.length, true);
      view.setUint32(centralOffset + 24, e.dataBytes.length, true);
      view.setUint16(centralOffset + 28, e.nameBytes.length, true);
      view.setUint16(centralOffset + 30, 0, true);
      view.setUint16(centralOffset + 32, 0, true);
      view.setUint16(centralOffset + 34, 0, true);
      view.setUint16(centralOffset + 36, 0, true);
      view.setUint32(centralOffset + 38, 0, true);
      view.setUint32(centralOffset + 42, myLocalOffset, true);
      out.set(e.nameBytes, centralOffset + 46);
      centralOffset += 46 + e.nameBytes.length;
    });

    // End of central directory record
    view.setUint32(centralOffset, 0x06054b50, true);
    view.setUint16(centralOffset + 4, 0, true);
    view.setUint16(centralOffset + 6, 0, true);
    view.setUint16(centralOffset + 8, entries.length, true);
    view.setUint16(centralOffset + 10, entries.length, true);
    view.setUint32(centralOffset + 12, centralSize, true);
    view.setUint32(centralOffset + 16, localSize, true);
    view.setUint16(centralOffset + 20, 0, true);

    return out;
  }

  function xmlEsc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function exportActiveQuoteToExcel() {
    const q = state.activeQuote;
    if (!q) {
      toast('Chưa có báo giá nào đang mở để xuất Excel.');
      return;
    }
    recalcActiveQuoteTotals();
    const t = q.terms || {};

    // Style indices in xl/styles.xml:
    // 0: default (10.5pt Times New Roman)
    // 1: Doc Title (16pt Bold Center)
    // 2: Quote No / Date (10.5pt Bold)
    // 3: Customer Name (11pt Bold Red #C00000, bottom medium border)
    // 4: Company Name (11pt Bold Navy #1F3864, bottom medium border)
    // 5: Normal Left
    // 6: Bold Left
    // 7: Table Header (10pt Bold Center Wrap, thin border, #E8EEF7 fill)
    // 8: Section Header (10.5pt Bold Left, thin border, #F2F4F8 fill)
    // 9: Item Center (STT, Unit, Qty, thin border)
    // 10: Item Bold Left Wrap (Main Name, thin border)
    // 11: Item Normal Left Wrap (Sub-line / Specs, thin border)
    // 12: Item Number #,##0 (Unit price, thin border)
    // 13: Item Bold Number #,##0 (Total price, thin border)
    // 14: Item Bold Center (Remark, thin border)
    // 15: Subtotal Label (10.5pt Bold Center, thin border, #F8FAFC fill)
    // 16: Subtotal Number #,##0 (10.5pt Bold Right, thin border, #F8FAFC fill)
    // 17: Grand Total After Tax Label (11pt Bold Center, thin border, #E2EFDA fill)
    // 18: Grand Total After Tax Number #,##0 (11pt Bold Right, thin border, #E2EFDA fill)
    // 19: Approval Box (10pt Bold, medium border)

    const rows = [];
    const merges = [];
    function addRow(cellsObj, height = null) {
      const rNum = rows.length + 1;
      rows.push({ rNum, cells: cellsObj, height });
      return rNum;
    }

    // Row 1: Quote No | Title | Date
    addRow({
      A: { v: q.quote_number || '', s: 2 },
      B: { v: q.doc_title || '御見積 BÁO GIÁ', s: 1 },
      G: { v: formatDateDMY(q.quote_date), s: 2 }
    }, 28);
    merges.push('B1:F1');

    // Row 2: Blank spacer
    addRow({}, 10);

    // Rows 3-6: Customer & KKVN Party Info
    const rCust = addRow({
      A: { v: q.customer_name || '', s: 3 },
      B: { v: '', s: 3 },
      D: { v: 'KYOWA KAKO VIET NAM CO., LTD', s: 4 },
      E: { v: '', s: 4 },
      F: { v: '', s: 4 },
      G: { v: '', s: 4 }
    }, 20);
    merges.push(`A${rCust}:B${rCust}`, `D${rCust}:G${rCust}`);

    const rAddr = addRow({
      A: { v: `住所 Địa chỉ: ${q.customer_address || ''}`, s: 5 },
      D: { v: `住所 Địa chỉ: ${q.kkvn_address || ''}`, s: 5 }
    }, 18);
    merges.push(`A${rAddr}:B${rAddr}`, `D${rAddr}:G${rAddr}`);

    const rPhone = addRow({
      A: { v: `電話番号 Điện thoại: ${q.customer_phone || ''}`, s: 5 },
      D: { v: `承認者 Người duyệt: ${q.approver_name || ''} ${q.approver_phone || ''}`, s: 6 }
    }, 18);
    merges.push(`A${rPhone}:B${rPhone}`, `D${rPhone}:G${rPhone}`);

    const rContact = addRow({
      A: { v: `連絡先 Liên hệ: ${q.customer_contact || ''}`, s: 5 },
      D: { v: `担当者 Người đảm trách: ${q.pic_name || ''} ${q.pic_phone || ''}`, s: 6 }
    }, 18);
    merges.push(`A${rContact}:B${rContact}`, `D${rContact}:G${rContact}`);

    addRow({}, 8);

    // Project meta lines
    const rProj = addRow({
      A: { v: 'プロジェクト Dự Án :', s: 6 },
      B: { v: q.project_name || '', s: 6 }
    }, 18);
    merges.push(`B${rProj}:G${rProj}`);

    const rLoc = addRow({
      A: { v: '設置先 Nơi lắp đặt :', s: 5 },
      B: { v: q.install_location || '', s: 5 }
    }, 18);
    merges.push(`B${rLoc}:G${rLoc}`);

    const rLead = addRow({
      A: { v: '納期 Thời gian đặt hàng :', s: 5 },
      B: { v: `${q.lead_time_days || 180} 日間 ${q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)'}`, s: 6 }
    }, 18);
    merges.push(`B${rLead}:G${rLead}`);

    addRow({}, 8);

    // Table Header
    addRow({
      A: { v: '番号 / STT', s: 7 },
      B: { v: '明細 / Chi Tiết', s: 7 },
      C: { v: '単位 / Đơn Vị', s: 7 },
      D: { v: '数 / SL', s: 7 },
      E: { v: '単価 / Đơn giá', s: 7 },
      F: { v: '金額(VND) / Thành Tiền', s: 7 },
      G: { v: '備考 / Ghi Chú', s: 7 }
    }, 26);

    // Items & Sections
    (q.sections || []).forEach(sec => {
      if (sec.title && sec.title.trim()) {
        const rSec = addRow({
          A: { v: sec.title, s: 8 },
          B: { v: '', s: 8 }, C: { v: '', s: 8 }, D: { v: '', s: 8 },
          E: { v: '', s: 8 }, F: { v: '', s: 8 }, G: { v: '', s: 8 }
        }, 20);
        merges.push(`A${rSec}:G${rSec}`);
      }

      (sec.items || []).forEach(it => {
        const fullTitle = `${it.name_jp ? it.name_jp + ' ' : ''}${it.name_vi || ''}`;
        addRow({
          A: { v: it.stt || '', s: 9 },
          B: { v: fullTitle, s: 10 },
          C: { v: it.unit || '', s: 9 },
          D: { v: Number(it.quantity || 1), t: 'n', s: 9 },
          E: { v: Number(it.unit_price || 0), t: 'n', s: 12 },
          F: { v: Number(it.total_price || 0), t: 'n', s: 13 },
          G: { v: it.remark || '', s: 14 }
        }, 20);

        if (it.specs_text && it.specs_text.trim()) {
          addRow({
            A: { v: '', s: 9 },
            B: { v: `   ${it.specs_text}`, s: 11 },
            C: { v: '', s: 9 }, D: { v: '', s: 9 },
            E: { v: '', s: 12 }, F: { v: '', s: 13 }, G: { v: '', s: 14 }
          }, 18);
        }

        if (it.sub_lines && it.sub_lines.length > 0) {
          it.sub_lines.forEach(sl => {
            const subText = sl.right_text
              ? `${sl.text || ''}   (${sl.right_text})`
              : (sl.text || '');
            addRow({
              A: { v: '', s: 9 },
              B: { v: subText, s: 11 },
              C: { v: '', s: 9 }, D: { v: '', s: 9 },
              E: { v: '', s: 12 }, F: { v: '', s: 13 },
              G: { v: sl.remark || '', s: 14 }
            }, 18);
          });
        }
      });

      if (sec.showSubtotal) {
        const rSub = addRow({
          A: { v: sec.subtotalLabel || 'TOTAL', s: 15 },
          B: { v: '', s: 15 }, C: { v: '', s: 15 }, D: { v: '', s: 15 }, E: { v: '', s: 15 },
          F: { v: Number(sec.subtotal || 0), t: 'n', s: 16 },
          G: { v: '', s: 15 }
        }, 20);
        merges.push(`A${rSub}:E${rSub}`);
      }
    });

    // Summary Rows
    const rPre = addRow({
      A: { v: t.total_label_before_tax || 'Total (A) + (B) - Before TAX', s: 15 },
      B: { v: '', s: 15 }, C: { v: '', s: 15 }, D: { v: '', s: 15 }, E: { v: '', s: 15 },
      F: { v: Number(q.subtotal_before_tax || 0), t: 'n', s: 16 },
      G: { v: '', s: 15 }
    }, 20);
    merges.push(`A${rPre}:E${rPre}`);

    const rVat = addRow({
      A: { v: `TAX VAT   ${Number(q.vat_percent || 0)}%`, s: 15 },
      B: { v: '', s: 15 }, C: { v: '', s: 15 }, D: { v: '', s: 15 }, E: { v: '', s: 15 },
      F: { v: Number(q.vat_amount || 0), t: 'n', s: 16 },
      G: { v: '', s: 15 }
    }, 20);
    merges.push(`A${rVat}:E${rVat}`);

    const rPost = addRow({
      A: { v: 'Total - After TAX', s: 17 },
      B: { v: '', s: 17 }, C: { v: '', s: 17 }, D: { v: '', s: 17 }, E: { v: '', s: 17 },
      F: { v: Number(q.total_after_tax || 0), t: 'n', s: 18 },
      G: { v: '', s: 17 }
    }, 22);
    merges.push(`A${rPost}:E${rPost}`);

    addRow({}, 10);

    // Commercial Notes ① -> ⑦ & Sales Dept Signer
    const noteLines = [
      `① Thời hạn báo giá (見積の有効期限): ${t.validity_days ?? 30} ngày / 日間`,
      `② Địa điểm giao hàng (Delivery先): ${t.delivery_place_vi || 'Tại chân công trình'} (${t.delivery_place_jp || '工事現場で引き渡し'})`,
      `③ Thời gian giao hàng (納期): ${t.delivery_days ?? q.lead_time_days ?? 180} Ngày (Tính từ khi nhận cọc)`,
      `④ Thời hạn bảo hành (保証期間): ${t.warranty_months ?? 12} Tháng (Tính từ khi giao hàng)`,
      `⑤ ${(t.note_5_vi || '').replace(/\n/g, ' | ')}`,
      `⑥ Phương pháp thanh toán (支払方法): ${(t.payment_lines || []).join(' ; ')}`,
      `⑦ Tài khoản NH (銀行口座): ${t.bank_account_name_vi || 'KYOWA KAKO VIETNAM CO.,LTD'} - STK: ${t.bank_account_no || '3680022466'} (${t.bank_name_vi || 'BIDV Bank - Tan Binh Branch, HCMC'})`
    ];

    const rNoteHead = addRow({
      A: { v: '記 Ghi chú', s: 6 },
      F: { v: '営業部 Phòng Kinh Doanh', s: 14 }
    }, 18);
    merges.push(`A${rNoteHead}:D${rNoteHead}`, `F${rNoteHead}:G${rNoteHead}`);

    noteLines.forEach((nl, idx) => {
      const cells = { A: { v: nl, s: 5 } };
      if (idx === 3) {
        cells.F = { v: q.signer_name || 'NGUYỄN BẢO TRƯỜNG', s: 14 };
      }
      const rN = addRow(cells, 18);
      merges.push(`A${rN}:E${rN}`);
      if (idx === 3) merges.push(`F${rN}:G${rN}`);
    });

    addRow({}, 6);
    const rApp = addRow({
      A: { v: '見積承認 Duyệt giá báo :          /          /          ', s: 19 },
      B: { v: '', s: 19 }
    }, 32);
    merges.push(`A${rApp}:B${rApp}`);

    // Build sheet1.xml
    const colOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    let sheetDataXml = '';
    rows.forEach(row => {
      const htAttr = row.height ? ` ht="${row.height}" customHeight="1"` : '';
      sheetDataXml += `<row r="${row.rNum}"${htAttr}>`;
      colOrder.forEach(col => {
        const cell = row.cells[col];
        if (!cell) return;
        const ref = `${col}${row.rNum}`;
        const sAttr = cell.s !== undefined ? ` s="${cell.s}"` : '';
        if (cell.t === 'n') {
          sheetDataXml += `<c r="${ref}"${sAttr}><v>${Number(cell.v || 0)}</v></c>`;
        } else {
          sheetDataXml += `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${xmlEsc(cell.v)}</t></is></c>`;
        }
      });
      sheetDataXml += '</row>';
    });

    const mergeXml = merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';

    const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <cols>
    <col min="1" max="1" width="9" customWidth="1"/>
    <col min="2" max="2" width="52" customWidth="1"/>
    <col min="3" max="3" width="11" customWidth="1"/>
    <col min="4" max="4" width="8" customWidth="1"/>
    <col min="5" max="5" width="16" customWidth="1"/>
    <col min="6" max="6" width="18" customWidth="1"/>
    <col min="7" max="7" width="16" customWidth="1"/>
  </cols>
  <sheetData>${sheetDataXml}</sheetData>
  ${mergeXml}
  <pageMargins left="0.35" right="0.35" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
  <pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10.5"/><name val="Times New Roman"/></font>
    <font><b/><sz val="16"/><name val="Times New Roman"/></font>
    <font><b/><sz val="10.5"/><name val="Times New Roman"/></font>
    <font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Times New Roman"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F3864"/><name val="Times New Roman"/></font>
    <font><b/><sz val="10"/><name val="Times New Roman"/></font>
    <font><b/><sz val="11"/><name val="Times New Roman"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>
    <border><left/><right/><top/><bottom style="medium"/><diagonal/></border>
    <border><left style="medium"/><right style="medium"/><top style="medium"/><bottom style="medium"/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="20">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="3" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const sheetNameSafe = xmlEsc(String(q.quote_number || 'Bao_Gia').slice(0, 31));
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${sheetNameSafe}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const zipBytes = createStoreZipBuffer({
      '[Content_Types].xml': contentTypesXml,
      '_rels/.rels': relsXml,
      'xl/workbook.xml': workbookXml,
      'xl/_rels/workbook.xml.rels': wbRelsXml,
      'xl/styles.xml': stylesXml,
      'xl/worksheets/sheet1.xml': sheet1Xml
    });

    const blob = new Blob([zipBytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const filename = makeSafeFileName(q, 'xlsx');
    triggerBlobDownload(blob, filename);
    toast(`Đã xuất file Excel: ${filename}`);
  }

  // ===========================================================================
  // TAB 4: QUẢN LÝ HỒ SƠ BÁO GIÁ & PHÊ DUYỆT
  // ===========================================================================
  function renderQuotesList() {
    const container = document.getElementById('view-quotes');
    if (!container) return;

    const showCost = state.permissions.canViewCost;
    const canApprove = state.permissions.canApproveQuote;
    const canDelete = state.permissions.canDeleteQuote;
    const statusLabels = {
      draft: 'Bản nháp',
      pending_approval: 'Chờ duyệt',
      approved: 'Đã duyệt',
      sent: 'Đã gửi KH',
      rejected: 'Cần chỉnh sửa'
    };

    const filtered = state.quotations.filter(q => {
      if (state.quoteStatusFilter !== 'ALL' && q.status !== state.quoteStatusFilter) return false;
      if (state.quoteSearch) {
        const s = state.quoteSearch.toLowerCase();
        const match =
          (q.quote_number || '').toLowerCase().includes(s) ||
          (q.customer_name || '').toLowerCase().includes(s) ||
          (q.project_name || '').toLowerCase().includes(s) ||
          (q.pic_name || '').toLowerCase().includes(s);
        if (!match) return false;
      }
      return true;
    });

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Quản Lý Hồ Sơ Báo Giá, Lịch Sử Phiên Bản (Revision) & Phê Duyệt</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              ${state.permissions.canViewAllQuotes ? 'Hiển thị toàn bộ báo giá trong hệ thống.' : 'Chế độ giới hạn: Chỉ hiển thị các báo giá do bạn tạo hoặc đứng tên phụ trách.'}
            </p>
          </div>
          <div class="row">
            <input type="text" id="quoteSearchInput" placeholder="Tìm số BG, khách hàng, dự án..." value="${esc(state.quoteSearch)}"
                   oninput="App.setQuoteFilter('search', this.value)" style="flex:1 1 200px;">
            <select onchange="App.setQuoteFilter('status', this.value)">
              <option value="ALL" ${state.quoteStatusFilter === 'ALL' ? 'selected' : ''}>Tất cả trạng thái (${state.quotations.length})</option>
              <option value="draft" ${state.quoteStatusFilter === 'draft' ? 'selected' : ''}>Bản nháp</option>
              <option value="pending_approval" ${state.quoteStatusFilter === 'pending_approval' ? 'selected' : ''}>Chờ duyệt</option>
              <option value="approved" ${state.quoteStatusFilter === 'approved' ? 'selected' : ''}>Đã duyệt</option>
              <option value="sent" ${state.quoteStatusFilter === 'sent' ? 'selected' : ''}>Đã gửi KH</option>
            </select>
            <button class="btn btn-primary" onclick="App.showTab('flow1')">
              + Lập Báo Giá Mới Từ Cấu Hình Cơ Bản
            </button>
          </div>
        </div>


        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:105px; min-width:95px;">Số Báo Giá</th>
                <th style="width:88px; min-width:82px;">Ngày BG</th>
                <th style="min-width:210px;">Khách Hàng & Dự Án</th>
                <th style="width:165px; min-width:145px;">Người Tạo & Đảm Trách</th>
                <th class="c" style="width:86px;">Cập Nhật</th>
                ${showCost ? '<th class="r cost-col" style="width:125px;">Tổng Giá Cost</th>' : ''}
                <th class="r" style="width:125px;">Tổng Trước Thuế</th>
                <th class="c" style="width:52px;">VAT</th>
                <th class="r" style="width:130px;">Tổng Sau Thuế</th>
                <th class="c" style="width:92px;">Trạng Thái</th>
                <th class="c" style="width:142px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(q => {
      const canEditRow = canUserEditQuote(q);
      const canMarkSentRow = canUserMarkSent(q);
      const viewTooltip = (q.status === 'approved' || q.status === 'sent')
        ? `Báo giá ${q.status === 'sent' ? 'Đã gửi KH' : 'Đã duyệt'} (Khóa chỉnh sửa - Nhấn để xem chi tiết)`
        : `Báo giá do @${esc(q.created_by)} tạo (Chế độ Chỉ xem)`;
      return `
                <tr>
                  <td>
                    <strong style="color:var(--navy)">${esc(q.quote_number)}</strong>
                    <div style="font-size:11px;color:var(--muted)">Rev ${String(q.revision || 1).padStart(2, '0')}</div>
                  </td>
                  <td>${esc(formatDateDMY(q.quote_date))}</td>
                  <td>
                    <strong>${esc(q.customer_name)}</strong>
                    <div style="font-size:12px;color:var(--muted)">${esc(q.project_name || q.install_location || '—')}</div>
                  </td>
                  <td>
                    <div><strong>${esc(q.pic_name)}</strong></div>
                    ${(q.status === 'approved' || q.status === 'sent') ? `<div style="font-size:11px;color:var(--green);font-weight:600;">✓ Duyệt: ${esc(q.approved_by || q.approver_name)}</div>` : ''}
                  </td>
                  <td class="c" style="font-size:11.5px;line-height:1.3;padding:6px 6px;">
                    ${(() => {
          const raw = String(q.updated_at || q.created_at || '').trim().split(/[\sT]+/);
          const d = formatDateDMY(raw[0] || '');
          const t = (raw[1] || '').slice(0, 5);
          return `<div style="font-weight:600;color:#334155;">${esc(d)}</div>` +
            (t ? `<div style="font-size:11px;color:var(--muted);">${esc(t)}</div>` : '');
        })()}
                  </td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(q.subtotal_cost)}</td>` : ''}
                  <td class="r"><strong>${fmtVnd(q.subtotal_before_tax)}</strong></td>
                  <td class="c">${q.vat_percent}%</td>
                  <td class="r" style="color:var(--green);font-weight:700;">${fmtVnd(q.total_after_tax)}</td>
                  <td class="c">
                    <span class="status-pill status-${esc(q.status)}">${statusLabels[q.status] || q.status}</span>
                  </td>
                  <td class="c">
                    <div class="action-group-compact">
                      ${canEditRow ? `
                        <button class="btn btn-icon btn-navy" onclick="App.openQuoteToTab(${q.id}, 'flow2')" title="Chỉnh sửa báo giá">
                          ✏️
                        </button>
                      ` : `
                        <button class="btn btn-icon" onclick="App.openQuoteToTab(${q.id}, 'flow2')" title="${esc(viewTooltip)}">
                          👁️
                        </button>
                      `}
                      <button class="btn btn-icon" onclick="App.openQuoteToTab(${q.id}, 'print')" title="Xem bản in / Xuất PDF">🖨️</button>
                      <button class="btn btn-icon" onclick="App.createNewRevision(${q.id})" title="Tạo phiên bản mới (+Rev)">📑</button>
                      ${canEditRow && (q.status === 'draft' || q.status === 'rejected') ? `
                        <button class="btn btn-icon" style="background:#fef3c7;border-color:#f59e0b;color:#b45309;" onclick="App.changeQuoteStatus(${q.id}, 'pending_approval')" title="Gửi duyệt báo giá này">📤</button>
                      ` : ''}
                      ${canApprove && q.status !== 'approved' && q.status !== 'sent' ? `
                        <button class="btn btn-icon btn-primary" onclick="App.changeQuoteStatus(${q.id}, 'approved')" title="Phê duyệt báo giá">✅</button>
                      ` : ''}
                      ${canMarkSentRow ? `
                        <button class="btn btn-icon" style="background:#dbeafe;border-color:#60a5fa;color:#1d4ed8;" onclick="App.changeQuoteStatus(${q.id}, 'sent')" title="Đánh dấu Đã gửi báo giá cho Khách hàng">📨</button>
                      ` : ''}
                      ${canDelete ? `
                        <button class="btn btn-icon btn-danger" onclick="App.deleteQuote(${q.id})" title="Xóa báo giá">🗑</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }


  function setQuoteFilter(type, val) {
    if (type === 'search') state.quoteSearch = val;
    if (type === 'status') state.quoteStatusFilter = val;
    const activeEl = document.activeElement;
    const wasSearchFocused = activeEl && activeEl.id === 'quoteSearchInput';
    const selStart = wasSearchFocused ? activeEl.selectionStart : null;
    const selEnd = wasSearchFocused ? activeEl.selectionEnd : null;

    renderQuotesList();

    if (wasSearchFocused) {
      const nextInput = document.getElementById('quoteSearchInput');
      if (nextInput) {
        nextInput.focus();
        try {
          if (selStart !== null && selEnd !== null) {
            nextInput.setSelectionRange(selStart, selEnd);
          }
        } catch {}
      }
    }
  }

  async function openQuoteToTab(id, tab) {
    await loadQuotationById(id);
    showTab(tab);
  }

  function deleteQuote(id) {
    const target = state.quotations.find(q => q.id === id);
    const qNum = target ? target.quote_number : `#${id}`;
    const cName = target ? target.customer_name : '';
    const creator = target ? target.created_by : '';

    openConfirmModal({
      title: '⚠️ Xác Nhận Xóa Hồ Sơ Báo Giá',
      okText: '🗑 Xác nhận Xóa vĩnh viễn',
      isDanger: true,
      messageHtml: `
        Bạn có chắc chắn muốn <strong style="color:var(--red)">XÓA VĨNH VIỄN</strong> hồ sơ báo giá này khỏi hệ thống?
        <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;">
          <div>• Số báo giá: <strong style="color:var(--red)">${esc(qNum)}</strong></div>
          <div>• Khách hàng: <strong>${esc(cName)}</strong></div>
          <div>• Người tạo: <strong>@${esc(creator)}</strong></div>
        </div>
        <span style="color:var(--red);font-size:12.5px;font-weight:700;">⚠️ Lưu ý: Hành động này không thể hoàn tác sau khi xóa!</span>
      `,
      onConfirm: async () => {
        try {
          await api(`/api/quotations/${id}`, { method: 'DELETE' });
          await loadBootstrap();
          renderAll();
          toast(`Đã xóa báo giá ${qNum}.`);
        } catch (err) {
          toast('Lỗi xóa: ' + err.message);
        }
      }
    });
  }

  // ===========================================================================
  // TAB 5: QUẢN TRỊ DANH MỤC (MASTER DATA) & ĐỒNG BỘ EXCEL
  // ===========================================================================
  function renderCatalogView() {
    const container = document.getElementById('view-catalog');
    if (!container) return;

    const showCost = state.permissions.canViewCost;
    const canManageCat = state.permissions.canManageCatalog;
    const canExport = state.permissions.canExportExcel || canManageCat;
    const productLines = [...new Set(state.models.map(m => m.product_line))];
    const filteredModels = state.models.filter(m =>
      state.catFilterProd === 'ALL' || m.product_line === state.catFilterProd
    );
    const filteredEquip = state.equipment.filter(e =>
      state.equipFilterCat === 'ALL' || e.category === state.equipFilterCat
    );

    container.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h2 class="card-title">Quản Trị Danh Mục Bảng Giá & Đồng Bộ File Excel (Data báo giá.xlsx)</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              ${state.models.length} cấu hình Model tháp (Giá Cost & Giá Cơ Bản) và ${state.equipment.length} thiết bị đo, quạt, bơm, phụ kiện, dịch vụ.
            </p>
          </div>
          <div class="row">
            ${canExport ? `
              <a class="btn btn-navy" href="/api/catalog/export-excel?token=${encodeURIComponent(state.authToken)}" download="Data_bao_gia_Kyowa_Kako.xlsx" style="text-decoration:none">
                📥 Xuất Danh Mục Ra Excel (.xlsx 3 Sheet)
              </a>
            ` : ''}
            ${canManageCat ? `
              <label class="btn btn-primary" style="cursor:pointer;margin:0;">
                📤 Nhập / Cập Nhật Từ File Excel (.xlsx)
                <input type="file" accept=".xlsx" style="display:none" onchange="App.uploadExcelCatalog(this)">
              </label>
              <button class="btn" onclick="App.resyncDefaultExcel()">
                🔄 Đồng bộ lại từ file Data báo giá.xlsx gốc
              </button>
            ` : `
              <span class="status-pill status-pending_approval">Tài khoản của bạn ở chế độ Chỉ xem Danh mục</span>
            `}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="row" style="align-items:center;">
            <h3 class="card-title" style="margin:0;">1. Bảng Giá Cấu Hình Hệ Tháp (${filteredModels.length} Model)</h3>
            <select onchange="App.setCatFilterProd(this.value)">
              <option value="ALL" ${state.catFilterProd === 'ALL' ? 'selected' : ''}>Tất cả dòng tháp (${state.models.length})</option>
              ${productLines.map(p => `<option value="${esc(p)}" ${state.catFilterProd === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
          </div>
          ${canManageCat ? `
            <button class="btn btn-sm btn-primary" onclick="App.showAddModelModal()">
              + Thêm Model Tháp Mới
            </button>
          ` : ''}
        </div>

        <div id="addModelFormWrap" class="hidden" style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid var(--border);margin-bottom:14px;">
          <strong style="color:var(--navy);display:block;margin-bottom:8px;">Thêm / Cập nhật Model Tháp</strong>
          <div class="grid-4" style="margin-bottom:10px;">
            <label class="field">Dòng tháp <input type="text" id="nm_prod" value="FSW 1.0L"></label>
            <label class="field">Mã Model <input type="text" id="nm_code" placeholder="VD: 80"></label>
            <label class="field">Lưu lượng (m³/min) <input type="number" id="nm_flow" value="60"></label>
            <label class="field">Dòng Quạt / Motor kW / Pa <input type="text" id="nm_fan" value="#2 | 3.7 | 1100"></label>
            <label class="field">Giá Cost Hệ tháp <input type="number" id="nm_tc" value="110930000"></label>
            <label class="field">Giá Cơ Bản Hệ tháp <input type="number" id="nm_tb" value="221860000"></label>
            <label class="field">Giá Cost Quạt <input type="number" id="nm_fc" value="69793000"></label>
            <label class="field">Giá Cơ Bản Quạt <input type="number" id="nm_fb" value="139586000"></label>
            <label class="field">Dòng Bơm <input type="text" id="nm_pump" value="40VO3 0.75kW"></label>
            <label class="field">Giá Cost Bơm <input type="number" id="nm_pc" value="91328000"></label>
            <label class="field">Giá Cơ Bản Bơm <input type="number" id="nm_pb" value="182656000"></label>
            <label class="field">Giá Cơ Bản Tủ Điện <input type="number" id="nm_pnb" value="189220000"></label>
          </div>
          <div class="row">
            <button class="btn btn-sm btn-primary" onclick="App.submitNewModel()">Lưu Model</button>
            <button class="btn btn-sm" onclick="document.getElementById('addModelFormWrap').classList.add('hidden')">Đóng</button>
          </div>
        </div>

        <div class="table-wrap" style="max-height: 460px; overflow-y: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Dòng SP</th>
                <th>Model</th>
                <th class="r">Lưu lượng</th>
                ${showCost ? '<th class="r cost-col">Tháp (Cost)</th>' : ''}
                <th class="r">Tháp (Cơ bản)</th>
                <th>Quạt (Motor/Pa)</th>
                <th class="r">Giá Quạt (CB)</th>
                <th>Dòng Bơm</th>
                <th class="r">Giá Bơm (CB)</th>
                <th class="r">Tủ điện (CB)</th>
                <th class="r">Stage (CB)</th>
                <th class="r">QL & TK (CB)</th>
                ${showCost ? '<th class="r cost-col">Tổng Cost</th>' : ''}
                <th class="r">Tổng Giá Cơ Bản</th>
              </tr>
            </thead>
            <tbody>
              ${filteredModels.map(m => `
                <tr>
                  <td><strong>${esc(m.product_line)}</strong></td>
                  <td><strong>${esc(m.model_code)}</strong></td>
                  <td class="r">${m.flow_rate}</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(m.tower_cost)}</td>` : ''}
                  <td class="r">${fmtVnd(m.tower_base)}</td>
                  <td>${esc(m.fan_model)} (${m.motor_kw}kW, ${m.fan_pressure_pa}Pa)</td>
                  <td class="r">${fmtVnd(m.fan_base)}</td>
                  <td>${esc(m.pump_model)}</td>
                  <td class="r">${fmtVnd(m.pump_base)}</td>
                  <td class="r">${fmtVnd(m.panel_base)}</td>
                  <td class="r">${fmtVnd(m.stage_base)}</td>
                  <td class="r">${fmtVnd(m.mgmt_base)}</td>
                  ${showCost ? `<td class="r cost-col"><strong>${fmtVnd(m.total_cost)}</strong></td>` : ''}
                  <td class="r"><strong style="color:var(--green)">${fmtVnd(m.total_base)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="row" style="align-items:center;">
            <h3 class="card-title" style="margin:0;">2. Danh Mục Thiết Bị Đo, Option, Quạt Lẻ, Bơm Lẻ & Dịch Vụ (${filteredEquip.length})</h3>
            <select onchange="App.setEquipFilterCat(this.value)">
              <option value="ALL" ${state.equipFilterCat === 'ALL' ? 'selected' : ''}>Tất cả nhóm (${state.equipment.length})</option>
              <option value="instrument" ${state.equipFilterCat === 'instrument' ? 'selected' : ''}>Thiết bị đo (Sheet 3 Excel)</option>
              <option value="option" ${state.equipFilterCat === 'option' ? 'selected' : ''}>Option Hệ tháp (pH, Bồn hóa chất, INV...)</option>
              <option value="fan" ${state.equipFilterCat === 'fan' ? 'selected' : ''}>Quạt hút lẻ (Exhaust Fan)</option>
              <option value="pump" ${state.equipFilterCat === 'pump' ? 'selected' : ''}>Bơm tuần hoàn lẻ (Pump)</option>
              <option value="service" ${state.equipFilterCat === 'service' ? 'selected' : ''}>Dịch vụ (Thiết kế, Vận chuyển, Lắp đặt...)</option>
            </select>
          </div>
          ${canManageCat ? `
            <button class="btn btn-sm btn-primary" onclick="document.getElementById('addEquipFormWrap').classList.toggle('hidden')">
              + Thêm Thiết Bị / Dịch Vụ Mới
            </button>
          ` : ''}
        </div>

        <div id="addEquipFormWrap" class="hidden" style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid var(--border);margin-bottom:14px;">
          <div class="grid-4" style="margin-bottom:10px;">
            <label class="field">Phân nhóm
              <select id="ne_cat">
                <option value="instrument">Thiết bị đo</option>
                <option value="option">Option Hệ tháp</option>
                <option value="fan">Quạt hút lẻ</option>
                <option value="pump">Bơm tuần hoàn lẻ</option>
                <option value="service">Dịch vụ</option>
              </select>
            </label>
            <label class="field">Tên tiếng Nhật <input type="text" id="ne_jp" placeholder="VD: 差圧計 / 排気ファン"></label>
            <label class="field">Tên tiếng Việt <input type="text" id="ne_vi" placeholder="Tên thiết bị / dịch vụ"></label>
            <label class="field">Thông số kỹ thuật <input type="text" id="ne_specs" placeholder="VD: 385 L/min x 10m x 2.2kW"></label>
            <label class="field">Đơn vị <input type="text" id="ne_unit" value="Pc/Cái"></label>
            <label class="field">Giá Cost (VND) <input type="number" id="ne_cost" value="0"></label>
            <label class="field">Giá Cơ Bản (VND) <input type="number" id="ne_base" value="0"></label>
            <label class="field">Xuất xứ / Ghi chú <input type="text" id="ne_note" value="KYOWA VN"></label>
          </div>
          <div class="row">
            <button class="btn btn-sm btn-primary" onclick="App.submitNewEquip()">Lưu Thiết Bị</button>
            <button class="btn btn-sm" onclick="document.getElementById('addEquipFormWrap').classList.add('hidden')">Đóng</button>
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nhóm</th>
                <th style="min-width:110px;">Tên tiếng Nhật</th>
                <th style="min-width:210px;">Tên Thiết Bị / Dịch Vụ (Tiếng Việt)</th>
                <th style="min-width:170px;">Thông số kỹ thuật</th>
                <th class="c">Đơn vị</th>
                ${showCost ? '<th class="r cost-col">Giá Cost (VND)</th>' : ''}
                <th class="r">Đơn giá cơ bản (VND)</th>
                <th style="min-width:135px;">Quy tắc gói cơ bản</th>
                <th style="min-width:95px;">Ghi chú</th>
                ${canManageCat ? '<th class="c">Xóa</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${filteredEquip.map(eq => `
                <tr>
                  <td><strong>${esc(eq.category.toUpperCase())}</strong></td>
                  <td>${esc(eq.name_jp || '—')}</td>
                  <td><strong>${esc(eq.name_vi)}</strong></td>
                  <td>${esc(eq.specs || '—')}</td>
                  <td class="c">${esc(eq.unit)}</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(eq.cost_price)}</td>` : ''}
                  <td class="r"><strong>${eq.base_price !== null ? fmtVnd(eq.base_price) : 'Chưa có giá'}</strong></td>
                  <td>
                    ${eq.is_default_included
        ? `<span class="tag-included">Đã gồm mặc định x${eq.default_qty}</span>`
        : `<span class="tag-optional">Cộng thêm theo dự án</span>`
      }
                  </td>
                  <td>${esc(eq.origin_note || '')}</td>
                  ${canManageCat ? `
                    <td class="c">
                      <button class="btn btn-sm btn-danger" onclick="App.deleteEquip(${eq.id})">🗑</button>
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }


  function setCatFilterProd(val) {
    state.catFilterProd = val;
    renderCatalogView();
  }

  function setEquipFilterCat(val) {
    state.equipFilterCat = val;
    renderCatalogView();
  }

  function showAddModelModal() {
    document.getElementById('addModelFormWrap')?.classList.toggle('hidden');
  }

  async function submitNewModel() {
    try {
      const fanParts = (document.getElementById('nm_fan').value || '#2 | 3.7 | 1100').split('|').map(s => s.trim());
      const tb = Number(document.getElementById('nm_tb').value || 0);
      const tc = Number(document.getElementById('nm_tc').value || Math.round(tb / 2));
      const fb = Number(document.getElementById('nm_fb').value || 0);
      const fc = Number(document.getElementById('nm_fc').value || Math.round(fb / 2));
      const pb = Number(document.getElementById('nm_pb').value || 0);
      const pc = Number(document.getElementById('nm_pc').value || Math.round(pb / 2));
      const pnb = Number(document.getElementById('nm_pnb').value || 189220000);
      const pnc = Math.round(pnb / 2);
      const sb = 120000000;
      const sc = 60000000;

      await api('/api/catalog/models', {
        method: 'POST',
        body: JSON.stringify({
          product_line: document.getElementById('nm_prod').value,
          model_code: document.getElementById('nm_code').value,
          flow_rate: Number(document.getElementById('nm_flow').value || 0),
          tower_cost: tc,
          tower_base: tb,
          fan_model: fanParts[0] || '#2',
          motor_kw: Number(fanParts[1] || 3.7),
          fan_pressure_pa: Number(fanParts[2] || 1100),
          fan_cost: fc,
          fan_base: fb,
          pump_model: document.getElementById('nm_pump').value,
          pump_cost: pc,
          pump_base: pb,
          panel_cost: pnc,
          panel_base: pnb,
          stage_cost: sc,
          stage_base: sb
        })
      });
      await loadBootstrap();
      renderAll();
      toast('Đã thêm Model tháp mới thành công!');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  async function submitNewEquip() {
    try {
      await api('/api/catalog/equipment', {
        method: 'POST',
        body: JSON.stringify({
          category: document.getElementById('ne_cat').value,
          name_jp: document.getElementById('ne_jp').value,
          name_vi: document.getElementById('ne_vi').value,
          specs: document.getElementById('ne_specs').value,
          unit: document.getElementById('ne_unit').value,
          cost_price: Number(document.getElementById('ne_cost').value || 0),
          base_price: Number(document.getElementById('ne_base').value || 0),
          origin_note: document.getElementById('ne_note').value
        })
      });
      await loadBootstrap();
      renderAll();
      toast('Đã thêm Thiết bị / Dịch vụ mới!');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  async function deleteEquip(id) {
    if (!confirm('Xóa mục này khỏi danh mục?')) return;
    try {
      await api(`/api/catalog/equipment/${id}`, { method: 'DELETE' });
      await loadBootstrap();
      renderCatalogView();
      toast('Đã xóa khỏi danh mục.');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  async function resyncDefaultExcel() {
    try {
      const res = await api('/api/catalog/import-excel', { method: 'POST', body: JSON.stringify({}) });
      await loadBootstrap();
      renderAll();
      toast(`Đã đồng bộ ${res.importedModelsCount} model và ${res.importedInstrumentsCount} thiết bị đo từ Data báo giá.xlsx!`);
    } catch (err) {
      toast('Lỗi đồng bộ Excel: ' + err.message);
    }
  }

  function uploadExcelCatalog(inputEl) {
    const file = inputEl.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        const res = await api('/api/catalog/import-excel', {
          method: 'POST',
          body: JSON.stringify({ fileBase64: base64 })
        });
        await loadBootstrap();
        renderAll();
        toast(`Import Excel thành công: ${res.importedModelsCount} model, ${res.importedInstrumentsCount} thiết bị đo!`);
      } catch (err) {
        toast('Lỗi Import Excel: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  // ===========================================================================
  // TAB 6: QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN CHI TIẾT (RBAC & AUDIT LOGS)
  // ===========================================================================
  async function loadAndRenderUsersTab() {
    try {
      const data = await api('/api/users');
      state.usersAdminList = data.users || [];
      state.auditLogs = data.audit_logs || [];
      state.rolePresets = data.role_presets || {};
      document.getElementById('usersCountBadge').textContent = state.usersAdminList.length;
      renderUsersTab();
    } catch (err) {
      toast('Lỗi tải danh sách tài khoản: ' + err.message);
    }
  }

  function renderUsersTab() {
    const container = document.getElementById('view-users');
    if (!container) return;

    const canManageUsers = state.permissions.canManageUsers;
    const users = state.usersAdminList;
    const adminCount = users.filter(u => u.role === 'admin' || u.role === 'manager').length;
    const saleCount = users.filter(u => u.role === 'sale' || u.role === 'sale_own').length;
    const lockedCount = users.filter(u => !u.is_active).length;

    const permShortLabels = {
      canViewCost: 'Xem Giá Cost',
      canApproveQuote: 'Duyệt BG',
      canManageCatalog: 'QL Danh mục & Excel',
      canManageUsers: 'QL Tài khoản',
      canViewAllQuotes: 'Xem tất cả BG',
      canDeleteQuote: 'Xóa BG',
      canExportExcel: 'Xuất Excel'
    };

    container.innerHTML = `
      <!-- KPI OVERVIEW -->
      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">Tổng số tài khoản hệ thống</div>
          <div class="kpi-val">${users.length} tài khoản</div>
        </div>
        <div class="kpi-box amber">
          <div class="kpi-label">Ban Giám Đốc / Quản Lý (Xem Cost & Duyệt)</div>
          <div class="kpi-val">${adminCount} tài khoản</div>
        </div>
        <div class="kpi-box green">
          <div class="kpi-label">Nhân viên Kinh Doanh (Sale)</div>
          <div class="kpi-val">${saleCount} tài khoản</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Tài khoản đang đăng nhập</div>
          <div class="kpi-val">${esc(state.currentUser?.full_name || '')}</div>
        </div>
      </div>

      <!-- DANH SÁCH TÀI KHOẢN & PHÂN QUYỀN -->
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Quản Lý Tài Khoản Người Dùng & Phân Quyền Chi Tiết (Granular RBAC)</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              Phân quyền chi tiết theo vai trò (Admin / Quản lý / Sale) hoặc tùy chỉnh từng quyền riêng biệt cho mỗi cá nhân.
            </p>
          </div>
          <div class="row">
            <button class="btn" onclick="App.openChangePasswordModal()">
              🔑 Đổi mật khẩu của tôi
            </button>
            ${canManageUsers ? `
              <button class="btn btn-primary" onclick="App.openUserPermModal(null)">
                + Tạo Tài Khoản Mới & Phân Quyền
              </button>
            ` : `
              <span class="status-pill status-pending_approval">Bạn đang ở chế độ Xem phân quyền (Chỉ Admin/Quản lý mới sửa được quyền)</span>
            `}
          </div>
        </div>

        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tài khoản (Username)</th>
                <th style="min-width:170px;">Họ và Tên / Liên hệ</th>
                <th style="min-width:140px;">Chức danh trên Báo giá</th>
                <th style="min-width:115px;">Vai trò chính</th>
                <th style="min-width:240px;">Các quyền được cấp (Chi tiết)</th>
                <th class="c">Số BG</th>
                <th class="c">Trạng thái</th>
                <th style="min-width:115px;">Đăng nhập cuối</th>
                <th class="c">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
      const p = u.permissions || {};
      const rClass = u.role === 'admin' ? 'admin' : u.role === 'manager' ? 'manager' : 'sale';
      const isSelf = u.id === state.currentUser?.id;
      return `
                  <tr style="${!u.is_active ? 'opacity:0.65;background:#f8fafc;' : ''}">
                    <td>
                      <strong style="color:var(--navy)">${esc(u.username)}</strong>
                      ${isSelf ? '<span class="tag-included" style="margin-left:4px">Bạn</span>' : ''}
                    </td>
                    <td>
                      <strong>${esc(u.full_name)}</strong>
                      <div style="font-size:12px;color:var(--muted)">📞 ${esc(u.phone || '—')} · ✉️ ${esc(u.email || '—')}</div>
                    </td>
                    <td>
                      <div>${esc(u.title_vi || '—')}</div>
                      <div style="font-size:11.5px;color:var(--muted)">${esc(u.title_jp || '')}</div>
                    </td>
                    <td>
                      <span class="role-badge ${rClass}">${esc(ROLE_LABELS[u.role] || u.role)}</span>
                    </td>
                    <td style="max-width: 340px;">
                      ${Object.keys(permShortLabels).map(k => `
                        <span class="perm-tag ${p[k] ? 'on' : 'off'}">
                          ${p[k] ? '✓' : '✕'} ${permShortLabels[k]}
                        </span>
                      `).join('')}
                    </td>
                    <td class="c"><strong>${u.quotes_count || 0}</strong></td>
                    <td class="c">
                      ${u.is_active
          ? '<span class="status-pill status-approved">Hoạt động</span>'
          : '<span class="status-pill status-rejected">Đã khóa</span>'}
                    </td>
                    <td style="font-size:12px;color:var(--muted)">
                      ${esc(u.last_login || 'Chưa ĐN')}
                    </td>
                    <td class="c">
                      <div class="row" style="justify-content:center;gap:4px;flex-wrap:nowrap;">
                        ${canManageUsers ? `
                          <button class="btn btn-sm btn-navy" onclick="App.openUserPermModal(${u.id})">
                            ✏️ Sửa & Phân quyền
                          </button>
                          ${!isSelf ? `
                            <button class="btn btn-sm" onclick="App.toggleUserActive(${u.id}, ${u.is_active ? 0 : 1})"
                                    title="${u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}">
                              ${u.is_active ? '🔒 Khóa' : '🔓 Mở'}
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="App.deleteUserAccount(${u.id})">
                              🗑
                            </button>
                          ` : ''}
                        ` : '<span style="font-size:12px;color:var(--muted)">—</span>'}
                      </div>
                    </td>
                  </tr>
                `;
    }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- MA TRẬN PHÂN QUYỀN & NHẬT KÝ HOẠT ĐỘNG -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Ma Trận Phân Quyền Mặc Định Theo Vai Trò</h3>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Quyền hạn chức năng</th>
                  <th class="c">Admin / GĐ</th>
                  <th class="c">Quản lý KD</th>
                  <th class="c">NV Sale</th>
                  <th class="c">Sale (Cá nhân)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tra cứu cấu hình & Lập báo giá</td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">✅</td><td class="c">✅</td>
                </tr>
                <tr>
                  <td><strong>Xem Giá Cost nội bộ & Lợi nhuận</strong></td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">❌</td><td class="c">❌</td>
                </tr>
                <tr>
                  <td><strong>Phê duyệt báo giá (Duyệt giá báo)</strong></td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">❌</td><td class="c">❌</td>
                </tr>
                <tr>
                  <td><strong>Quản lý Danh mục & Import Excel</strong></td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">❌</td><td class="c">❌</td>
                </tr>
                <tr>
                  <td>Xem Báo giá của tất cả nhân viên</td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">✅</td><td class="c">❌ (Chỉ cá nhân)</td>
                </tr>
                <tr>
                  <td>Xóa Hồ sơ Báo giá</td>
                  <td class="c">✅</td><td class="c">✅</td><td class="c">❌</td><td class="c">❌</td>
                </tr>
                <tr>
                  <td><strong>Quản lý Tài khoản & Phân quyền</strong></td>
                  <td class="c">✅</td><td class="c">Tùy cấp</td><td class="c">❌</td><td class="c">❌</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Nhật Ký Hoạt Động & Bảo Mật Gần Đây (Audit Logs)</h3>
            <span style="font-size:12px;color:var(--muted)">40 hoạt động gần nhất</span>
          </div>
          <div class="table-wrap" style="max-height: 290px; overflow-y: auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Tài khoản</th>
                  <th>Hành động</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                ${state.auditLogs.map(log => `
                  <tr>
                    <td style="font-size:11.5px;white-space:nowrap;color:var(--muted)">${esc(log.created_at)}</td>
                    <td><strong>${esc(log.username)}</strong></td>
                    <td><span class="tag-included">${esc(log.action)}</span></td>
                    <td style="font-size:12.5px;">${esc(log.details)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }


  function openUserPermModal(userId) {
    const existing = userId ? state.usersAdminList.find(u => u.id === userId) : null;
    state.editingUser = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: null,
      username: '',
      password: '123456',
      full_name: '',
      email: '',
      phone: '',
      role: 'sale',
      title_vi: 'Nhân viên Kinh doanh',
      title_jp: '担当者',
      is_active: 1,
      permissions: {
        ...(state.rolePresets?.sale || {
          canViewCost: false,
          canApproveQuote: false,
          canManageCatalog: false,
          canManageUsers: false,
          canViewAllQuotes: true,
          canDeleteQuote: false,
          canExportExcel: false
        })
      }
    };

    renderUserPermModalContent();
    document.getElementById('userPermModal')?.classList.remove('hidden');
  }

  function closeUserPermModal() {
    document.getElementById('userPermModal')?.classList.add('hidden');
  }

  function renderUserPermModalContent() {
    const u = state.editingUser;
    if (!u) return;
    const body = document.getElementById('userPermModalBody');
    if (!body) return;

    const isEdit = Boolean(u.id);
    const p = u.permissions || {};

    body.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">
          ${isEdit ? `✏️ Chỉnh Sửa Tài Khoản & Phân Quyền: ${esc(u.full_name)} (${esc(u.username)})` : '➕ Tạo Tài Khoản Người Dùng Mới & Phân Quyền'}
        </h3>
        <button class="btn btn-sm" onclick="App.closeUserPermModal()">✕</button>
      </div>

      <form onsubmit="App.submitUserPermForm(event)">
        <div class="grid-2" style="gap: 12px; margin-bottom: 14px;">
          <label class="field">
            Tên đăng nhập (Username) *
            <input type="text" id="uf_username" value="${esc(u.username)}" ${isEdit ? 'disabled style="background:#f1f5f9"' : 'required'} placeholder="VD: sale_nam">
          </label>
          <label class="field">
            ${isEdit ? 'Đặt lại mật khẩu mới (Để trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo *'}
            <input type="text" id="uf_password" value="${isEdit ? '' : esc(u.password || '123456')}" ${isEdit ? '' : 'required'} placeholder="${isEdit ? 'Nhập mật khẩu mới nếu muốn đổi...' : 'Mặc định: 123456'}">
          </label>
          <label class="field">
            Họ và Tên nhân sự *
            <input type="text" id="uf_fullname" value="${esc(u.full_name)}" required placeholder="VD: Mr Nguyễn Văn Nam">
          </label>
          <label class="field">
            Số điện thoại (In trên báo giá)
            <input type="text" id="uf_phone" value="${esc(u.phone || '')}" placeholder="VD: 0908-xxx-xxx">
          </label>
          <label class="field">
            Email
            <input type="email" id="uf_email" value="${esc(u.email || '')}" placeholder="nam@kyowakako.vn">
          </label>
          <label class="field">
            Trạng thái tài khoản
            <select id="uf_active">
              <option value="1" ${u.is_active ? 'selected' : ''}>✅ Đang hoạt động (Cho phép đăng nhập)</option>
              <option value="0" ${!u.is_active ? 'selected' : ''}>🔒 Khóa tài khoản (Chặn đăng nhập)</option>
            </select>
          </label>
          <label class="field">
            Chức danh Tiếng Việt
            <input type="text" id="uf_title_vi" value="${esc(u.title_vi || '')}" placeholder="VD: Nhân viên Kinh doanh / Người duyệt">
          </label>
          <label class="field">
            Chức danh Tiếng Nhật (承認者 / 担当者)
            <input type="text" id="uf_title_jp" value="${esc(u.title_jp || '')}" placeholder="VD: 担当者 hoặc 承認者">
          </label>
        </div>

        <div style="background: var(--navy-light); padding: 12px; border-radius: 8px; margin-bottom: 14px;">
          <label class="field">
            Chọn Vai Trò Mẫu (Tự động áp dụng bộ quyền chuẩn bên dưới):
            <select id="uf_role" onchange="App.onRolePresetSelect(this.value)" style="font-weight:700;">
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin / Ban Giám Đốc (Toàn quyền hệ thống)</option>
              <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Quản lý Kinh doanh (Xem Giá Cost, Duyệt BG, Quản lý danh mục)</option>
              <option value="sale" ${u.role === 'sale' ? 'selected' : ''}>Nhân viên Kinh doanh - Sale (Ẩn Giá Cost, Lập & Xuất BG)</option>
              <option value="sale_own" ${u.role === 'sale_own' ? 'selected' : ''}>Nhân viên Sale giới hạn (Ẩn Giá Cost, Chỉ xem BG cá nhân)</option>
            </select>
          </label>
        </div>

        <strong style="color:var(--navy); display:block; margin-bottom:8px;">
          Cấu Hình Từng Quyền Hạn Chi Tiết (Có thể bật/tắt tùy chỉnh riêng cho tài khoản này):
        </strong>
        <div class="grid-2" style="gap: 8px; margin-bottom: 18px;">
          ${PERM_DEFINITIONS.map(pd => `
            <label class="perm-check-card">
              <input type="checkbox" id="perm_${pd.key}" ${p[pd.key] ? 'checked' : ''}
                     onchange="App.onToggleUserPermCheck('${pd.key}', this.checked)">
              <div>
                <div style="font-weight:700; color:var(--navy-dark); font-size:13px;">${esc(pd.label)}</div>
                <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${esc(pd.desc)}</div>
              </div>
            </label>
          `).join('')}
        </div>

        <div class="row" style="justify-content: flex-end;">
          <button type="button" class="btn" onclick="App.closeUserPermModal()">Hủy</button>
          <button type="submit" class="btn btn-primary">
            💾 ${isEdit ? 'Lưu Cập Nhật & Phân Quyền' : 'Tạo Tài Khoản Mới'}
          </button>
        </div>
      </form>
    `;
  }

  function onRolePresetSelect(role) {
    if (!state.editingUser) return;
    // Sync form inputs before re-rendering checkboxes
    syncUserModalInputsToState();
    state.editingUser.role = role;
    const preset = state.rolePresets?.[role];
    if (preset) {
      state.editingUser.permissions = { ...preset };
    }
    if (role === 'admin') {
      state.editingUser.title_vi = 'Ban Giám Đốc / Người duyệt';
      state.editingUser.title_jp = '承認者 (Admin)';
    } else if (role === 'manager') {
      state.editingUser.title_vi = 'Quản lý Kinh doanh / Người duyệt';
      state.editingUser.title_jp = '営業部・承認者';
    } else {
      state.editingUser.title_vi = 'Nhân viên Kinh doanh';
      state.editingUser.title_jp = '担当者';
    }
    renderUserPermModalContent();
  }

  function onToggleUserPermCheck(key, checked) {
    if (!state.editingUser) return;
    state.editingUser.permissions = state.editingUser.permissions || {};
    state.editingUser.permissions[key] = Boolean(checked);
  }

  function syncUserModalInputsToState() {
    const u = state.editingUser;
    if (!u) return;
    const un = document.getElementById('uf_username');
    if (un && !u.id) u.username = un.value.trim();
    const pw = document.getElementById('uf_password');
    if (pw) u.password = pw.value;
    const fn = document.getElementById('uf_fullname');
    if (fn) u.full_name = fn.value.trim();
    const ph = document.getElementById('uf_phone');
    if (ph) u.phone = ph.value.trim();
    const em = document.getElementById('uf_email');
    if (em) u.email = em.value.trim();
    const ac = document.getElementById('uf_active');
    if (ac) u.is_active = Number(ac.value);
    const tv = document.getElementById('uf_title_vi');
    if (tv) u.title_vi = tv.value.trim();
    const tj = document.getElementById('uf_title_jp');
    if (tj) u.title_jp = tj.value.trim();
    const rl = document.getElementById('uf_role');
    if (rl) u.role = rl.value;
  }

  async function submitUserPermForm(e) {
    e.preventDefault();
    syncUserModalInputsToState();
    const u = state.editingUser;
    if (!u) return;

    try {
      if (u.id) {
        await api(`/api/users/${u.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            full_name: u.full_name,
            email: u.email,
            phone: u.phone,
            role: u.role,
            title_vi: u.title_vi,
            title_jp: u.title_jp,
            is_active: u.is_active,
            permissions: u.permissions,
            newPassword: u.password || ''
          })
        });
        toast(`Đã cập nhật tài khoản & phân quyền cho ${u.full_name}!`);
      } else {
        await api('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            username: u.username,
            password: u.password || '123456',
            full_name: u.full_name,
            email: u.email,
            phone: u.phone,
            role: u.role,
            title_vi: u.title_vi,
            title_jp: u.title_jp,
            is_active: u.is_active,
            permissions: u.permissions
          })
        });
        toast(`Đã tạo tài khoản ${u.username} thành công!`);
      }
      closeUserPermModal();
      await loadBootstrap();
      await loadAndRenderUsersTab();
      renderAll();
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  async function toggleUserActive(id, nextActive) {
    const target = state.usersAdminList.find(u => u.id === id);
    if (!target) return;
    try {
      await api(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...target,
          is_active: nextActive
        })
      });
      await loadAndRenderUsersTab();
      toast(nextActive ? `Đã mở khóa tài khoản ${target.username}` : `Đã khóa tài khoản ${target.username}`);
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  async function deleteUserAccount(id) {
    const target = state.usersAdminList.find(u => u.id === id);
    if (!target) return;
    if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${target.full_name}" (${target.username})?`)) return;
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      await loadBootstrap();
      await loadAndRenderUsersTab();
      toast(`Đã xóa tài khoản ${target.username}.`);
    } catch (err) {
      toast('Lỗi xóa tài khoản: ' + err.message);
    }
  }

  function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    document.getElementById('userDropdownMenu')?.classList.toggle('hidden');
  }

  function closeUserDropdown() {
    document.getElementById('userDropdownMenu')?.classList.add('hidden');
  }

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('userMenuWrap');
    if (wrap && !wrap.contains(e.target)) {
      closeUserDropdown();
    }
  });

  function toggleMobileA4Fit() {
    state.fitMobileA4 = state.fitMobileA4 === false ? true : false;
    renderPrintView();
  }

  window.addEventListener('resize', () => {
    if (state.activeTab === 'print') {
      renderPrintView();
    }
  });

  document.addEventListener('DOMContentLoaded', init);

  return {
    submitLogin,
    toggleLoginPassVisibility,
    logout,
    toggleUserDropdown,
    closeUserDropdown,
    openChangePasswordModal,
    closeChangePasswordModal,
    submitChangePassword,
    closeConfirmModal,
    executeConfirmedAction,
    toggleMobileA4Fit,
    showTab,
    setF1Product,
    setF1Model,
    setF1FlowSearch,
    setF1Project,
    selectRecommendedModel,
    startDetailedFromF1,
    updateQField,
    onSelectApproverUser,
    updateTermField,
    updatePaymentLines,
    updateBankCombined,
    applyTermsPreset,
    handleMgmtFeeModeChange,
    onMgmtFeePercentInput,
    onMgmtFeePercentBlur,
    setQuickMgmtFeePercent,
    quickAddEquipment,
    updateSectionField,
    addSection,
    removeSection,
    addBlankItem,
    removeItem,
    updateItemField,
    updateItemPriceCalc,
    handleItemPriceBlur,
    applyBulkFactorToAll,
    handleBulkFactorBlur,
    setQuickBulkFactor,
    onVatPercentInput,
    setQuickVatPercent,
    addSubLine,
    updateSubLine,
    removeSubLine,
    createBlankQuoteTemplate,
    saveActiveQuotation,
    saveAndSubmitForApproval,
    loadQuotationById,
    createNewRevision,
    changeQuoteStatus,
    exportActiveQuoteToPdf,
    exportActiveQuoteToWord,
    exportActiveQuoteToExcel,
    setQuoteFilter,
    openQuoteToTab,
    deleteQuote,
    setCatFilterProd,
    setEquipFilterCat,
    showAddModelModal,
    submitNewModel,
    submitNewEquip,
    deleteEquip,
    resyncDefaultExcel,
    uploadExcelCatalog,
    renderFlow2,
    openUserPermModal,
    closeUserPermModal,
    onRolePresetSelect,
    onToggleUserPermCheck,
    submitUserPermForm,
    toggleUserActive,
    deleteUserAccount
  };
})();
