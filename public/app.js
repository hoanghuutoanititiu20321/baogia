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
      customerName: '',
      excludedComponents: {},
      excludedDefaultInsts: {},
      specDetailLevel: 'basic',
      mgmtFeePercent: 5,
      vatPercent: 8,
      noteInstallTrans: 'Giá trên chưa bao gồm chi phí lắp đặt và vận chuyển.'
    },

    // Flow 2 active quotation state & multi-area / grouping UI helpers
    activeQuote: null,
    revisionsList: [],
    quickAddTargetSecIdx: 0,
    quickTowerProdLine: 'FSD 0.5',
    quickTowerModelCode: '55',
    quickTowerInsertMode: 'itemized',
    quickAddSelectedIds: {
      quickAddInstSelect: '',
      quickAddFanPumpSelect: '',
      quickAddServiceSelect: ''
    },
    selectedGroupItemKeys: [],
    customGroupNameInput: '',

    // Catalog & filter state
    catFilterProd: 'ALL',
    catModelSearch: '',
    catModelSort: 'default',
    equipFilterCat: 'ALL',
    equipSearch: '',
    equipSort: 'default',
    quoteSearch: '',
    quoteStatusFilter: 'ALL',

    // Editing user modal state
    editingUser: null,

    // Print / Export template & center watermark preferences
    printTemplate: (() => {
      try { return JSON.parse(localStorage.getItem('kkvn_print_prefs') || '{}').printTemplate || 'classic'; } catch { return 'classic'; }
    })(),
    printWatermark: (() => {
      try {
        const p = JSON.parse(localStorage.getItem('kkvn_print_prefs') || '{}');
        return p.printWatermark !== undefined ? Boolean(p.printWatermark) : true;
      } catch { return true; }
    })(),
    printWatermarkOpacity: (() => {
      try { return Number(JSON.parse(localStorage.getItem('kkvn_print_prefs') || '{}').printWatermarkOpacity || 0.10); } catch { return 0.10; }
    })(),
    printWatermarkSize: (() => {
      try { return Number(JSON.parse(localStorage.getItem('kkvn_print_prefs') || '{}').printWatermarkSize || 490); } catch { return 490; }
    })(),
    printPickerOpen: false,
    watermarkDataUrlCache: {},

    // Notifications state
    notifications: [],
    unreadNotifications: 0,
    lastSeenNotifId: 0,
    notifPollTimer: null
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

  // ===========================================================================
  // SHARED CONFIG, SPEC LEVEL (MÃ 11) & COMPONENT BREAKDOWN HELPERS (MÃ 03-05)
  // ===========================================================================
  function formatNumberDots(numStr) {
    const clean = String(numStr || '').replace(/,/g, '').trim();
    const n = Number(clean);
    if (!Number.isFinite(n)) return numStr;
    if (Math.abs(n) >= 1000 && Number.isInteger(n)) {
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    return String(numStr).trim();
  }

  function formatSpecForLevel(specText, level = 'detailed') {
    const raw = String(specText || '').trim();
    if (!raw || level !== 'basic') return raw;

    // Quạt hút: "2,100 CMH   750 Pa   1.5 Kw, 3phase ,380V,50Hz, 4P,IE3" -> "2.100 CMH, 750 Pa"
    const flowMatch = raw.match(/([\d.,]+)\s*(CMH|CMM|m³\/min|m3\/min)/i);
    const paMatch = raw.match(/([\d.,]+)\s*Pa\b/i);
    if (flowMatch && paMatch) {
      return `${formatNumberDots(flowMatch[1])} ${flowMatch[2].toUpperCase()}, ${formatNumberDots(paMatch[1])} Pa`;
    }

    // Bơm tuần hoàn: "385 L/min x 10 m x 2.2 kW" -> "385 L/min x 10 m"
    if (/L\/min/i.test(raw) && /\bkW\b/i.test(raw)) {
      return raw
        .replace(/\s*[x×]\s*[\d.,]+\s*kW\b[^,;)]*/ig, '')
        .replace(/\s*,\s*3\s*pha(se)?.*$/i, '')
        .trim();
    }

    // Tổng quát: ẩn thông số điện/động cơ chi tiết (kW, 3phase/3 pha, 380V, 50Hz, 4P, IE3...)
    const stripped = raw
      .replace(/\bMotor\s*[\d.,]+\s*kW\b/ig, '')
      .replace(/[\d.,]+\s*kW\b/ig, '')
      .replace(/\b[13]\s*pha(se)?\b/ig, '')
      .replace(/\b\d{3}\s*V\b/ig, '')
      .replace(/\b[56]0\s*Hz\b/ig, '')
      .replace(/\b[2468]P\b/g, '')
      .replace(/\bIE[1-4]\b/ig, '')
      .replace(/\(\s*[,·\s-]*\)/g, '')
      .replace(/[,·]+\s*[,·]+/g, ', ')
      .replace(/^[\s,·-]+|[\s,·-]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return stripped || raw;
  }

  function getDefaultInstrumentsCatalog() {
    return (state.equipment || []).filter(e => e.category === 'instrument' && e.is_default_included);
  }

  function computeDefaultInstDeduction(excludedDefaultInsts = {}) {
    const defaults = getDefaultInstrumentsCatalog();
    let deductCost = 0;
    let deductBase = 0;
    const excludedNames = [];
    defaults.forEach(d => {
      if (excludedDefaultInsts && excludedDefaultInsts[d.id]) {
        const qty = Math.max(1, Number(d.default_qty || 1));
        const base = Number(d.base_price || 0) * qty;
        const cost = (d.cost_price !== null && d.cost_price !== undefined)
          ? Number(d.cost_price) * qty
          : Math.round(base / 2);
        deductBase += base;
        deductCost += cost;
        excludedNames.push(d.name_vi);
      }
    });
    return { deductCost, deductBase, excludedNames, totalCount: defaults.length };
  }

  function buildTowerComponentBreakdown(m, excludedComps = {}, excludedDefaultInsts = {}) {
    if (!m) return null;
    const instDed = computeDefaultInstDeduction(excludedDefaultInsts);
    const towerBaseFull = Number(m.tower_base || 0);
    const towerCostFull = (m.tower_cost !== null && m.tower_cost !== undefined) ? Number(m.tower_cost) : null;
    return {
      tower: {
        key: 'tower',
        label: `Hệ tháp (${m.product_line} - M${m.model_code})`,
        shortLabel: 'Hệ tháp',
        base: Math.max(0, towerBaseFull - instDed.deductBase),
        cost: towerCostFull !== null ? Math.max(0, towerCostFull - instDed.deductCost) : null,
        base_full: towerBaseFull,
        cost_full: towerCostFull,
        included: !excludedComps.tower
      },
      fan: {
        key: 'fan',
        label: `Quạt hút (${m.fan_model || ''})`,
        shortLabel: 'Quạt hút',
        base: Number(m.fan_base || 0),
        cost: (m.fan_cost !== null && m.fan_cost !== undefined) ? Number(m.fan_cost) : null,
        included: !excludedComps.fan
      },
      pump: {
        key: 'pump',
        label: `Bơm tuần hoàn (${m.pump_model || ''})`,
        shortLabel: 'Bơm tuần hoàn',
        base: Number(m.pump_base || 0),
        cost: (m.pump_cost !== null && m.pump_cost !== undefined) ? Number(m.pump_cost) : null,
        included: !excludedComps.pump
      },
      panel: {
        key: 'panel',
        label: 'Tủ điện điều khiển',
        shortLabel: 'Tủ điện',
        base: Number(m.panel_base || 0),
        cost: (m.panel_cost !== null && m.panel_cost !== undefined) ? Number(m.panel_cost) : null,
        included: !excludedComps.panel
      },
      stage: {
        key: 'stage',
        label: 'Hệ sắt Stage & Ống khói',
        shortLabel: 'Hệ sắt Stage',
        base: Number(m.stage_base || 0),
        cost: (m.stage_cost !== null && m.stage_cost !== undefined) ? Number(m.stage_cost) : null,
        included: !excludedComps.stage
      }
    };
  }

  function buildTowerSubLinesFromModel(m, excludedComps = {}, excludedDefaultInsts = {}) {
    if (!m) return [];
    const defaults = getDefaultInstrumentsCatalog();
    const lines = [
      { text: '込む Bao gồm :', right_text: '', remark: '', is_header: true }
    ];
    if (!excludedComps.stage) {
      lines.push({
        text: `- Stage,Ladder, 煙thang,sàn thao tác, ống khói: ${m.specs?.stack_dim || 'φ 350 x 850 H'}`,
        right_text: '',
        remark: '',
        component_key: 'stage'
      });
    }
    if (!excludedComps.tower) {
      const keptInsts = defaults.filter(d => !excludedDefaultInsts[d.id]);
      if (keptInsts.length > 0) {
        lines.push({ text: '- 計装品Thiết bị đi kèm mặc định', right_text: 'x 1 set', remark: '', component_key: 'tower' });
        keptInsts.forEach(d => {
          lines.push({
            text: `   + ${d.name_jp ? d.name_jp + ' ' : ''}${d.name_vi} (x${d.default_qty || 1} - đã gồm)`,
            right_text: '',
            remark: '',
            is_default_inst: true,
            default_inst_id: d.id,
            component_key: 'tower'
          });
        });
      }
    }
    if (!excludedComps.fan) {
      lines.push({
        text: `- 排気ファンQuạt hút ${m.fan_model}`,
        right_text: 'x 1 set',
        remark: 'KYOWA',
        component_key: 'fan'
      });
      lines.push({
        text: `   ${m.specs?.fan_spec || `${fmtVnd(m.flow_cmh)} CMH   ${m.fan_pressure_pa} Pa   ${m.motor_kw} Kw, 3phase ,380V,50Hz, 4P,IE3`}`,
        right_text: '',
        remark: 'Motor Toshiba VN',
        is_spec_box: true,
        component_key: 'fan'
      });
    }
    if (!excludedComps.pump) {
      lines.push({
        text: `- 循環ポンプ Bơm tuần hoàn   ${m.pump_model}`,
        right_text: 'x 1 set',
        remark: 'KYOWA JP',
        component_key: 'pump'
      });
      lines.push({
        text: `   ${m.specs?.pump_spec || m.pump_model}`,
        right_text: '',
        remark: '',
        is_spec_box: true,
        component_key: 'pump'
      });
    }
    if (!excludedComps.panel) {
      lines.push({
        text: '- 制御盤(INV)・配線Tủ điều khiển + Đấu dây 2m',
        right_text: 'x 1 set',
        remark: '',
        component_key: 'panel'
      });
    }
    return lines;
  }

  function hydrateTowerBundleBreakdown(it, q, sec) {
    if (!it || it.item_type !== 'tower_bundle') return null;
    if (it.component_breakdown && typeof it.component_breakdown === 'object') {
      return it.component_breakdown;
    }
    const refProd = it.model_ref?.product_line || sec?.model_ref?.product_line || q?.selected_product_line;
    const refCode = it.model_ref?.model_code || sec?.model_ref?.model_code || q?.selected_model_code;
    if (!refProd || !refCode) return null;
    const m = (state.models || []).find(x => x.product_line === refProd && String(x.model_code) === String(refCode));
    if (!m) return null;
    it.model_ref = { product_line: m.product_line, model_code: String(m.model_code) };
    it.component_breakdown = buildTowerComponentBreakdown(m);
    // Gắn component_key lên sub_lines cũ để khi xóa dòng con vẫn tự tính lại giá (Mã 04)
    (it.sub_lines || []).forEach(sl => {
      if (sl.component_key) return;
      const txt = String(sl.text || '').toLowerCase();
      if (txt.includes('stage') || txt.includes('ống khói') || txt.includes('sàn thao tác')) sl.component_key = 'stage';
      else if (txt.includes('quạt') || txt.includes('排気ファン') || (sl.is_spec_box && (txt.includes('cmh') || txt.includes('pa')))) sl.component_key = 'fan';
      else if (txt.includes('bơm') || txt.includes('循環ポンプ') || (sl.is_spec_box && txt.includes('l/min'))) sl.component_key = 'pump';
      else if (txt.includes('tủ điều khiển') || txt.includes('tủ điện') || txt.includes('制御盤')) sl.component_key = 'panel';
    });
    return it.component_breakdown;
  }

  function recomputeTowerBundleFromBreakdown(it) {
    if (!it || !it.component_breakdown) return;
    let sumBase = 0;
    let sumCost = 0;
    let hasCost = false;
    Object.values(it.component_breakdown).forEach(comp => {
      if (comp && comp.included !== false) {
        sumBase += Number(comp.base || 0);
        if (comp.cost !== null && comp.cost !== undefined) {
          sumCost += Number(comp.cost || 0);
          hasCost = true;
        }
      }
    });
    it.base_price = Math.max(0, Math.round(sumBase));
    if (hasCost) {
      it.cost_price = Math.max(0, Math.round(sumCost));
    }
    it._keepExactUnitPrice = false;
    it.unit_price = Math.max(0, Math.round(it.base_price * Number(it.adjustment ?? 1)));
    it.total_price = Math.round(it.unit_price * Math.max(1, Number(it.quantity || 1)));
  }

  function sectionHasTower(sec) {
    if (!sec) return false;
    if (sec.model_ref && sec.model_ref.model_code) return true;
    return (sec.items || []).some(it =>
      it.included !== false &&
      (it.item_type === 'tower' || it.item_type === 'tower_bundle')
    );
  }

  function getSectionDefaultInstInfo(sec) {
    const defaults = getDefaultInstrumentsCatalog();
    const hasTower = sectionHasTower(sec);
    const excludedMap = sec?.excluded_default_insts || {};
    const optionCount = (sec?.items || []).filter(it =>
      it.included !== false &&
      (it.item_type === 'option' || it.item_type === 'instrument')
    ).length;
    return {
      hasTower,
      defaults: defaults.map(d => ({
        ...d,
        isIncluded: !excludedMap[d.id]
      })),
      optionCount
    };
  }

  function computeF1Totals(cur) {
    if (!cur) {
      return {
        prodCost: 0, prodBase: 0, mgmtPct: 5, mgmtCost: 0, mgmtBase: 0,
        subtotalCost: 0, subtotalBase: 0, vatPct: 8, vatAmount: 0, totalAfterTax: 0,
        selectedCount: 0, instDeductCost: 0, instDeductBase: 0, breakdown: null
      };
    }
    const excl = state.f1.excludedComponents || {};
    const exclInsts = state.f1.excludedDefaultInsts || {};
    const instDed = excl.tower ? { deductCost: 0, deductBase: 0 } : computeDefaultInstDeduction(exclInsts);
    const breakdown = buildTowerComponentBreakdown(cur, excl, exclInsts);

    let prodCost = 0;
    let prodBase = 0;
    let selectedCount = 0;
    ['tower', 'fan', 'pump', 'panel', 'stage'].forEach(k => {
      const c = breakdown[k];
      if (c && c.included) {
        selectedCount++;
        prodBase += Number(c.base || 0);
        if (c.cost !== null && c.cost !== undefined) {
          prodCost += Number(c.cost || 0);
        }
      }
    });

    const mgmtPct = Math.min(100, Math.max(0, Number(state.f1.mgmtFeePercent ?? 5)));
    const mgmtBase = Math.round(prodBase * (mgmtPct / 100));
    const mgmtCost = Math.round(prodCost * (mgmtPct / 100));
    const subtotalBase = prodBase + mgmtBase;
    const subtotalCost = prodCost + mgmtCost;
    const vatPct = Math.min(100, Math.max(0, Number(state.f1.vatPercent ?? 8)));
    const vatAmount = Math.round(subtotalBase * (vatPct / 100));
    const totalAfterTax = subtotalBase + vatAmount;

    return {
      prodCost, prodBase, mgmtPct, mgmtCost, mgmtBase,
      subtotalCost, subtotalBase, vatPct, vatAmount, totalAfterTax,
      selectedCount, instDeductCost: instDed.deductCost, instDeductBase: instDed.deductBase,
      breakdown
    };
  }

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
      startNotifPolling();
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
      startNotifPolling();
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
      stopNotifPolling();
      state.authToken = '';
      state.currentUser = null;
      state.notifications = [];
      state.unreadNotifications = 0;
      state.lastSeenNotifId = 0;
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
    state.notifications = data.notifications || [];
    state.unreadNotifications = Number(data.unread_notifications || 0);
    if (state.notifications.length > 0 && state.lastSeenNotifId === 0) {
      state.lastSeenNotifId = state.notifications[0].id;
    }
    renderNotifications();

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
    const defaultInstruments = getDefaultInstrumentsCatalog();
    const specLevel = state.f1.specDetailLevel || 'basic';
    const excl = state.f1.excludedComponents || {};
    const exclInsts = state.f1.excludedDefaultInsts || {};
    const f1Calc = computeF1Totals(cur);
    const anyExcluded = Object.values(excl).some(Boolean) || Object.values(exclInsts).some(Boolean);

    const fanDetailText = cur
      ? (specLevel === 'basic'
        ? `Model ${cur.fan_model} · ${fmtVnd(cur.flow_cmh)} CMH, ${fmtVnd(cur.fan_pressure_pa)} Pa`
        : `Model ${cur.fan_model} · ${fmtVnd(cur.flow_cmh)} CMH, ${fmtVnd(cur.fan_pressure_pa)} Pa · Motor ${cur.motor_kw} kW (3phase, 380V, 50Hz, 4P, IE3)`)
      : '';
    const pumpSpecText = cur ? formatSpecForLevel(cur.specs?.pump_spec || cur.pump_model || '', specLevel) : '';

    const coreLines = cur ? [
      {
        key: 'tower',
        name: '1. Hệ tháp xử lý khí (FRP)',
        detail: `Dòng ${cur.product_line} – Model ${cur.model_code} · Lưu lượng ${cur.flow_rate} m³/min (${fmtVnd(cur.flow_cmh)} CMH)${cur.specs?.tower_dim ? ` · KT tham khảo: ${cur.specs.tower_dim} (FRP)` : ''}${f1Calc.instDeductBase > 0 && !excl.tower ? ` · [Đã trừ TB đo bỏ chọn: -${fmtVnd(f1Calc.instDeductBase)} đ]` : ''}`,
        cost: f1Calc.breakdown.tower.cost,
        base: f1Calc.breakdown.tower.base,
        included: !excl.tower
      },
      {
        key: 'fan',
        name: '2. Quạt hút (Exhaust Fan)',
        detail: fanDetailText,
        cost: cur.fan_cost,
        base: cur.fan_base,
        included: !excl.fan
      },
      {
        key: 'pump',
        name: '3. Bơm tuần hoàn (Circulation Pump)',
        detail: `Model ${cur.pump_model}${pumpSpecText && pumpSpecText !== cur.pump_model ? ` (${pumpSpecText})` : ''}`,
        cost: cur.pump_cost,
        base: cur.pump_base,
        included: !excl.pump
      },
      {
        key: 'panel',
        name: '4. Tủ điện (Control Panel)',
        detail: 'Tủ điều khiển tiêu chuẩn, đấu dây',
        cost: cur.panel_cost,
        base: cur.panel_base,
        included: !excl.panel
      },
      {
        key: 'stage',
        name: '5. Hệ sắt Stage',
        detail: `Stage, ladder (cầu thang), sàn thao tác, ống khói (${cur.specs?.stack_dim || ''})`,
        cost: cur.stage_cost,
        base: cur.stage_base,
        included: !excl.stage
      }
    ] : [];

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Tra Cứu Cấu Hình & Báo Giá Cơ Bản</h2>
          <div class="row">
            <button class="btn btn-primary" onclick="App.startDetailedFromF1('basic_quote')" title="Xuất báo giá cơ bản 1 giá tổng, ẩn đơn giá lẻ & rút gọn thông số điện">
              📋 Tạo Báo Giá Cơ Bản →
            </button>
            <button class="btn btn-navy" onclick="App.startDetailedFromF1('tower_bundle')">
              Báo Giá Chi Tiết (Gộp 1 Set – Mẫu Taikisha) →
            </button>
            <button class="btn" onclick="App.startDetailedFromF1('itemized')">
              Báo Giá Chi Tiết (Tách rời từng hạng mục) →
            </button>
          </div>
        </div>

        <div class="grid-4" style="margin-bottom: 12px;">
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
            Lưu lượng cần xử lý (m³/min)
            <input type="number" id="f1FlowSearchInput" placeholder="VD: 55 hoặc 130..." value="${esc(state.f1.flowSearch)}" oninput="App.setF1FlowSearch(this.value)">
          </label>

          <label class="field">
            Tên dự án / Khách hàng
            <input type="text" placeholder="VD: Murata - Biên Hòa" value="${esc(state.f1.projectName)}" oninput="App.setF1Project(this.value)">
          </label>
        </div>

        <div id="f1RecommendedBox">${buildF1RecommendedHtml()}</div>

        ${cur ? `
          <div class="cfg-toolbar-bar">
            <div class="cfg-pill-group">
              <span class="cfg-pill-label">Thông số:</span>
              <button type="button" class="btn btn-sm ${specLevel === 'basic' ? 'btn-navy' : ''}" onclick="App.setF1SpecLevel('basic')" title="Ẩn thông số điện chi tiết (kW, 3 pha, 380V, 50Hz, 4P, IE3)">
                Gọn
              </button>
              <button type="button" class="btn btn-sm ${specLevel === 'detailed' ? 'btn-navy' : ''}" onclick="App.setF1SpecLevel('detailed')" title="Hiển thị đầy đủ thông số kỹ thuật gốc">
                Đầy đủ
              </button>
            </div>

            <div class="cfg-pill-group">
              <span class="cfg-pill-label">Phí QL & Thiết kế:</span>
              <input type="number" class="num" min="0" max="100" step="0.5"
                     style="width:58px;padding:3px 6px;font-weight:700;"
                     value="${f1Calc.mgmtPct}"
                     onchange="App.setF1MgmtPercent(this.value)">
              <span style="font-size:12px;font-weight:700;color:var(--navy);">%</span>
              <span style="margin:0 6px;color:#cbd5e1;">|</span>
              <span class="cfg-pill-label">VAT:</span>
              ${[0, 5, 8, 10].map(vp => `
                <button type="button" class="btn btn-sm ${Number(f1Calc.vatPct) === vp ? 'btn-navy' : ''}"
                        style="padding:2px 7px;font-size:11.5px;"
                        onclick="App.setF1VatPercent(${vp})">${vp}%</button>
              `).join('')}
            </div>

            ${anyExcluded ? `
              <button type="button" class="btn btn-sm" style="border-color:var(--green);color:var(--green);" onclick="App.resetF1Components()">
                ↺ Khôi phục đủ các hạng mục
              </button>
            ` : `
              <span style="font-size:11.5px;color:var(--muted);"></span>
            `}
          </div>

          <div class="kpi-grid">
            <div class="kpi-box">
              <div class="kpi-label">Cấu hình đang chọn (${f1Calc.selectedCount}/5 hạng mục)</div>
              <div class="kpi-val">${esc(cur.product_line)} – Model ${esc(cur.model_code)}</div>
            </div>
            <div class="kpi-box">
              <div class="kpi-label">Lưu lượng thiết kế</div>
              <div class="kpi-val">${cur.flow_rate} m³/min <small style="font-weight:600;color:#555">(${fmtVnd(cur.flow_cmh)} CMH)</small></div>
            </div>
            ${showCost ? `
              <div class="kpi-box amber">
                <div class="kpi-label">Tổng Giá Cost Nội Bộ ${anyExcluded ? '(Đã trừ bỏ)' : ''}</div>
                <div class="kpi-val">${fmtVnd(f1Calc.subtotalCost)} VND</div>
              </div>
            ` : ''}
            <div class="kpi-box green">
              <div class="kpi-label">Tổng Báo Giá Cơ Bản ${f1Calc.vatPct > 0 ? `(Trước VAT / Sau VAT ${f1Calc.vatPct}%)` : '(Chưa VAT)'}</div>
              <div class="kpi-val">${fmtVnd(f1Calc.subtotalBase)} VND</div>
              ${f1Calc.vatPct > 0 ? `<div style="font-size:12px;color:#166534;font-weight:600;margin-top:2px;">Sau VAT ${f1Calc.vatPct}%: ${fmtVnd(f1Calc.totalAfterTax)} VND</div>` : ''}
            </div>
          </div>

          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="c" style="width:46px;" title="Tích chọn để đưa vào báo giá; bỏ tích để trừ đúng giá thành phần từ Data báo giá.xlsx">Chọn</th>
                  <th style="width: 23%; min-width: 170px;">Hạng mục cấu hình</th>
                  <th style="min-width: 240px;">Thông số kỹ thuật (${specLevel === 'basic' ? 'Gọn' : 'Đầy đủ'})</th>
                  ${showCost ? '<th class="r cost-col" style="width: 15%;">Giá Cost nội bộ (VND)</th>' : ''}
                  <th class="r" style="width: 17%;">Giá báo cơ bản (VND)</th>
                </tr>
              </thead>
              <tbody>
                ${coreLines.map(l => `
                  <tr class="${l.included ? '' : 'row-excluded'}">
                    <td class="c">
                      <input type="checkbox" ${l.included ? 'checked' : ''}
                             style="width:16px;height:16px;cursor:pointer;"
                             onchange="App.toggleF1Component('${l.key}', this.checked)">
                    </td>
                    <td>
                      <strong class="excl-strike">${esc(l.name)}</strong>
                      ${!l.included ? `<div style="margin-top:2px;"><span class="tag-excluded">-${fmtVnd(l.base)} đ</span></div>` : ''}
                    </td>
                    <td class="excl-strike">${esc(l.detail)}</td>
                    ${showCost ? `<td class="r cost-col">${l.included ? fmtVnd(l.cost) : '0'}</td>` : ''}
                    <td class="r"><strong>${l.included ? fmtVnd(l.base) : '0'}</strong></td>
                  </tr>
                `).join('')}
                <tr class="sub-row">
                  <td colspan="3">Thiết bị sản xuất đã chọn (${f1Calc.selectedCount}/5 hạng mục)</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(f1Calc.prodCost)}</td>` : ''}
                  <td class="r">${fmtVnd(f1Calc.prodBase)}</td>
                </tr>
                <tr>
                  <td class="c">✓</td>
                  <td><strong>6. Chi phí quản lý, thiết kế (${f1Calc.mgmtPct}%)</strong></td>
                  <td>Chi phí quản lý dự án, bản vẽ thiết kế & vận hành thử (= ${f1Calc.mgmtPct}% × ${fmtVnd(f1Calc.prodBase)} đ)</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(f1Calc.mgmtCost)}</td>` : ''}
                  <td class="r"><strong>${fmtVnd(f1Calc.mgmtBase)}</strong></td>
                </tr>
                <tr class="total-row">
                  <td colspan="3">TỔNG BÁO GIÁ CƠ BẢN TRƯỚC THUẾ (Thiết bị đã chọn + Phí QL, thiết kế ${f1Calc.mgmtPct}%)</td>
                  ${showCost ? `<td class="r cost-col">${fmtVnd(f1Calc.subtotalCost)}</td>` : ''}
                  <td class="r">${fmtVnd(f1Calc.subtotalBase)}</td>
                </tr>
                <tr>
                  <td colspan="3" class="r"><strong>Thuế GTGT (VAT ${f1Calc.vatPct}%)</strong></td>
                  ${showCost ? '<td class="r cost-col">—</td>' : ''}
                  <td class="r"><strong>${fmtVnd(f1Calc.vatAmount)}</strong></td>
                </tr>
                <tr class="sub-row" style="background:#dcfce7;">
                  <td colspan="3" class="r"><strong>TỔNG CỘNG SAU THUẾ (After TAX)</strong></td>
                  ${showCost ? '<td class="r cost-col">—</td>' : ''}
                  <td class="r" style="color:var(--green-dark);font-size:14.5px;"><strong>${fmtVnd(f1Calc.totalAfterTax)} VND</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="alert-box alert-warn" style="margin-top: 12px; margin-bottom: 0;">
            <strong>* Phạm vi thiết bị mặc định & Ghi chú gửi khách hàng:</strong>
            <div style="margin-top:6px;">
              <div style="margin-bottom:6px;">
                <strong>Thiết bị đo đi kèm mặc định trong Hệ tháp</strong>
                <span style="font-size:11.5px;color:#78350f;">(Đã gồm trong giá Hệ tháp; bỏ tích nếu muốn trừ đúng giá danh mục Sheet 3):</span>
              </div>
              <div>
                ${defaultInstruments.map(d => {
                  const isOn = !excl.tower && !exclInsts[d.id];
                  return `
                    <label class="inst-toggle-chip ${isOn ? '' : 'is-off'}" title="Giá gốc Sheet 3: ${fmtVnd(d.base_price)} đ / ${d.unit}">
                      <input type="checkbox" ${isOn ? 'checked' : ''} ${excl.tower ? 'disabled' : ''}
                             onchange="App.toggleF1DefaultInst(${d.id}, this.checked)">
                      ${esc(d.name_vi)} x ${d.default_qty}
                      <span style="font-size:10.5px;opacity:0.8;">(${fmtVnd(d.base_price)} đ)</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px dashed #fcd34d;">
              <label class="field">
                Ghi chú Lắp đặt & Vận chuyển cho Báo giá cơ bản (mặc định chưa gồm, có thể sửa theo trường hợp):
                <div class="note-preset-row">
                  <button type="button" class="btn btn-sm" onclick="App.applyF1NotePreset('none')">Chưa gồm lắp đặt & vận chuyển</button>
                  <button type="button" class="btn btn-sm" onclick="App.applyF1NotePreset('ship_only')">Đã gồm vận chuyển, chưa lắp đặt</button>
                  <button type="button" class="btn btn-sm" onclick="App.applyF1NotePreset('both')">Đã gồm cả vận chuyển & lắp đặt</button>
                </div>
                <input type="text" value="${esc(state.f1.noteInstallTrans || '')}"
                       oninput="App.setF1NoteInstallTrans(this.value)"
                       placeholder="Giá trên chưa bao gồm chi phí lắp đặt và vận chuyển.">
              </label>
            </div>
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
                <th style="min-width: 140px;">Quạt (${specLevel === 'basic' ? 'Lưu lượng / Áp suất' : 'Motor / Pa'})</th>
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
                  <td>${specLevel === 'basic'
                    ? `${esc(m.fan_model)} (${fmtVnd(m.flow_cmh)} CMH, ${fmtVnd(m.fan_pressure_pa)} Pa)`
                    : `${esc(m.fan_model)} (${m.motor_kw}kW, ${m.fan_pressure_pa}Pa)`
                  }</td>
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

  function toggleF1Component(key, checked) {
    state.f1.excludedComponents = state.f1.excludedComponents || {};
    state.f1.excludedComponents[key] = !checked;
    renderFlow1();
  }

  function toggleF1DefaultInst(eqId, checked) {
    state.f1.excludedDefaultInsts = state.f1.excludedDefaultInsts || {};
    state.f1.excludedDefaultInsts[eqId] = !checked;
    renderFlow1();
  }

  function resetF1Components() {
    state.f1.excludedComponents = {};
    state.f1.excludedDefaultInsts = {};
    renderFlow1();
    toast('Đã khôi phục đủ 5 hạng mục & 4 thiết bị đo mặc định!');
  }

  function setF1SpecLevel(level) {
    state.f1.specDetailLevel = level === 'detailed' ? 'detailed' : 'basic';
    renderFlow1();
  }

  function setF1MgmtPercent(val) {
    const n = Math.min(100, Math.max(0, Number(val || 0)));
    state.f1.mgmtFeePercent = Number.isFinite(n) ? n : 5;
    renderFlow1();
  }

  function setF1VatPercent(val) {
    const n = Math.min(100, Math.max(0, Number(val || 0)));
    state.f1.vatPercent = Number.isFinite(n) ? n : 8;
    renderFlow1();
  }

  function setF1NoteInstallTrans(val) {
    state.f1.noteInstallTrans = val;
  }

  function applyF1NotePreset(preset) {
    if (preset === 'none') {
      state.f1.noteInstallTrans = 'Giá trên chưa bao gồm chi phí lắp đặt và vận chuyển.';
    } else if (preset === 'ship_only') {
      state.f1.noteInstallTrans = 'Giá trên đã bao gồm chi phí vận chuyển, chưa bao gồm chi phí lắp đặt tại công trình.';
    } else if (preset === 'both') {
      state.f1.noteInstallTrans = 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ. BG trên chưa bao gồm phí nâng hạ và cẩu đưa vào vị trí lắp đặt.';
    }
    renderFlow1();
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

  function buildItemsForTowerModel(m, insertMode = 'itemized', excludedComps = {}, excludedDefaultInsts = {}, idPrefix = '') {
    const pfx = idPrefix || ('t' + Date.now());
    const prodSlug = m.product_line.replace(/\s+/g, '-').replace(/L$/, '');
    const towerTitleCode = `${prodSlug.split('-')[0]}-${m.model_code}-${prodSlug.split('-')[1] || '1.0'}`;
    const breakdown = buildTowerComponentBreakdown(m, excludedComps, excludedDefaultInsts);

    if (insertMode === 'tower_bundle') {
      let sumBase = 0;
      let sumCost = 0;
      let hasCost = false;
      Object.values(breakdown).forEach(c => {
        if (c.included) {
          sumBase += Number(c.base || 0);
          if (c.cost !== null && c.cost !== undefined) {
            sumCost += Number(c.cost || 0);
            hasCost = true;
          }
        }
      });
      return [{
        id: `${pfx}-bundle`,
        stt: '1',
        item_type: 'tower_bundle',
        included: true,
        merge_group: '',
        model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
        component_breakdown: breakdown,
        name_jp: '洗浄塔',
        name_vi: `Tháp xử lý   ${towerTitleCode}   ${m.specs?.tower_dim || ''}   (FRP)`,
        specs_text: '',
        unit: 'Set/Bộ',
        quantity: 1,
        cost_price: hasCost ? sumCost : null,
        base_price: sumBase,
        adjustment: 1,
        unit_price: sumBase,
        total_price: sumBase,
        remark: 'KYOWA VN',
        sub_lines: buildTowerSubLinesFromModel(m, excludedComps, excludedDefaultInsts)
      }];
    }

    const defaults = getDefaultInstrumentsCatalog();
    const keptDefaults = defaults.filter(d => !excludedDefaultInsts[d.id]);
    const instNote = keptDefaults.length > 0
      ? `Đã gồm: ${keptDefaults.map(d => `${d.name_vi} x${d.default_qty || 1}`).join(', ')}`
      : 'Không bao gồm thiết bị đo mặc định';

    return [
      {
        id: `${pfx}-tower`, stt: '1', item_type: 'tower', included: !excludedComps.tower, merge_group: '',
        model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
        name_jp: '洗浄塔', name_vi: `Hệ tháp xử lý ${m.product_line} - Model ${m.model_code} (${m.flow_rate} m³/min, FRP)`,
        specs_text: `KT tham khảo: ${m.specs?.tower_dim || ''} · ${instNote}`,
        unit: 'Set/Bộ', quantity: 1,
        cost_price: breakdown.tower.cost, base_price: breakdown.tower.base, adjustment: 1,
        unit_price: breakdown.tower.base, total_price: breakdown.tower.base, remark: 'KYOWA VN', sub_lines: []
      },
      {
        id: `${pfx}-fan`, stt: '2', item_type: 'fan', included: !excludedComps.fan, merge_group: '',
        name_jp: '排気ファン', name_vi: `Quạt hút ${m.fan_model} (FRP)`,
        specs_text: m.specs?.fan_spec || `${fmtVnd(m.flow_cmh)} CMH   ${m.fan_pressure_pa} Pa   ${m.motor_kw} Kw, 3phase ,380V,50Hz, 4P,IE3`,
        unit: 'Set/Bộ', quantity: 1,
        cost_price: breakdown.fan.cost, base_price: breakdown.fan.base, adjustment: 1,
        unit_price: breakdown.fan.base, total_price: breakdown.fan.base, remark: 'KYOWA', sub_lines: []
      },
      {
        id: `${pfx}-pump`, stt: '3', item_type: 'pump', included: !excludedComps.pump, merge_group: '',
        name_jp: '循環ポンプ', name_vi: `Bơm tuần hoàn ${m.pump_model}`,
        specs_text: m.specs?.pump_spec || m.pump_model,
        unit: 'Set/Bộ', quantity: 1,
        cost_price: breakdown.pump.cost, base_price: breakdown.pump.base, adjustment: 1,
        unit_price: breakdown.pump.base, total_price: breakdown.pump.base, remark: 'KYOWA JP', sub_lines: []
      },
      {
        id: `${pfx}-panel`, stt: '4', item_type: 'panel', included: !excludedComps.panel, merge_group: '',
        name_jp: '制御盤', name_vi: 'Tủ điện điều khiển + Đấu dây',
        specs_text: '',
        unit: 'Set/Bộ', quantity: 1,
        cost_price: breakdown.panel.cost, base_price: breakdown.panel.base, adjustment: 1,
        unit_price: breakdown.panel.base, total_price: breakdown.panel.base, remark: 'KYOWA VN', sub_lines: []
      },
      {
        id: `${pfx}-stage`, stt: '5', item_type: 'stage', included: !excludedComps.stage, merge_group: '',
        name_jp: '架台・階段', name_vi: 'Hệ sắt Stage, Ladder, sàn thao tác, ống khói',
        specs_text: `Ống khói: ${m.specs?.stack_dim || 'φ 350 x 850 H'}`,
        unit: 'Set/Bộ', quantity: 1,
        cost_price: breakdown.stage.cost, base_price: breakdown.stage.base, adjustment: 1,
        unit_price: breakdown.stage.base, total_price: breakdown.stage.base, remark: 'KYOWA VN', sub_lines: []
      }
    ];
  }

  function startDetailedFromF1(mode = 'tower_bundle') {
    const m = getSelectedF1Model();
    if (!m) return;

    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const seq = String(state.quotations.length + 26).padStart(3, '0');
    const baseCode = `2601-${seq}`;
    const quoteNumber = `${baseCode}-01`;

    const excl = { ...(state.f1.excludedComponents || {}) };
    const exclInsts = { ...(state.f1.excludedDefaultInsts || {}) };
    const f1Calc = computeF1Totals(m);
    const isBasicQuote = mode === 'basic_quote';
    const mgmtPct = f1Calc.mgmtPct;
    const vatPct = f1Calc.vatPct;

    let sections = [];
    if (isBasicQuote) {
      const coreItems = buildItemsForTowerModel(m, 'itemized', excl, exclInsts, 'item-a');
      coreItems.push({
        id: 'item-mgmt-basic',
        stt: String(coreItems.length + 1),
        item_type: 'service_mgmt',
        included: true,
        merge_group: '',
        name_jp: '現場管理・設計・試運転費',
        name_vi: `Chi phí quản lý, thiết kế, vận hành (${mgmtPct}%)`,
        specs_text: '',
        unit: 'Lot/Lần',
        quantity: 1,
        cost_price: f1Calc.mgmtCost,
        base_price: f1Calc.mgmtBase,
        adjustment: 1,
        unit_price: f1Calc.mgmtBase,
        total_price: f1Calc.mgmtBase,
        remark: '',
        sub_lines: []
      });
      sections = [
        {
          id: 'sec-a',
          code: 'A./製造 Sản xuất',
          title: `A./製造 Sản xuất – ${m.product_line} Model ${m.model_code}`,
          showSubtotal: false,
          subtotalLabel: 'TOTAL (A)',
          bundleMode: 'single_total',
          model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
          excluded_default_insts: exclInsts,
          items: coreItems
        }
      ];
    } else if (mode === 'tower_bundle') {
      sections = [
        {
          id: 'sec-a',
          code: 'A./製造 Sản xuất',
          title: 'A./製造 Sản xuất',
          showSubtotal: true,
          subtotalLabel: 'TOTAL (A)',
          bundleMode: 'bundled_set',
          model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
          excluded_default_insts: exclInsts,
          items: buildItemsForTowerModel(m, 'tower_bundle', excl, exclInsts, 'item-a')
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
              id: 'item-b1', stt: '1', item_type: 'service_mgmt', included: true, merge_group: '',
              name_jp: '現場管理・設計・試運転費', name_vi: 'Thiết kế, quản lí, vận hành',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: f1Calc.mgmtCost, base_price: f1Calc.mgmtBase, adjustment: 1,
              unit_price: f1Calc.mgmtBase, total_price: f1Calc.mgmtBase, remark: ''
            },
            {
              id: 'item-b2', stt: '2', item_type: 'service', included: true, merge_group: '',
              name_jp: '運送費', name_vi: 'Vận chuyển',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 18000000, base_price: 26000000, adjustment: 1,
              unit_price: 26000000, total_price: 26000000, remark: 'ko cẩu vào vị trí'
            },
            {
              id: 'item-b3', stt: '3', item_type: 'service', included: true, merge_group: '',
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
          model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
          excluded_default_insts: exclInsts,
          items: buildItemsForTowerModel(m, 'itemized', excl, exclInsts, 'item-a')
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
              id: 'item-b1', stt: '1', item_type: 'service_mgmt', included: true, merge_group: '',
              name_jp: '現場管理・設計・試運転費', name_vi: 'Thiết kế, quản lí, vận hành',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: f1Calc.mgmtCost, base_price: f1Calc.mgmtBase, adjustment: 1,
              unit_price: f1Calc.mgmtBase, total_price: f1Calc.mgmtBase, remark: ''
            },
            {
              id: 'item-b2', stt: '2', item_type: 'service', included: true, merge_group: '',
              name_jp: '運送費', name_vi: 'Vận chuyển',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 18000000, base_price: 26000000, adjustment: 1,
              unit_price: 26000000, total_price: 26000000, remark: 'ko cẩu vào vị trí'
            },
            {
              id: 'item-b3', stt: '3', item_type: 'service', included: true, merge_group: '',
              name_jp: '現場設置', name_vi: 'Lắp đặt tại công trình',
              specs_text: '', unit: 'Lot/Lần', quantity: 1,
              cost_price: 70000000, base_price: 104000000, adjustment: 1,
              unit_price: 104000000, total_price: 104000000, remark: ''
            }
          ]
        }
      ];
    }

    const defaultNote5 = isBasicQuote
      ? (state.f1.noteInstallTrans || 'Giá trên chưa bao gồm chi phí lắp đặt và vận chuyển.')
      : 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.\nBG trên chưa bao gồm phí nâng hạ tại công trình và cẩu đưa vào vị trí lắp đặt.';

    state.quickAddTargetSecIdx = 0;
    state.selectedGroupItemKeys = [];
    state.quickTowerProdLine = m.product_line;
    state.quickTowerModelCode = String(m.model_code);

    state.activeQuote = {
      id: null,
      quote_number: quoteNumber,
      base_code: baseCode,
      revision: 1,
      quote_date: today,
      doc_title: '御見積 BÁO GIÁ',
      flow_type: isBasicQuote ? 'basic' : 'detailed',
      layout_template: isBasicQuote ? 'basic_single' : (mode === 'tower_bundle' ? 'tower_bundle' : 'itemized'),
      mgmt_fee_mode: isBasicQuote ? 'included_in_a' : 'separate_to_b',
      mgmt_fee_percent: mgmtPct,
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
      vat_percent: vatPct,
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
        note_5_vi: defaultNote5,
        payment_mode: 'installments_30_60_10',
        payment_lines: [
          '- Thanh toán lần 1 1回目 : Cọc 30% 契約時に30％前金',
          '- Thanh toán lần 2 2回目 : 60% sau khi giao hàng 納品後に60％',
          '- Thanh toán lần 3 3回目 : 10% sau khi lắp đặt 設置後に残り10％'
        ],
        bank_account_name_vi: 'KYOWA KAKO VIETNAM CO.,LTD',
        bank_account_no: '3680022466',
        bank_name_vi: 'BIDV Bank - Tan Binh Branch, HCMC',
        total_label_before_tax: isBasicQuote ? 'TOTAL - Before TAX' : 'Total (A) + (B) - Before TAX',
        mgmt_fee_percent: mgmtPct,
        auto_calc_mgmt: true,
        price_display_mode: isBasicQuote ? 'single_total' : 'itemized',
        spec_detail_level: isBasicQuote ? 'basic' : (state.f1.specDetailLevel || 'detailed')
      },
      internal_notes: `Khởi tạo từ cấu hình cơ bản ${m.product_line} - Model ${m.model_code} (${f1Calc.selectedCount}/5 hạng mục, tổng cơ bản trước thuế: ${fmtVnd(f1Calc.subtotalBase)} VND).`
    };

    recalcActiveQuoteTotals();
    updateActiveQuoteBadge();
    showTab(isBasicQuote ? 'print' : 'flow2');
    toast(isBasicQuote
      ? `Đã tạo Báo giá cơ bản ${m.product_line} - Model ${m.model_code} (1 giá tổng, thông số gọn)!`
      : `Đã nạp cấu hình ${m.product_line} - Model ${m.model_code} sang Báo giá chi tiết!`
    );
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
    if (!q) return { pct: 5, prodCostSum: 0, prodBaseSum: 0, cost: 0, base: 0, areaCount: 0 };
    const rawPct = customPct !== undefined
      ? customPct
      : (q.mgmt_fee_percent ?? q.terms?.mgmt_fee_percent ?? 5);
    const pct = Math.min(100, Math.max(0, Number(rawPct ?? 5)));

    let prodCostSum = 0;
    let prodBaseSum = 0;
    let hasAnyProdItems = false;
    let areaCount = 0;

    // Mã 09: Tổng hợp thiết bị sản xuất trên TẤT CẢ các khu vực / hệ (A1, A2, ...), bỏ qua mục không báo giá
    (q.sections || []).forEach(sec => {
      let secHasIncludedProd = false;
      (sec.items || []).forEach(it => {
        if (!isMgmtFeeItem(it) && it.item_type !== 'service') {
          hasAnyProdItems = true;
          if (it.included === false) return;
          secHasIncludedProd = true;
          const qty = Math.max(1, Number(it.quantity || 1));
          prodBaseSum += Math.round(Number(it.base_price || 0) * qty);
          if (it.cost_price !== null && it.cost_price !== undefined) {
            prodCostSum += Math.round(Number(it.cost_price || 0) * qty);
          }
        }
      });
      if (secHasIncludedProd) areaCount++;
    });

    if (!hasAnyProdItems && prodBaseSum <= 0 && q.selected_product_line && q.selected_model_code) {
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
    return { pct, prodCostSum, prodBaseSum, cost, base, areaCount };
  }

  function syncAutoMgmtFee(q) {
    if (!q) return;
    const autoCalc = q.terms?.auto_calc_mgmt !== false;
    if (!autoCalc) return;
    const mgmtInfo = computeMgmtFeeAmounts(q);
    (q.sections || []).forEach(sec => {
      (sec.items || []).forEach(it => {
        if (isMgmtFeeItem(it)) {
          it.item_type = 'service_mgmt';
          if (it.included === false || it._manualMgmtPrice) return;
          it.cost_price = mgmtInfo.cost;
          it.base_price = mgmtInfo.base;
          if (!it._keepExactUnitPrice) {
            it.unit_price = Math.max(0, Math.round(mgmtInfo.base * Number(it.adjustment ?? 1)));
          }
        }
      });
    });
  }

  function renumberSectionItems(sec) {
    if (!sec || !Array.isArray(sec.items)) return;
    let seq = 1;
    sec.items.forEach(it => {
      if (it.included === false) {
        it.stt = '—';
      } else {
        it.stt = String(seq++);
      }
    });
  }

  function renumberAllSections(q) {
    if (!q || !Array.isArray(q.sections)) return;
    q.sections.forEach(sec => renumberSectionItems(sec));
  }

  function healDuplicateOrBrokenSectionStts(q) {
    if (!q || !Array.isArray(q.sections)) return;
    q.sections.forEach(sec => {
      const items = sec.items || [];
      const active = items.filter(it => it.included !== false);
      const stts = active.map(it => String(it.stt ?? '').trim());
      const hasEmptyOrDash = stts.some(s => !s || s === '—');
      const hasDuplicate = new Set(stts).size !== stts.length;
      if (hasEmptyOrDash || hasDuplicate) {
        renumberSectionItems(sec);
      } else {
        items.forEach(it => {
          if (it.included === false) it.stt = '—';
        });
      }
    });
  }

  function normalizeItemPricing(it) {
    if (!it) return;
    if (it.included === undefined) it.included = true;
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

    // Đảm bảo dữ liệu breakdown cho các gói tháp cũ & tự động đồng bộ Phí QL/TK (Mã 04, 09, 10)
    (q.sections || []).forEach(sec => {
      (sec.items || []).forEach(it => {
        if (it.item_type === 'tower_bundle') {
          hydrateTowerBundleBreakdown(it, q, sec);
        }
        normalizeItemPricing(it);
      });
    });

    syncAutoMgmtFee(q);
    healDuplicateOrBrokenSectionStts(q);

    let subCost = 0;
    let subBase = 0;
    let subBeforeTax = 0;

    (q.sections || []).forEach(sec => {
      let secTotal = 0;
      (sec.items || []).forEach(it => {
        normalizeItemPricing(it);
        if (it.included === false) {
          it.total_price = 0;
          return;
        }
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

  function detectServiceCoverage(q) {
    let hasShip = false;
    let hasInstall = false;
    (q?.sections || []).forEach(sec => {
      (sec.items || []).forEach(it => {
        if (it.included === false) return;
        const txt = `${it.name_vi || ''} ${it.name_jp || ''}`.toLowerCase();
        if (txt.includes('vận chuyển') || txt.includes('運送費')) hasShip = true;
        if (txt.includes('lắp đặt') || txt.includes('現場設置')) hasInstall = true;
      });
    });
    return { hasShip, hasInstall };
  }

  function resolveQuotePeople(q) {
    if (!q) {
      return {
        creatorUsername: '',
        creatorName: '—',
        creatorHandle: '',
        picName: '—',
        picPhone: '',
        approverName: '—',
        approverPhone: '',
        approvedBy: '',
        approvedAt: '',
        isDiffActualApprover: false
      };
    }
    const rawCreatorUser = String(q.created_by || (!q.id ? (state.currentUser?.username || '') : '')).trim();
    const matchedCreator = rawCreatorUser
      ? (state.users || []).find(u => String(u.username || '').toLowerCase() === rawCreatorUser.toLowerCase())
      : null;
    const creatorName = String(q.created_by_name || matchedCreator?.full_name || (rawCreatorUser ? `@${rawCreatorUser}` : '—')).trim() || '—';
    const creatorHandle = rawCreatorUser ? `@${rawCreatorUser}` : '';

    const picName = String(q.pic_name || '').trim() || '—';
    const picPhone = String(q.pic_phone || '').trim();

    const approverName = String(q.approver_name || '').trim() || '—';
    const approverPhone = String(q.approver_phone || '').trim();
    const approvedBy = String(q.approved_by || '').trim();
    const approvedAt = String(q.approved_at || '').trim();
    const isDiffActualApprover = Boolean(
      approvedBy &&
      approverName !== '—' &&
      approvedBy.toLowerCase() !== approverName.toLowerCase()
    );

    return {
      creatorUsername: rawCreatorUser,
      creatorName,
      creatorHandle,
      picName,
      picPhone,
      approverName,
      approverPhone,
      approvedBy,
      approvedAt,
      isDiffActualApprover
    };
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
    q.terms = q.terms || {};
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

    const secList = q.sections || [];
    if (state.quickAddTargetSecIdx >= secList.length) {
      state.quickAddTargetSecIdx = Math.max(0, secList.length - 1);
    }
    const targetSecIdx = Math.max(0, Number(state.quickAddTargetSecIdx || 0));

    const productLines = [...new Set(state.models.map(m => m.product_line))];
    if (!productLines.includes(state.quickTowerProdLine) && productLines.length > 0) {
      state.quickTowerProdLine = productLines[0];
    }
    const quickTowerModels = state.models.filter(m => m.product_line === state.quickTowerProdLine);
    if (quickTowerModels.length > 0 && !quickTowerModels.some(m => String(m.model_code) === String(state.quickTowerModelCode))) {
      state.quickTowerModelCode = String(quickTowerModels[0].model_code);
    }

    const priceDisplayMode = q.terms.price_display_mode || 'itemized';
    const specDetailLevel = q.terms.spec_detail_level || 'detailed';
    const autoCalcMgmt = q.terms.auto_calc_mgmt !== false;
    const svcCov = detectServiceCoverage(q);
    const existingGroupNames = [...new Set(
      secList.flatMap(s => (s.items || []).map(it => String(it.merge_group || '').trim()).filter(Boolean))
    )];

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
            ${(() => {
        const ppl = resolveQuotePeople(q);
        return `
              <div style="font-size:12.5px; color:var(--muted); margin-top:4px; line-height:1.5;">
                <div>
                  Khách hàng: <strong>${esc(q.customer_name)}</strong> · Dự án: <strong>${esc(q.project_name || '—')}</strong>
                  ${q.updated_at ? ` · Cập nhật: <strong>${esc(formatDateTimeVN(q.updated_at))}</strong>` : ''}
                </div>
                <div style="margin-top:2px;">
                  Người tạo: <strong style="color:#334155">${esc(ppl.creatorName)}</strong>${ppl.creatorHandle && !ppl.creatorName.startsWith('@') ? ` <span style="font-size:11.5px;">(${esc(ppl.creatorHandle)})</span>` : ''}
                  · Người đảm trách (PIC): <strong style="color:var(--navy)">${esc(ppl.picName)}</strong>
                  · Người duyệt: <strong>${esc(ppl.approverName)}</strong>
                  ${(q.status === 'approved' || q.status === 'sent')
                    ? ` <span style="color:var(--green);font-weight:700;">(✓ Đã duyệt${ppl.approvedBy ? ` bởi ${esc(ppl.approvedBy)}` : ''}${ppl.approvedAt ? ` lúc ${esc(formatDateTimeVN(ppl.approvedAt))}` : ''})</span>`
                    : ''}
                </div>
              </div>
            `;
      })()}
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
          <span style="font-size:12px;color:var(--muted)"></span>
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
              ${(() => {
        const activeUsers = (state.users || []).filter(u => Number(u.is_active ?? 1) !== 0);
        const curPic = String(q.pic_name || '').trim().toLowerCase();
        const matchedPic = !q._customPic && activeUsers.find(
          u => String(u.full_name || '').trim().toLowerCase() === curPic
        );
        const showCustomPic = Boolean(q._customPic || (!matchedPic && curPic));
        const ppl = resolveQuotePeople(q);

        return `
                  <label class="field">
                    担当者 Người đảm trách (Sale/PIC trên báo giá)
                    <select id="picUserSelect" onchange="App.onSelectPicUser(this.value)">
                      ${activeUsers.map(u => {
          const rLabel = u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Quản lý KD' : 'Sale';
          return `
                          <option value="${u.id}" ${matchedPic && matchedPic.id === u.id ? 'selected' : ''}>
                            ${esc(u.full_name)} (${rLabel})${u.phone ? ` · ${esc(u.phone)}` : ''}
                          </option>
                        `;
        }).join('')}
                      <option value="__custom__" ${showCustomPic ? 'selected' : ''}>✍️ Tùy chỉnh tên người đảm trách khác...</option>
                    </select>
                    <input type="text" id="picNameCustomInput"
                           style="margin-top:4px; display:${showCustomPic ? 'block' : 'none'};"
                           value="${esc(q.pic_name || '')}"
                           placeholder="Nhập họ tên người đảm trách..."
                           oninput="App.updateQField('pic_name', this.value)">
                  </label>
                  <label class="field">
                    SĐT Người đảm trách
                    <input type="text" id="picPhoneInput" value="${esc(q.pic_phone || '')}"
                           oninput="App.updateQField('pic_phone', this.value)">
                  </label>
                `;
      })()}
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
          <h3 class="card-title">2. Phí Quản Lý/Thiết Kế, Nạp Hệ Tháp Theo Khu Vực & Thêm Nhanh Thiết Bị</h3>
        </div>

        <div class="target-area-bar">
          <div class="row" style="align-items:center; gap:8px; flex:1; min-width:260px;">
            <strong style="color:var(--navy); white-space:nowrap;">Khu vực / Nhóm:</strong>
            <select id="quickAddTargetSectionSelect" style="flex:1; min-width:200px; font-weight:700; color:var(--navy);"
                    onchange="App.setQuickAddTargetSection(this.value)">
              ${secList.map((sec, idx) => `
                <option value="${idx}" ${idx === targetSecIdx ? 'selected' : ''}>
                  [${idx + 1}] ${esc(sec.title || sec.code || `Nhóm ${idx + 1}`)} (${(sec.items || []).filter(x => x.included !== false).length} mục)
                </option>
              `).join('')}
            </select>
          </div>
          <div class="row" style="gap:6px;">
            <button type="button" class="btn btn-sm btn-navy" onclick="App.addSection()">
              + Tạo Khu vực / Nhóm mới
            </button>
          </div>
        </div>

        <div class="grid-2" style="margin-bottom: 12px;">
          ${(() => {
        const mgmtInfo = computeMgmtFeeAmounts(q);
        const mgmtPct = mgmtInfo.pct;
        return `
              <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
                <div class="row-between" style="margin-bottom:6px; gap:6px;">
                  <strong style="color:var(--navy);">Phí "Quản lý, thiết kế, vận hành" (<span id="mgmtFeePctTitle">${mgmtPct}</span>%)</strong>
                  <div style="display:flex; align-items:center; gap:4px; background:#fff; padding:3px 8px; border-radius:6px; border:1px solid #93c5fd;">
                    <span style="font-size:12px; font-weight:700; color:var(--navy);">Mức phí:</span>
                    <input type="number" id="mgmtFeePercentInput" class="num" min="0" max="100" step="0.1"
                           style="width:62px; padding:3px 6px; font-weight:700; color:var(--navy); border:1px solid #cbd5e1;"
                           value="${mgmtPct}"
                           title="Mặc định 5% trên tổng thiết bị sản xuất của TẤT CẢ các hệ/khu vực"
                           onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                           oninput="App.onMgmtFeePercentInput(this.value, this)"
                           onblur="App.onMgmtFeePercentBlur(this)">
                    <span style="font-size:12.5px; font-weight:700; color:var(--navy);">%</span>
                  </div>
                </div>
                <div class="row-between" style="margin-bottom:6px; gap:6px; flex-wrap:wrap;">
                  <div class="row" style="gap:4px;">
                    ${[0, 3, 5, 8, 10].map(pct => `
                      <button type="button" class="btn btn-sm ${Number(mgmtPct) === pct ? 'btn-navy' : ''}"
                              id="mgmtPctBtn-${pct}"
                              style="padding:2px 7px; font-size:11.5px;"
                              onclick="App.setQuickMgmtFeePercent(${pct})">
                        ${pct}%
                      </button>
                    `).join('')}
                  </div>
                  <label style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:var(--navy);cursor:pointer;">
                    <input type="checkbox" ${autoCalcMgmt ? 'checked' : ''} onchange="App.toggleAutoCalcMgmt(this.checked)">
                    Tự động tính lại khi đổi thiết bị
                  </label>
                </div>
                <div id="mgmtFeeCalcHint" style="font-size:11.5px; font-weight:700; color:var(--green); margin-bottom:8px; background:#f0fdf4; padding:4px 8px; border-radius:5px; border:1px solid #bbf7d0;">
                  = ${mgmtPct}% × ${fmtVnd(mgmtInfo.prodBaseSum)} đ (tổng thiết bị ${mgmtInfo.areaCount > 1 ? `${mgmtInfo.areaCount} khu vực` : 'sản xuất'}) = ${fmtVnd(mgmtInfo.base)} đ
                </div>
                <select style="width:100%" onchange="App.handleMgmtFeeModeChange(this.value)">
                  <option value="separate_to_b" ${q.mgmt_fee_mode === 'separate_to_b' ? 'selected' : ''}>1. Tách sang mục B. Khác (Chuẩn mẫu Taikisha — 1 lần phí ở mục B)</option>
                  <option value="included_in_a" ${q.mgmt_fee_mode === 'included_in_a' ? 'selected' : ''}>2. Gộp chung trong mục Sản xuất A (Không tách mục B — 1 lần phí ở mục A)</option>
                  <option value="additional" ${q.mgmt_fee_mode === 'additional' ? 'selected' : ''}>3. Cộng bổ sung riêng (Giữ phí cơ bản ở mục A + Thêm phí bổ sung ở mục B)</option>
                </select>
                <div style="font-size:11.5px; color:#475569; margin-top:6px; line-height:1.4;">
                  ${q.mgmt_fee_mode === 'included_in_a'
                    ? `📌 <strong>PA 2:</strong> Tính <strong>1 lần</strong> phí (${mgmtPct}% = ${fmtVnd(mgmtInfo.base)} đ) gộp trực tiếp trong <strong>Mục A</strong>; không tách dòng phí ở Mục B.`
                    : q.mgmt_fee_mode === 'additional'
                      ? `📌 <strong>PA 3:</strong> Giữ khoản phí cơ bản (${mgmtPct}% = ${fmtVnd(mgmtInfo.base)} đ) trong <strong>Mục A</strong> <u>VÀ</u> cộng thêm 1 dòng phí quản lý/thiết kế bổ sung riêng tại <strong>Mục B</strong> (có thể sửa giá riêng).`
                      : `📌 <strong>PA 1:</strong> Tính <strong>1 lần</strong> phí (${mgmtPct}% = ${fmtVnd(mgmtInfo.base)} đ) đặt tại <strong>Mục B. Khác</strong>; Mục A chỉ gồm giá thiết bị sản xuất.`
                  }
                </div>
              </div>
            `;
      })()}

          <div style="background:#f0f9ff; padding:12px; border-radius:8px; border:1px solid #bae6fd;">
            <strong style="color:var(--navy); display:block; margin-bottom:6px;">Chọn & Nạp Hệ Tháp cho Khu vực</strong>
            <div class="grid-3" style="gap:6px; margin-bottom:8px;">
              <label class="field">
                Dòng sản phẩm
                <select onchange="App.setQuickTowerProdLine(this.value)">
                  ${productLines.map(pl => `<option value="${esc(pl)}" ${pl === state.quickTowerProdLine ? 'selected' : ''}>${esc(pl)}</option>`).join('')}
                </select>
              </label>
              <label class="field">
                Model tháp
                <select onchange="App.setQuickTowerModelCode(this.value)">
                  ${quickTowerModels.map(m => `<option value="${esc(m.model_code)}" ${String(m.model_code) === String(state.quickTowerModelCode) ? 'selected' : ''}>M${esc(m.model_code)} (${m.flow_rate} m³/m · ${fmtVnd(m.total_base)}đ)</option>`).join('')}
                </select>
              </label>
              <label class="field">
                Kiểu nạp
                <select onchange="App.setQuickTowerInsertMode(this.value)">
                  <option value="itemized" ${state.quickTowerInsertMode === 'itemized' ? 'selected' : ''}>Tách 5 hạng mục</option>
                  <option value="tower_bundle" ${state.quickTowerInsertMode === 'tower_bundle' ? 'selected' : ''}>Gộp 1 Set</option>
                </select>
              </label>
            </div>
            <div class="row" style="gap:6px;">
              <button type="button" class="btn btn-sm btn-primary" onclick="App.insertTowerIntoSection(${targetSecIdx})">
                + Nạp Hệ tháp vào Khu vực [${targetSecIdx + 1}]
              </button>
              <button type="button" class="btn btn-sm btn-navy" onclick="App.addNewAreaWithTower()">
                + Tạo Khu vực mới kèm Hệ tháp này
              </button>
            </div>
          </div>
        </div>

        <div class="grid-2">
          <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--navy); display:block; margin-bottom:6px;">Thêm Thiết bị đo & Option vào Khu vực [${targetSecIdx + 1}]</strong>
            <p style="font-size:12px; color:var(--muted); margin:0 0 8px;">
              Thiết bị đi kèm mặc định được kiểm tra riêng theo từng khu vực/hệ (Mã 01 & 03):
            </p>
            <div class="quick-add-row">
              <select id="quickAddInstSelect" onchange="App.setQuickAddSelection('quickAddInstSelect', this.value)">
                ${instrumentsAndOptions.map(eq => `
                  <option value="${eq.id}" ${String(eq.id) === String(state.quickAddSelectedIds?.quickAddInstSelect || '') ? 'selected' : ''}>
                    ${eq.is_default_included ? '[MẶC ĐỊNH THEO THÁP] ' : '[+ OPTION] '}
                    ${esc(eq.name_vi)} — ${eq.base_price ? fmtVnd(eq.base_price) + ' đ' : 'Chưa có giá'}
                  </option>
                `).join('')}
              </select>
              <button class="btn btn-sm btn-primary" onclick="App.quickAddEquipment('quickAddInstSelect')">
                + Thêm vào KV [${targetSecIdx + 1}]
              </button>
            </div>
          </div>

          <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border);">
            <strong style="color:var(--navy); display:block; margin-bottom:6px;">Thêm nhanh Quạt / Bơm lẻ & Dịch vụ vào Khu vực [${targetSecIdx + 1}]</strong>
            <div class="quick-add-row" style="margin-bottom:6px;">
              <select id="quickAddFanPumpSelect" onchange="App.setQuickAddSelection('quickAddFanPumpSelect', this.value)">
                ${standaloneFansPumps.map(eq => `
                  <option value="${eq.id}" ${String(eq.id) === String(state.quickAddSelectedIds?.quickAddFanPumpSelect || '') ? 'selected' : ''}>[${eq.category.toUpperCase()}] ${esc(eq.name_vi)} — ${fmtVnd(eq.base_price)} đ</option>
                `).join('')}
              </select>
              <button class="btn btn-sm btn-navy" onclick="App.quickAddEquipment('quickAddFanPumpSelect')">
                + Thêm TB
              </button>
            </div>
            <div class="quick-add-row">
              <select id="quickAddServiceSelect" onchange="App.setQuickAddSelection('quickAddServiceSelect', this.value)">
                ${serviceCatalog.map(eq => `
                  <option value="${eq.id}" ${String(eq.id) === String(state.quickAddSelectedIds?.quickAddServiceSelect || '') ? 'selected' : ''}>[DỊCH VỤ] ${esc(eq.name_vi)} — ${fmtVnd(eq.base_price)} đ</option>
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
          <h3 class="card-title">3. Chi Tiết Các Hạng Mục Báo Giá, Hiển Thị Giá & Điều Chỉnh Thương Lượng</h3>
          <div class="row">
            <button class="btn btn-sm btn-navy" onclick="App.addSection()">
              + Thêm Nhóm / Khu Vực Mới (VD: A2 - Khu vực 2, B./Khác...)
            </button>
          </div>
        </div>

        <div class="display-mode-bar">
          <div class="cfg-pill-group">
            <span class="cfg-pill-label">Chế độ hiển thị giá gửi khách:</span>
            <button type="button" class="btn btn-sm ${priceDisplayMode === 'itemized' ? 'btn-navy' : ''}"
                    onclick="App.setQuotePriceDisplayMode('itemized')" title="Hiển thị đơn giá & thành tiền riêng từng thiết bị (Mã 08)">
              Chi tiết từng thiết bị
            </button>
            <button type="button" class="btn btn-sm ${priceDisplayMode === 'per_section' ? 'btn-navy' : ''}"
                    onclick="App.setQuotePriceDisplayMode('per_section')" title="Mỗi hệ / khu vực hiển thị 1 giá trọn gói, ẩn giá từng thiết bị bên trong (Mã 06)">
              1 giá từng hệ / khu vực
            </button>
            <button type="button" class="btn btn-sm ${priceDisplayMode === 'single_total' ? 'btn-navy' : ''}"
                    onclick="App.setQuotePriceDisplayMode('single_total')" title="Liệt kê toàn bộ thiết bị nhưng chỉ hiện 1 giá tổng duy nhất (Mã 06)">
              1 giá tổng toàn bộ
            </button>
            <button type="button" class="btn btn-sm ${priceDisplayMode === 'custom_groups' ? 'btn-navy' : ''}"
                    onclick="App.setQuotePriceDisplayMode('custom_groups')" title="Gộp các mục bất kỳ thành 1 nhóm giá (VD: 1+3+5), tách riêng các mục còn lại (Mã 07)">
              Gộp nhóm linh hoạt
            </button>
          </div>

          <div class="cfg-pill-group">
            <span class="cfg-pill-label">📋 Thông số gửi khách:</span>
            <button type="button" class="btn btn-sm ${specDetailLevel === 'basic' ? 'btn-navy' : ''}"
                    onclick="App.setQuoteSpecDetailLevel('basic')" title="Báo giá cơ bản: ẩn kW, 3 pha, 380V, 50Hz, 4P, IE3 (Mã 11)">
              Cơ bản (Gọn)
            </button>
            <button type="button" class="btn btn-sm ${specDetailLevel === 'detailed' ? 'btn-navy' : ''}"
                    onclick="App.setQuoteSpecDetailLevel('detailed')" title="Hiển thị đầy đủ toàn bộ thông số kỹ thuật gốc">
              Chi tiết (Đầy đủ)
            </button>
          </div>
        </div>

        ${priceDisplayMode === 'custom_groups' ? `
          <div class="custom-group-toolbar">
            <div class="row" style="align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="color:#1d4ed8;">🔗 Gộp nhóm linh hoạt (Mã 07):</strong>
              <span>Đã chọn <strong id="groupSelCount">${(state.selectedGroupItemKeys || []).length}</strong> mục</span>
              <input type="text" id="customGroupNameInput" style="width:240px;padding:4px 8px;font-size:12.5px;"
                     value="${esc(state.customGroupNameInput || '')}"
                     placeholder="Nhập tên nhóm gộp (VD: Gói thiết bị chính)..."
                     oninput="App.setCustomGroupNameInput(this.value)">
              <button type="button" class="btn btn-sm btn-primary" onclick="App.mergeSelectedItemsIntoGroup()">
                🔗 Gộp mục đã chọn thành 1 giá
              </button>
              <button type="button" class="btn btn-sm" onclick="App.ungroupSelectedItems()">
                ✂️ Tách khỏi nhóm
              </button>
              ${existingGroupNames.length > 0 ? `
                <span style="font-size:11.5px;color:#475569;">Nhóm hiện có: ${existingGroupNames.map(gn => `<span class="tag-group-pill">${esc(gn)}</span>`).join(' ')}</span>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${(() => {
        const allItems = (q.sections || []).flatMap(s => s.items || []).filter(x => x.included !== false);
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

        ${(q.sections || []).map((sec, sIdx) => {
        const isActiveTarget = sIdx === targetSecIdx;
        const secInstInfo = getSectionDefaultInstInfo(sec);
        return `
          <div class="${isActiveTarget ? 'sec-card-active-target' : ''}" style="border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; background: #fff;">
            <div class="row-between sec-header-bar">
              <div class="row sec-header-fields">
                <label class="field sec-title-field">
                  Tiêu đề Nhóm / Phân khu [${sIdx + 1}]
                  <input type="text" value="${esc(sec.title)}" placeholder="VD: A1./ Khu vực 1 - Tháp FSD 0.5..."
                         oninput="App.updateSectionField(${sIdx}, 'title', this.value)">
                </label>
                <label class="field sec-sublabel-field">
                  Nhãn dòng Tổng nhóm
                  <input type="text" value="${esc(sec.subtotalLabel || '')}" placeholder="VD: TOTAL (A1)"
                         oninput="App.updateSectionField(${sIdx}, 'subtotalLabel', this.value)">
                </label>
                <label class="sec-subcheck-label">
                  <input type="checkbox" ${sec.showSubtotal ? 'checked' : ''}
                         onchange="App.updateSectionField(${sIdx}, 'showSubtotal', this.checked)">
                  Hiện Tổng nhóm
                </label>
              </div>
              <div class="row" style="gap:6px;">
                <button type="button" class="btn btn-sm ${isActiveTarget ? 'btn-navy' : ''}"
                        onclick="App.setQuickAddTargetSection(${sIdx})"
                        title="Chọn nhóm này làm điểm đến cho bộ công cụ thêm nhanh thiết bị & nạp hệ tháp ở trên">
                  ${isActiveTarget ? ' Đang chọn thêm nhanh' : ' Chọn thêm nhanh'}
                </button>
                <button class="btn btn-sm btn-primary" onclick="App.addBlankItem(${sIdx})">
                  + Thêm Hạng Mục
                </button>
                ${q.sections.length > 1 ? `
                  <button class="btn btn-sm btn-danger" onclick="App.removeSection(${sIdx})" title="Xóa nhóm này">
                    Xóa
                  </button>
                ` : ''}
              </div>
            </div>

            ${secInstInfo.hasTower ? `
              <div class="sec-default-strip">
                <div>
                  ${sec.model_ref ? `<strong>${esc(sec.model_ref.product_line)} - Model ${esc(sec.model_ref.model_code)}</strong> · ` : ''}
                  <strong>✓ TB mặc định đi kèm:</strong>
                  ${secInstInfo.defaults.map(d => d.isIncluded
                    ? `<span class="tag-included" style="font-size:11px;">${esc(d.name_vi)} x${d.default_qty || 1}</span>`
                    : `<span class="tag-excluded" style="font-size:11px;">Đã bỏ: ${esc(d.name_vi)}</span>`
                  ).join(' ')}
                </div>
                <span style="font-weight:700; color:var(--navy);">Option / TB thêm: ${secInstInfo.optionCount} mục</span>
              </div>
            ` : ''}

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width:62px" class="c" title="Bỏ tích để không báo giá hạng mục này (giữ lại dòng để đối chiếu)">Báo giá / STT</th>
                    ${priceDisplayMode === 'custom_groups' ? '<th style="width:36px" class="c" title="Chọn nhiều dòng để gộp thành 1 nhóm giá">Gộp</th>' : ''}
                    <th style="width:118px; min-width:110px;">Tên tiếng Nhật</th>
                    <th style="min-width:290px;">Tên hạng mục & Thông số / Cấu hình đi kèm</th>
                    <th style="width:76px" class="c">Đơn vị</th>
                    <th style="width:62px" class="r">SL</th>
                    ${showCost ? '<th style="width:120px" class="r cost-col">Giá Cost (VND)</th>' : ''}
                    <th style="width:125px" class="r">Giá gốc cơ bản</th>
                    <th style="width:125px" class="r" title="Hệ số nhân điều chỉnh cho từng hạng mục (Đơn giá = Giá gốc × Hệ số)">Chênh lệch</th>
                    <th style="width:130px" class="r">Đơn giá sau ĐC</th>
                    <th style="width:130px" class="r">Thành tiền</th>
                    <th style="width:105px">Ghi chú</th>
                    <th style="width:44px" class="c">Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  ${(sec.items || []).map((it, iIdx) => {
        const isIncluded = it.included !== false;
        const belowCost = isIncluded && showCost && it.cost_price && it.unit_price < it.cost_price;
        const itemKey = `${sIdx}:${iIdx}`;
        const isCheckedForGroup = (state.selectedGroupItemKeys || []).includes(itemKey);
        const compBreakdown = (it.item_type === 'tower_bundle') ? hydrateTowerBundleBreakdown(it, q, sec) : null;
        return `
                      <tr class="${isIncluded ? '' : 'row-excluded'}">
                        <td class="c">
                          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
                            <input type="checkbox" ${isIncluded ? 'checked' : ''}
                                   style="width:15px;height:15px;cursor:pointer;"
                                   title="${isIncluded ? 'Đang tính vào báo giá (Bỏ tích để KHÔNG báo giá mục này)' : 'Đang ẩn / KHÔNG báo giá (Tích để tính lại)'}"
                                   onchange="App.toggleItemIncluded(${sIdx}, ${iIdx}, this.checked)">
                            <input type="text" style="width:34px;text-align:center;padding:3px" value="${esc(it.stt)}"
                                   oninput="App.updateItemField(${sIdx}, ${iIdx}, 'stt', this.value)">
                          </div>
                          ${!isIncluded ? '<div style="margin-top:2px;"><span class="tag-excluded" style="font-size:9.5px;">Không BG</span></div>' : ''}
                        </td>
                        ${priceDisplayMode === 'custom_groups' ? `
                          <td class="c">
                            <input type="checkbox" ${isCheckedForGroup ? 'checked' : ''} ${!isIncluded ? 'disabled' : ''}
                                   style="width:15px;height:15px;cursor:pointer;"
                                   onchange="App.toggleGroupSelectItem('${itemKey}', this.checked)">
                          </td>
                        ` : ''}
                        <td>
                          <input type="text" style="width:100%;padding:5px" value="${esc(it.name_jp || '')}" placeholder="洗浄塔 / 排気ファン"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'name_jp', this.value)">
                        </td>
                        <td>
                          <input type="text" class="excl-strike" style="width:100%;font-weight:700;margin-bottom:4px;" value="${esc(it.name_vi || '')}"
                                 placeholder="Tên thiết bị / dịch vụ..."
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'name_vi', this.value)">
                          <input type="text" style="width:100%;font-size:12px;color:#374151;" value="${esc(it.specs_text || '')}"
                                 placeholder="Dòng thông số phụ (VD: 2,100 CMH  750 Pa  1.5 Kw, 3phase, 380V...)"
                                 oninput="App.updateItemField(${sIdx}, ${iIdx}, 'specs_text', this.value)">
                          ${(specDetailLevel === 'basic' && it.specs_text && formatSpecForLevel(it.specs_text, 'basic') !== it.specs_text.trim()) ? `
                            <div style="font-size:11px;color:#0369a1;margin-top:2px;">
                              Rút gọn: <strong>${esc(formatSpecForLevel(it.specs_text, 'basic'))}</strong>
                            </div>
                          ` : ''}

                          ${priceDisplayMode === 'custom_groups' ? `
                            <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                              <span style="font-size:11px;font-weight:700;color:#1d4ed8;">Nhóm gộp giá:</span>
                              <input type="text" style="flex:1;max-width:240px;padding:2px 6px;font-size:11.5px;border-color:#93c5fd;background:#eff6ff;"
                                     value="${esc(it.merge_group || '')}"
                                     placeholder="Để trống = báo giá tách riêng"
                                     oninput="App.updateItemField(${sIdx}, ${iIdx}, 'merge_group', this.value)">
                              ${it.merge_group ? `<button type="button" class="btn btn-sm" style="padding:1px 6px;font-size:10.5px;" onclick="App.clearItemMergeGroup(${sIdx}, ${iIdx})">Tách</button>` : ''}
                            </div>
                          ` : ''}

                          ${compBreakdown ? `
                            <div class="comp-toggle-strip">
                              <strong style="color:var(--navy);">Cấu phần gói (bỏ tích để trừ giá):</strong>
                              ${['tower', 'fan', 'pump', 'panel', 'stage'].map(ck => {
                                const cObj = compBreakdown[ck];
                                if (!cObj) return '';
                                const cOn = cObj.included !== false;
                                return `
                                  <label class="comp-toggle-chip ${cOn ? '' : 'is-off'}" title="${esc(cObj.label)}: ${fmtVnd(cObj.base)} đ">
                                    <input type="checkbox" ${cOn ? 'checked' : ''}
                                           onchange="App.toggleBundleComponent(${sIdx}, ${iIdx}, '${ck}', this.checked)">
                                    ${esc(cObj.shortLabel || ck)}
                                  </label>
                                `;
                              }).join('')}
                            </div>
                          ` : ''}

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
                                        title="${sl.component_key ? 'Xóa dòng này sẽ trừ luôn giá cấu phần tương ứng khỏi gói' : 'Xóa dòng mô tả con'}"
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
                          <input type="number" id="input-qty-${sIdx}-${iIdx}" class="num" style="width:54px;padding:5px" min="1" value="${it.quantity || 1}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'quantity', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'quantity', this)">
                        </td>
                        ${showCost ? `
                          <td class="r cost-col">
                            <input type="number" id="input-cost-${sIdx}-${iIdx}" class="num" style="width:110px;padding:5px;background:#fffbeb" min="0" value="${it.cost_price || 0}"
                                   onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                   oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'cost_price', this.value, this)"
                                   onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'cost_price', this)">
                          </td>
                        ` : ''}
                        <td class="r">
                          <input type="number" id="input-base-${sIdx}-${iIdx}" class="num" style="width:116px;padding:5px" min="0" value="${it.base_price || 0}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'base_price', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'base_price', this)">
                        </td>
                        <td class="r">
                          <div style="display:flex;align-items:center;justify-content:flex-end;gap:3px;">
                            <span style="font-size:12px;color:var(--muted);font-weight:700;">×</span>
                            <input type="number" id="input-adj-${sIdx}-${iIdx}" class="num" min="0" step="0.01"
                                   style="width:90px;padding:5px;color:${Number(it.adjustment ?? 1) < 1 ? 'var(--red)' : Number(it.adjustment ?? 1) > 1 ? 'var(--green)' : 'inherit'};font-weight:700;"
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
                          <input type="number" id="input-unit-${sIdx}-${iIdx}" class="num" style="width:120px;padding:5px;font-weight:700;background:#f0fdf4;" min="0"
                                 value="${it.unit_price || 0}"
                                 onkeydown="if(event.key==='-'||event.key==='e'||event.key==='E')event.preventDefault()"
                                 oninput="App.updateItemPriceCalc(${sIdx}, ${iIdx}, 'unit_price', this.value, this)"
                                 onblur="App.handleItemPriceBlur(${sIdx}, ${iIdx}, 'unit_price', this)">
                          <div id="below-cost-${sIdx}-${iIdx}" style="color:var(--red);font-size:10.5px;font-weight:700;display:${belowCost ? 'block' : 'none'};">⚠️ Thấp hơn Cost!</div>
                        </td>
                        <td class="r" id="cell-total-${sIdx}-${iIdx}" style="font-weight:700;">
                          ${isIncluded ? fmtVnd(it.total_price) : '<span style="color:#94a3b8;">0</span>'}
                        </td>
                        <td>
                          <input type="text" style="width:96px;padding:5px" value="${esc(it.remark || '')}" placeholder="KYOWA JP..."
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
                      <td colspan="${(showCost ? 9 : 8) + (priceDisplayMode === 'custom_groups' ? 1 : 0)}" class="r">${esc(sec.subtotalLabel || 'Cộng nhóm')}</td>
                      <td class="r" id="sec-subtotal-${sIdx}">${fmtVnd(sec.subtotal)}</td>
                      <td colspan="2"></td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }).join('')}
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
              ⑤ Ghi chú phạm vi Lắp đặt, Vận chuyển & điều kiện áp dụng (Mã 12)
              <div class="note-preset-row">
                <button type="button" class="btn btn-sm" onclick="App.applyNote5InstallPreset('none')">Chưa gồm Lắp đặt & VC</button>
                <button type="button" class="btn btn-sm" onclick="App.applyNote5InstallPreset('ship_only')">Đã gồm VC, chưa Lắp đặt</button>
                <button type="button" class="btn btn-sm" onclick="App.applyNote5InstallPreset('install_only')">Đã gồm Lắp đặt, chưa VC</button>
                <button type="button" class="btn btn-sm" onclick="App.applyNote5InstallPreset('both')">Đã gồm cả Lắp đặt & VC</button>
                <button type="button" class="btn btn-sm btn-navy" onclick="App.syncNote5FromServices()"
                        title="Tự động điền ghi chú theo trạng thái mục Vận chuyển (${svcCov.hasShip ? 'Có' : 'Chưa có'}) & Lắp đặt (${svcCov.hasInstall ? 'Có' : 'Chưa có'}) đang có trong báo giá">
                  🔄 Tự khớp theo DV (${svcCov.hasShip ? 'Có VC' : 'Ko VC'} · ${svcCov.hasInstall ? 'Có LĐ' : 'Ko LĐ'})
                </button>
              </div>
              <textarea id="note5Textarea" rows="2" oninput="App.updateTermField('note_5_vi', this.value)">${esc(q.terms?.note_5_vi || '')}</textarea>
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

  function onSelectPicUser(val) {
    const q = state.activeQuote;
    if (!q) return;

    const customInput = document.getElementById('picNameCustomInput');
    const phoneInput = document.getElementById('picPhoneInput');

    if (val === '__custom__') {
      q._customPic = true;
      if (customInput) {
        customInput.style.display = 'block';
        customInput.focus();
      }
      return;
    }

    const user = (state.users || []).find(u => String(u.id) === String(val));
    if (!user) return;

    q._customPic = false;
    q.pic_name = user.full_name || '';
    q.pic_phone = user.phone || '';

    if (customInput) {
      customInput.value = q.pic_name;
      customInput.style.display = 'none';
    }
    if (phoneInput) {
      phoneInput.value = q.pic_phone;
    }
    toast(`Đã chọn Người đảm trách (PIC): ${q.pic_name}${q.pic_phone ? ` (SĐT: ${q.pic_phone})` : ''}`);
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

  function toggleAutoCalcMgmt(checked) {
    const q = state.activeQuote;
    if (!q) return;
    q.terms = q.terms || {};
    q.terms.auto_calc_mgmt = Boolean(checked);
    recalcActiveQuoteTotals();
    renderFlow2();
    toast(checked ? 'Đã bật tự động tính lại Phí QL & Thiết kế theo tổng thiết bị.' : 'Đã tắt tự động tính Phí QL & Thiết kế (cho phép nhập tay).');
  }

  function setQuickAddTargetSection(idx) {
    const q = state.activeQuote;
    if (!q || !q.sections || q.sections.length === 0) return;
    const safeIdx = Math.min(Math.max(0, Number(idx || 0)), q.sections.length - 1);
    state.quickAddTargetSecIdx = safeIdx;
    renderFlow2();
  }

  function setQuickTowerProdLine(pl) {
    state.quickTowerProdLine = pl;
    const list = state.models.filter(m => m.product_line === pl);
    if (list.length > 0) {
      state.quickTowerModelCode = String(list[0].model_code);
    }
    renderFlow2();
  }

  function setQuickTowerModelCode(code) {
    state.quickTowerModelCode = String(code);
    renderFlow2();
  }

  function setQuickTowerInsertMode(mode) {
    state.quickTowerInsertMode = mode === 'tower_bundle' ? 'tower_bundle' : 'itemized';
  }

  function getSelectedQuickTowerModel() {
    const list = state.models.filter(m => m.product_line === state.quickTowerProdLine);
    return list.find(m => String(m.model_code) === String(state.quickTowerModelCode)) || list[0] || state.models[0];
  }

  function insertTowerIntoSection(secIdx) {
    const q = state.activeQuote;
    const m = getSelectedQuickTowerModel();
    if (!q || !m) return;
    if (!q.sections || q.sections.length === 0) {
      q.sections = [{ id: 'sec-1', code: 'A1./ Khu vực 1', title: 'A1./ Khu vực 1', showSubtotal: true, subtotalLabel: 'TOTAL (A1)', items: [] }];
    }
    const safeIdx = Math.min(Math.max(0, Number(secIdx || 0)), q.sections.length - 1);
    const sec = q.sections[safeIdx];
    const newItems = buildItemsForTowerModel(m, state.quickTowerInsertMode || 'itemized', {}, {}, `s${safeIdx}-${Date.now()}`);
    sec.items = sec.items || [];
    sec.model_ref = { product_line: m.product_line, model_code: String(m.model_code) };
    sec.excluded_default_insts = sec.excluded_default_insts || {};
    newItems.forEach(ni => {
      sec.items.push(ni);
    });
    renumberSectionItems(sec);
    state.quickAddTargetSecIdx = safeIdx;
    recalcActiveQuoteTotals();
    renderFlow2();
    toast(`Đã nạp Hệ tháp ${m.product_line} - Model ${m.model_code} vào "${sec.title || `Khu vực ${safeIdx + 1}`}" (tự động cập nhật Phí QL/TK & tổng)!`);
  }

  function addNewAreaWithTower() {
    const q = state.activeQuote;
    const m = getSelectedQuickTowerModel();
    if (!q || !m) return;
    q.sections = q.sections || [];

    // Đếm các khu vực sản xuất hiện có (trước mục B./Khác nếu có) để đặt tên gọn A1, A2, A3...
    const secBIdx = q.sections.findIndex(s => {
      const t = `${s.code || ''} ${s.title || ''}`.toLowerCase();
      return t.startsWith('b.') || t.startsWith('b/') || t.includes('khác') || t.includes('dịch vụ');
    });
    const prodSecCount = secBIdx >= 0 ? secBIdx : q.sections.length;
    const areaNum = prodSecCount + 1;
    const areaTitle = `A${areaNum}./ Khu vực ${areaNum} – Hệ tháp ${m.product_line} Model ${m.model_code}`;
    const newItems = buildItemsForTowerModel(m, state.quickTowerInsertMode || 'itemized', {}, {}, `area${areaNum}-${Date.now()}`);

    const newSec = {
      id: 'sec-' + Date.now(),
      code: areaTitle,
      title: areaTitle,
      showSubtotal: true,
      subtotalLabel: `TOTAL (A${areaNum})`,
      bundleMode: state.quickTowerInsertMode === 'tower_bundle' ? 'bundled_set' : 'itemized',
      model_ref: { product_line: m.product_line, model_code: String(m.model_code) },
      excluded_default_insts: {},
      items: newItems
    };

    let insertAt = q.sections.length;
    if (secBIdx >= 0) {
      q.sections.splice(secBIdx, 0, newSec);
      insertAt = secBIdx;
    } else {
      q.sections.push(newSec);
      insertAt = q.sections.length - 1;
    }

    state.quickAddTargetSecIdx = insertAt;
    recalcActiveQuoteTotals();
    renderFlow2();
    toast(`Đã tạo "${areaTitle}" kèm đầy đủ cấu hình & tự động cập nhật Phí QL/TK!`);
  }

  function setQuotePriceDisplayMode(mode) {
    const q = state.activeQuote;
    if (!q) return;
    q.terms = q.terms || {};
    q.terms.price_display_mode = mode;
    if (mode !== 'custom_groups') {
      state.selectedGroupItemKeys = [];
    }
    if (state.activeTab === 'print') {
      renderPrintView();
    } else {
      renderFlow2();
    }
    const modeNames = {
      itemized: 'Chi tiết từng thiết bị',
      per_section: '1 giá từng hệ / khu vực',
      single_total: '1 giá tổng toàn bộ',
      custom_groups: 'Gộp nhóm linh hoạt'
    };
    toast(`Chế độ hiển thị giá: ${modeNames[mode] || mode} (Tổng báo giá không thay đổi).`);
  }

  function setQuoteSpecDetailLevel(level) {
    const q = state.activeQuote;
    if (!q) return;
    q.terms = q.terms || {};
    q.terms.spec_detail_level = level === 'basic' ? 'basic' : 'detailed';
    if (state.activeTab === 'print') {
      renderPrintView();
    } else {
      renderFlow2();
    }
    toast(level === 'basic'
      ? 'Thông số gửi khách: Bản cơ bản gọn (ẩn kW, pha, V, Hz, 4P, IE3; vẫn lưu đủ dữ liệu gốc).'
      : 'Thông số gửi khách: Bản chi tiết đầy đủ.'
    );
  }

  function setCustomGroupNameInput(val) {
    state.customGroupNameInput = val;
  }

  function toggleGroupSelectItem(itemKey, checked) {
    const cur = new Set(state.selectedGroupItemKeys || []);
    if (checked) cur.add(itemKey);
    else cur.delete(itemKey);
    state.selectedGroupItemKeys = Array.from(cur);
    const cntEl = document.getElementById('groupSelCount');
    if (cntEl) cntEl.textContent = state.selectedGroupItemKeys.length;
  }

  function mergeSelectedItemsIntoGroup() {
    const q = state.activeQuote;
    if (!q) return;
    const keys = state.selectedGroupItemKeys || [];
    if (keys.length < 2) {
      toast('Vui lòng tích chọn ít nhất 2 hạng mục ở cột "Gộp" để gộp thành 1 nhóm giá!');
      return;
    }
    const inp = document.getElementById('customGroupNameInput');
    let groupName = (inp ? inp.value : state.customGroupNameInput || '').trim();
    if (!groupName) {
      const existingCount = new Set(
        (q.sections || []).flatMap(s => (s.items || []).map(x => String(x.merge_group || '').trim()).filter(Boolean))
      ).size;
      groupName = `Nhóm gộp thiết bị ${existingCount + 1}`;
    }
    let count = 0;
    keys.forEach(k => {
      const [sIdx, iIdx] = k.split(':').map(Number);
      const it = q.sections?.[sIdx]?.items?.[iIdx];
      if (it && it.included !== false) {
        it.merge_group = groupName;
        count++;
      }
    });
    state.selectedGroupItemKeys = [];
    state.customGroupNameInput = '';
    renderFlow2();
    toast(`Đã gộp ${count} hạng mục vào nhóm "${groupName}" (hiển thị 1 giá chung khi in/xuất)!`);
  }

  function ungroupSelectedItems() {
    const q = state.activeQuote;
    if (!q) return;
    const keys = state.selectedGroupItemKeys || [];
    if (keys.length === 0) {
      toast('Vui lòng tích chọn ít nhất 1 hạng mục để tách khỏi nhóm gộp.');
      return;
    }
    keys.forEach(k => {
      const [sIdx, iIdx] = k.split(':').map(Number);
      const it = q.sections?.[sIdx]?.items?.[iIdx];
      if (it) it.merge_group = '';
    });
    state.selectedGroupItemKeys = [];
    renderFlow2();
    toast('Đã tách các hạng mục đã chọn về hiển thị giá riêng lẻ.');
  }

  function clearItemMergeGroup(sIdx, iIdx) {
    const it = state.activeQuote?.sections?.[sIdx]?.items?.[iIdx];
    if (!it) return;
    it.merge_group = '';
    renderFlow2();
  }

  function toggleItemIncluded(sIdx, iIdx, checked) {
    const q = state.activeQuote;
    const sec = q?.sections?.[sIdx];
    const it = sec?.items?.[iIdx];
    if (!it) return;
    it.included = Boolean(checked);
    renumberSectionItems(sec);
    recalcActiveQuoteTotals();
    renderFlow2();
    toast(checked
      ? `Đã đưa "${it.name_vi || 'hạng mục'}" vào báo giá & cập nhật lại STT, tổng giá.`
      : `Đã bỏ "${it.name_vi || 'hạng mục'}" khỏi báo giá (giữ lại dòng để đối chiếu, tự động cập nhật STT & tính lại phí/VAT).`
    );
  }

  function toggleBundleComponent(sIdx, iIdx, compKey, checked) {
    const q = state.activeQuote;
    const sec = q?.sections?.[sIdx];
    const it = sec?.items?.[iIdx];
    if (!it) return;
    const bd = hydrateTowerBundleBreakdown(it, q, sec);
    if (!bd || !bd[compKey]) return;

    bd[compKey].included = Boolean(checked);
    recomputeTowerBundleFromBreakdown(it);

    // Đồng bộ lại sub_lines tương ứng khi bật/tắt cấu phần trong gói (Mã 04)
    const refProd = it.model_ref?.product_line || sec?.model_ref?.product_line || q?.selected_product_line;
    const refCode = it.model_ref?.model_code || sec?.model_ref?.model_code || q?.selected_model_code;
    const m = (state.models || []).find(x => x.product_line === refProd && String(x.model_code) === String(refCode));
    if (m) {
      const exclMap = {};
      Object.keys(bd).forEach(k => { exclMap[k] = bd[k].included === false; });
      // Giữ lại các dòng con tùy chỉnh người dùng tự thêm (không có component_key và không phải is_header)
      const customLines = (it.sub_lines || []).filter(sl => !sl.component_key && !sl.is_header && !sl.is_default_inst);
      it.sub_lines = [
        ...buildTowerSubLinesFromModel(m, exclMap, sec?.excluded_default_insts || {}),
        ...customLines
      ];
    } else if (!checked) {
      it.sub_lines = (it.sub_lines || []).filter(sl => sl.component_key !== compKey);
    }

    recalcActiveQuoteTotals();
    renderFlow2();
    toast(`${checked ? 'Đã chọn lại' : 'Đã bỏ'} "${bd[compKey].shortLabel}" (${checked ? '+' : '-'}${fmtVnd(bd[compKey].base)} đ) — đã tự động tính lại giá, phí QL/TK & VAT!`);
  }

  function applyNote5InstallPreset(preset) {
    const q = state.activeQuote;
    if (!q) return;
    q.terms = q.terms || {};
    if (preset === 'none') {
      q.terms.note_5_vi = 'Giá trên chưa bao gồm chi phí lắp đặt và vận chuyển.';
    } else if (preset === 'ship_only') {
      q.terms.note_5_vi = 'Giá trên đã bao gồm chi phí vận chuyển, chưa bao gồm chi phí lắp đặt tại công trình.';
    } else if (preset === 'install_only') {
      q.terms.note_5_vi = 'Giá trên đã bao gồm chi phí lắp đặt tại công trình, chưa bao gồm chi phí vận chuyển.';
    } else if (preset === 'both') {
      q.terms.note_5_vi = 'Kích thước tháp chỉ dùng để tham khảo, kích thước chính xác phụ thuộc vào bản vẽ.\nBG trên chưa bao gồm phí nâng hạ tại công trình và cẩu đưa vào vị trí lắp đặt.';
    }
    const ta = document.getElementById('note5Textarea');
    if (ta) ta.value = q.terms.note_5_vi;
    toast('Đã cập nhật Ghi chú ⑤ về Lắp đặt & Vận chuyển!');
  }

  function syncNote5FromServices() {
    const q = state.activeQuote;
    if (!q) return;
    const { hasShip, hasInstall } = detectServiceCoverage(q);
    if (!hasShip && !hasInstall) applyNote5InstallPreset('none');
    else if (hasShip && !hasInstall) applyNote5InstallPreset('ship_only');
    else if (!hasShip && hasInstall) applyNote5InstallPreset('install_only');
    else applyNote5InstallPreset('both');
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
          it._manualMgmtPrice = false;
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
        included: true,
        merge_group: '',
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
      renumberAllSections(q);
      renderFlow2();
      toast(`Đã thêm và áp dụng Chi phí quản lý, thiết kế (${cleanPct}% = ${fmtVnd(mgmtInfo.base)} đ)!`);
      return;
    }

    const titleEl = document.getElementById('mgmtFeePctTitle');
    if (titleEl) titleEl.textContent = cleanPct;
    const hintEl = document.getElementById('mgmtFeeCalcHint');
    if (hintEl) {
      hintEl.textContent = `= ${cleanPct}% × ${fmtVnd(mgmtInfo.prodBaseSum)} đ (tổng thiết bị ${mgmtInfo.areaCount > 1 ? `${mgmtInfo.areaCount} khu vực` : 'sản xuất'}) = ${fmtVnd(mgmtInfo.base)} đ`;
    }
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

  function findOrCreateServiceSectionB(q, createIfMissing = false) {
    if (!q) return { secB: null, secBIdx: -1 };
    q.sections = q.sections || [];
    let secBIdx = q.sections.findIndex((s, idx) => {
      if (idx === 0) return false;
      const t = `${s.code || ''} ${s.title || ''}`.trim().toLowerCase();
      return t.startsWith('b.') || t.startsWith('b/') || t.includes('khác') || t.includes('dịch vụ');
    });
    if (secBIdx < 0 && createIfMissing) {
      const newSecB = {
        id: 'sec-b',
        code: 'B./他Khác',
        title: 'B./他Khác',
        showSubtotal: true,
        subtotalLabel: 'TOTAL (B)',
        items: []
      };
      q.sections.push(newSecB);
      secBIdx = q.sections.length - 1;
    }
    return { secB: secBIdx >= 0 ? q.sections[secBIdx] : null, secBIdx };
  }

  function handleMgmtFeeModeChange(mode) {
    const q = state.activeQuote;
    if (!q) return;
    q.mgmt_fee_mode = mode;
    q.sections = q.sections || [];

    const mgmtInfo = computeMgmtFeeAmounts(q);
    const defaultMgmtCost = mgmtInfo.cost;
    const defaultMgmtBase = mgmtInfo.base;
    const mgmtPct = mgmtInfo.pct;

    if (mode === 'separate_to_b') {
      // Phương án 1: Chỉ đặt 1 dòng Phí QL/TK tại mục B. Khác; loại bỏ dòng Phí QL/TK ở các mục sản xuất A
      const { secB, secBIdx } = findOrCreateServiceSectionB(q, true);
      q.sections.forEach((sec, idx) => {
        if (idx !== secBIdx) {
          sec.items = (sec.items || []).filter(it => !isMgmtFeeItem(it));
        }
      });
      if (secB) {
        secB.items = secB.items || [];
        const existingInB = secB.items.find(it => isMgmtFeeItem(it));
        if (!existingInB) {
          secB.items.unshift({
            id: 'mgmt-b-' + Date.now(),
            stt: '1',
            item_type: 'service_mgmt',
            mgmt_role: 'primary_b',
            included: true,
            merge_group: '',
            name_jp: '現場管理・設計・試運転費',
            name_vi: 'Thiết kế, quản lí, vận hành',
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
        } else {
          existingInB.mgmt_role = 'primary_b';
          existingInB.name_vi = 'Thiết kế, quản lí, vận hành';
          if (existingInB.remark === 'Bổ sung riêng') existingInB.remark = '';
        }
      }
      renumberAllSections(q);
      recalcActiveQuoteTotals();
      renderFlow2();
      toast(`Phương án 1: Đã tách Phí QL & Thiết kế (${mgmtPct}% = ${fmtVnd(defaultMgmtBase)} đ) sang mục B. Khác (đánh lại STT tự động).`);
    } else if (mode === 'included_in_a') {
      // Phương án 2: Chỉ đặt 1 dòng Phí QL/TK gộp chung trong mục Sản xuất A; bỏ dòng Phí QL/TK khỏi mục B
      q.sections.forEach((sec, idx) => {
        if (idx > 0) {
          sec.items = (sec.items || []).filter(it => !isMgmtFeeItem(it));
        }
      });
      if (q.sections[0]) {
        q.sections[0].items = q.sections[0].items || [];
        const existingInA = q.sections[0].items.find(it => isMgmtFeeItem(it));
        if (!existingInA) {
          q.sections[0].items.push({
            id: 'mgmt-a-' + Date.now(),
            stt: String(q.sections[0].items.length + 1),
            item_type: 'service_mgmt',
            mgmt_role: 'primary_a',
            included: true,
            merge_group: '',
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
        } else {
          existingInA.mgmt_role = 'primary_a';
          existingInA.name_vi = `Chi phí quản lý, thiết kế (${mgmtPct}%)`;
        }
      }
      renumberAllSections(q);
      recalcActiveQuoteTotals();
      renderFlow2();
      toast(`Phương án 2: Đã gộp Phí QL & Thiết kế (${mgmtPct}% = ${fmtVnd(defaultMgmtBase)} đ) vào mục A và bỏ khỏi mục B (đánh lại STT tự động).`);
    } else if (mode === 'additional') {
      // Phương án 3: Giữ nguyên khoản Phí QL/TK cơ bản trong mục A VÀ cộng bổ sung riêng 1 dòng Phí QL/TK tại mục B. Khác
      const { secB, secBIdx } = findOrCreateServiceSectionB(q, true);
      q.sections.forEach((sec, idx) => {
        if (idx > 0 && idx !== secBIdx) {
          sec.items = (sec.items || []).filter(it => !isMgmtFeeItem(it));
        }
      });

      if (q.sections[0]) {
        q.sections[0].items = q.sections[0].items || [];
        const existingInA = q.sections[0].items.find(it => isMgmtFeeItem(it));
        if (!existingInA) {
          q.sections[0].items.push({
            id: 'mgmt-a-' + Date.now(),
            stt: String(q.sections[0].items.length + 1),
            item_type: 'service_mgmt',
            mgmt_role: 'primary_a',
            included: true,
            merge_group: '',
            name_jp: '現場管理・設計・試運転費',
            name_vi: `Chi phí quản lý, thiết kế cơ bản (${mgmtPct}%)`,
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
        } else {
          existingInA.mgmt_role = 'primary_a';
          existingInA.name_vi = `Chi phí quản lý, thiết kế cơ bản (${mgmtPct}%)`;
        }
      }

      if (secB) {
        secB.items = secB.items || [];
        const existingInB = secB.items.find(it => isMgmtFeeItem(it));
        if (!existingInB) {
          secB.items.unshift({
            id: 'mgmt-b-add-' + Date.now(),
            stt: '1',
            item_type: 'service_mgmt',
            mgmt_role: 'additional_b',
            included: true,
            merge_group: '',
            name_jp: '現場管理・設計・試運転費',
            name_vi: 'Thiết kế, quản lý hiện trường & vận hành (bổ sung)',
            specs_text: '',
            unit: 'Lot/Lần',
            quantity: 1,
            cost_price: defaultMgmtCost,
            base_price: defaultMgmtBase,
            adjustment: 1,
            unit_price: defaultMgmtBase,
            total_price: defaultMgmtBase,
            remark: 'Bổ sung riêng'
          });
        } else {
          existingInB.mgmt_role = 'additional_b';
          existingInB.name_vi = 'Thiết kế, quản lý hiện trường & vận hành (bổ sung)';
          if (!existingInB.remark) existingInB.remark = 'Bổ sung riêng';
        }
      }

      renumberAllSections(q);
      recalcActiveQuoteTotals();
      renderFlow2();
      toast(`Phương án 3: Giữ phí cơ bản (${fmtVnd(defaultMgmtBase)} đ) ở mục A + Cộng thêm phí bổ sung riêng ở mục B!`);
    }
  }

  function setQuickAddSelection(selectId, val) {
    state.quickAddSelectedIds = state.quickAddSelectedIds || {};
    if (selectId) {
      state.quickAddSelectedIds[selectId] = String(val ?? '');
    }
  }

  function quickAddEquipment(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel || !state.activeQuote) return;
    const eqId = Number(sel.value);
    const eq = state.equipment.find(e => e.id === eqId);
    if (!eq) return;

    // Giữ nguyên mục vừa chọn trên tất cả các ô select thêm nhanh (không bị nhảy về mục đầu tiên sau khi render lại)
    state.quickAddSelectedIds = state.quickAddSelectedIds || {};
    ['quickAddInstSelect', 'quickAddFanPumpSelect', 'quickAddServiceSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value !== undefined && el.value !== '') {
        state.quickAddSelectedIds[id] = String(el.value);
      }
    });
    state.quickAddSelectedIds[selectId] = String(eq.id);

    const q = state.activeQuote;
    if (!q.sections || q.sections.length === 0) {
      q.sections = [{ id: 'sec-1', code: '', title: '', showSubtotal: false, items: [] }];
    }

    // Mã 01: Tôn trọng đúng Khu vực / Nhóm đích người dùng đang chọn!
    const targetSelect = document.getElementById('quickAddTargetSectionSelect');
    const chosenIdx = targetSelect ? Number(targetSelect.value) : Number(state.quickAddTargetSecIdx || 0);
    const targetSecIdx = Math.min(Math.max(0, Number.isFinite(chosenIdx) ? chosenIdx : 0), q.sections.length - 1);
    state.quickAddTargetSecIdx = targetSecIdx;
    const sec = q.sections[targetSecIdx];
    const secName = sec.title || sec.code || `Khu vực ${targetSecIdx + 1}`;

    // Mã 03: Chỉ gắn cảnh báo "đã gồm mặc định" nếu CHÍNH khu vực đích này đang có hệ tháp
    const targetHasTower = sectionHasTower(sec);
    const isAlreadyIncludedInTarget = Boolean(eq.is_default_included && targetHasTower && !(sec.excluded_default_insts && sec.excluded_default_insts[eq.id]));

    if (isAlreadyIncludedInTarget) {
      toast(`Lưu ý: "${eq.name_vi}" đã gồm mặc định (${eq.default_qty} cái) trong hệ tháp tại "${secName}". Đã gắn nhãn mua thêm ngoài gói mặc định!`);
    }

    sec.items = sec.items || [];
    const nextStt = String(sec.items.length + 1);
    sec.items.push({
      id: 'item-' + Date.now(),
      stt: nextStt,
      item_type: eq.category,
      included: true,
      merge_group: '',
      name_jp: eq.name_jp || '',
      name_vi: eq.name_vi + (isAlreadyIncludedInTarget ? ' (Mua thêm ngoài gói mặc định)' : ''),
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

    renumberSectionItems(sec);
    recalcActiveQuoteTotals();
    renderFlow2();
    toast(`Đã thêm "${eq.name_vi}" vào "${secName}"!`);
  }

  function updateSectionField(sIdx, field, val) {
    const sec = state.activeQuote?.sections?.[sIdx];
    if (!sec) return;
    sec[field] = val;
    if (field === 'title') {
      sec.code = val;
      const sel = document.getElementById('quickAddTargetSectionSelect');
      if (sel && sel.options[sIdx]) {
        sel.options[sIdx].textContent = `[${sIdx + 1}] ${val || `Nhóm ${sIdx + 1}`} (${(sec.items || []).filter(x => x.included !== false).length} mục)`;
      }
    }
    if (field === 'showSubtotal') renderFlow2();
  }

  function addSection() {
    if (!state.activeQuote) return;
    state.activeQuote.sections = state.activeQuote.sections || [];
    const idx = state.activeQuote.sections.length + 1;
    state.activeQuote.sections.push({
      id: 'sec-' + Date.now(),
      code: `Khu vực ${idx}`,
      title: `Khu vực / Nhóm ${idx}`,
      showSubtotal: true,
      subtotalLabel: `TOTAL (${idx})`,
      items: []
    });
    state.quickAddTargetSecIdx = state.activeQuote.sections.length - 1;
    renderFlow2();
    toast(`Đã tạo "Khu vực / Nhóm ${idx}" và chọn sẵn làm đích thêm nhanh!`);
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
        if (state.quickAddTargetSecIdx >= state.activeQuote.sections.length) {
          state.quickAddTargetSecIdx = Math.max(0, state.activeQuote.sections.length - 1);
        }
        state.selectedGroupItemKeys = [];
        recalcActiveQuoteTotals();
        renderFlow2();
        toast(`Đã xóa nhóm "${secTitle}" & cập nhật lại tổng.`);
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
      included: true,
      merge_group: '',
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
    renumberSectionItems(sec);
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
        renumberSectionItems(sec);
        state.selectedGroupItemKeys = [];
        recalcActiveQuoteTotals();
        renderFlow2();
        toast(`Đã xóa hạng mục "${itemName}" & tự động đánh lại STT, tính lại phí, VAT.`);
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
          const isBelow = (it.included !== false) && showCost && it.cost_price && it.unit_price < it.cost_price;
          belowCostEl.style.display = isBelow ? 'block' : 'none';
        }

        const cellTotal = document.getElementById(`cell-total-${sIdx}-${iIdx}`);
        if (cellTotal) cellTotal.innerHTML = (it.included !== false) ? fmtVnd(it.total_price) : '<span style="color:#94a3b8;">0</span>';
      });

      const secSub = document.getElementById(`sec-subtotal-${sIdx}`);
      if (secSub) secSub.textContent = fmtVnd(sec.subtotal);
    });

    const allItems = (q.sections || []).flatMap(s => s.items || []).filter(x => x.included !== false);
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
      mgmtHint.textContent = `= ${mgmtInfo.pct}% × ${fmtVnd(mgmtInfo.prodBaseSum)} đ (tổng thiết bị ${mgmtInfo.areaCount > 1 ? `${mgmtInfo.areaCount} khu vực` : 'sản xuất'}) = ${fmtVnd(mgmtInfo.base)} đ`;
    }
  }

  function updateItemPriceCalc(sIdx, iIdx, field, rawVal, inputEl = null) {
    const q = state.activeQuote;
    const it = q?.sections?.[sIdx]?.items?.[iIdx];
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

    // Nếu người dùng tự gõ đè Giá gốc cơ bản của chính dòng Phí QL/TK -> đánh dấu dòng đó nhập tay riêng (không tắt auto-calc của dòng khác)
    if (field === 'base_price' && isMgmtFeeItem(it)) {
      it._manualMgmtPrice = true;
    }

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
    const q = state.activeQuote;
    const sec = q?.sections?.[sIdx];
    const it = sec?.items?.[iIdx];
    if (!it || !it.sub_lines) return;
    const removed = it.sub_lines[slIdx];

    // Mã 04: Nếu xóa dòng cấu phần chính (Quạt, Bơm, Tủ điện, Stage) khỏi gói tower_bundle -> trừ đúng giá cấu phần đó!
    if (it.item_type === 'tower_bundle' && removed && removed.component_key && ['fan', 'pump', 'panel', 'stage'].includes(removed.component_key)) {
      const ck = removed.component_key;
      const bd = hydrateTowerBundleBreakdown(it, q, sec);
      if (bd && bd[ck]) {
        bd[ck].included = false;
        it.sub_lines = it.sub_lines.filter(sl => sl.component_key !== ck);
        recomputeTowerBundleFromBreakdown(it);
        recalcActiveQuoteTotals();
        renderFlow2();
        toast(`Đã xóa "${bd[ck].shortLabel}" khỏi gói (-${fmtVnd(bd[ck].base)} đ) — đã tự động tính lại tổng & phí QL/TK!`);
        return;
      }
    }

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
    const ppl = resolveQuotePeople(q);
    openConfirmModal({
      title: '📤 Xác Nhận Lưu & Gửi Duyệt Báo Giá',
      okText: '📤 Xác nhận Gửi duyệt',
      isDanger: false,
      messageHtml: `
        Bạn có chắc chắn muốn <strong>Lưu và Gửi duyệt</strong> hồ sơ báo giá này lên Quản lý / Người duyệt không?
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px;line-height:1.5;">
          <div>• Số báo giá: <strong style="color:var(--navy)">${esc(q.quote_number)}</strong></div>
          <div>• Khách hàng: <strong>${esc(q.customer_name)}</strong></div>
          <div>• Người tạo: <strong>${esc(ppl.creatorName)}</strong>${ppl.creatorHandle && !ppl.creatorName.startsWith('@') ? ` (${esc(ppl.creatorHandle)})` : ''}</div>
          <div>• Người đảm trách (PIC): <strong style="color:var(--navy)">${esc(ppl.picName)}</strong></div>
          <div>• Người duyệt trên báo giá: <strong>${esc(ppl.approverName)}</strong></div>
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
      state.quickAddTargetSecIdx = 0;
      state.selectedGroupItemKeys = [];
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
    const ppl = resolveQuotePeople(target);

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
        <div style="background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-top:10px;font-size:13px;line-height:1.5;">
          <div>• Số báo giá: <strong style="color:var(--navy)">${esc(qNum)}</strong></div>
          <div>• Khách hàng: <strong>${esc(cName)}</strong></div>
          <div>• Người tạo: <strong>${esc(ppl.creatorName)}</strong>${ppl.creatorHandle && !ppl.creatorName.startsWith('@') ? ` (${esc(ppl.creatorHandle)})` : ''}</div>
          <div>• Người đảm trách (PIC): <strong style="color:var(--navy)">${esc(ppl.picName)}</strong></div>
          <div>• Người duyệt: <strong>${esc(ppl.approverName)}</strong></div>
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

  const PRINT_TEMPLATES = [
    { id: 'classic', name: 'Mẫu 1 (KKVN)', desc: 'Mẫu chuẩn truyền thống KKVN', swatches: ['#b4c6e7', '#d9d9d9'] },
    { id: 'executive', name: 'Mẫu 2', desc: 'Cao Cấp Navy & Xanh Kyowa', swatches: ['#1f3864', '#4e954d'] },
    { id: 'kyowa-green', name: 'Mẫu 3', desc: 'Xanh Thương Hiệu Kyowa', swatches: ['#2e7d32', '#81c784'] },
    { id: 'japanese-jis', name: 'Mẫu 4', desc: 'Chuẩn Tập Đoàn Nhật (JIS)', swatches: ['#111827', '#991b1b'] },
    { id: 'luxury-gold', name: 'Mẫu 5', desc: 'VIP Navy & Vàng Kim', swatches: ['#0f172a', '#c59b27'] },
    { id: 'crimson-fdi', name: 'Mẫu 6', desc: 'Đỏ Đô Tập Đoàn FDI', swatches: ['#991b1b', '#1f2937'] },
    { id: 'tech-blueprint', name: 'Mẫu 7', desc: 'Kỹ Thuật Công Nghiệp (CAD)', swatches: ['#0c4a6e', '#0284c7'] },
    { id: 'minimal-mono', name: 'Mẫu 8', desc: 'Tối Giản In Laser Đen Trắng', swatches: ['#111827', '#e5e7eb'] },
    { id: 'emerald-teal', name: 'Mẫu 9', desc: 'Xanh Ngọc Lục Bảo', swatches: ['#0f766e', '#5eead4'] },
    { id: 'royal-indigo', name: 'Mẫu 10', desc: 'Xanh Chàm Châu Âu', swatches: ['#312e81', '#818cf8'] },
    { id: 'bronze-heritage', name: 'Mẫu 11', desc: 'Nâu Đồng Cổ Điển', swatches: ['#78350f', '#fde68a'] },
    { id: 'slate-sidebar', name: 'Mẫu 12', desc: 'Cột Trái Hiện Đại', swatches: ['#0f172a', '#059669'] }
  ];

  function savePrintPrefs() {
    try {
      localStorage.setItem('kkvn_print_prefs', JSON.stringify({
        printTemplate: state.printTemplate,
        printWatermark: state.printWatermark,
        printWatermarkOpacity: state.printWatermarkOpacity,
        printWatermarkSize: state.printWatermarkSize
      }));
    } catch {}
    if (state.activeQuote) {
      state.activeQuote.terms = state.activeQuote.terms || {};
      state.activeQuote.terms.print_template = state.printTemplate;
      state.activeQuote.terms.print_watermark = state.printWatermark;
      state.activeQuote.terms.print_watermark_opacity = state.printWatermarkOpacity;
      state.activeQuote.terms.print_watermark_size = state.printWatermarkSize;
    }
  }

  function setPrintTemplate(tplId) {
    state.printTemplate = tplId;
    savePrintPrefs();
    renderPrintView();
  }

  function togglePrintPicker() {
    state.printPickerOpen = !state.printPickerOpen;
    renderPrintView();
  }

  function togglePrintWatermark(checked) {
    state.printWatermark = Boolean(checked);
    savePrintPrefs();
    renderPrintView();
  }

  function setPrintWatermarkOpacity(val) {
    state.printWatermarkOpacity = Number(val || 0.10);
    savePrintPrefs();
    renderPrintView();
  }

  function setPrintWatermarkSize(val) {
    state.printWatermarkSize = Number(val || 490);
    savePrintPrefs();
    renderPrintView();
  }

  async function getTransparentWatermarkDataUrl(opacity = 0.10) {
    const key = String(Number(opacity).toFixed(3));
    if (state.watermarkDataUrlCache[key]) return state.watermarkDataUrlCache[key];

    const rawDataUrl = await fetchImageAsDataUrl('/assets/kkvn_logo.jpg');
    if (!rawDataUrl) return null;

    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 300;
          canvas.height = img.naturalHeight || img.height || 140;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          const alphaFactor = Math.max(0.02, Math.min(1, Number(opacity)));
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            // Biến nền trắng của logo JPG thành trong suốt hoàn toàn để không tạo mảng trắng khi làm watermark
            if (r > 235 && g > 235 && b > 235) {
              d[i + 3] = 0;
            } else {
              d[i + 3] = Math.round(d[i + 3] * alphaFactor);
            }
          }
          ctx.putImageData(imgData, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          state.watermarkDataUrlCache[key] = pngUrl;
          resolve(pngUrl);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });
  }

  function buildFooterNotesAndSignHtml(q, t, stampImgSrc) {
    return `
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
          <div style="font-weight:700;margin-bottom:4px;">営業部 Phòng Kinh Doanh</div>
          <div class="kkvn-stamp-wrap">
            ${stampImgSrc ? `<img src="${stampImgSrc}" alt="Stamp" class="kkvn-stamp-img">` : '<div style="height:120px"></div>'}
            ${q.stamp_type === 'tayninh' || q.stamp_type === 'none' ? `
              <div style="font-weight:700;font-size:10.5pt;margin-top:4px;">${esc(q.signer_name || 'NGUYỄN BẢO TRƯỜNG')}</div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function buildRenderedQuoteRows(q) {
    const t = q?.terms || {};
    const mode = t.price_display_mode || 'itemized';
    const specLevel = t.spec_detail_level || 'detailed';
    const sections = q?.sections || [];
    const rows = [];
    const romanLabels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

    const fmtSpec = (txt) => formatSpecForLevel(txt, specLevel);

    function pushItemDetailLines(it, baseIndent = 1) {
      const sp = fmtSpec(it.specs_text || '');
      if (sp) {
        rows.push({ kind: 'spec_line', text: sp, indentLevel: baseIndent });
      }
      if (it.sub_lines && it.sub_lines.length > 0) {
        it.sub_lines.forEach(sl => {
          const rawText = String(sl.text || '');
          const isPlus = rawText.startsWith('   +');
          const displayTxt = sl.is_spec_box ? fmtSpec(rawText.trim()) : rawText.trim();
          if (!displayTxt) return;
          const displayRemark = (specLevel === 'basic' && sl.is_spec_box) ? '' : (sl.remark || '');
          rows.push({
            kind: 'sub_line',
            text: displayTxt,
            rightText: sl.right_text || '',
            remark: displayRemark,
            indentLevel: isPlus ? baseIndent + 1 : baseIndent
          });
        });
      }
    }

    if (mode === 'single_total') {
      // Mã 06 & Mã 04: 1 giá tổng toàn bộ — liệt kê đầy đủ thiết bị nhưng ẩn đơn giá & thành tiền từng mục
      let runningStt = 1;
      sections.forEach(sec => {
        const activeItems = (sec.items || []).filter(it => it.included !== false);
        if (activeItems.length === 0) return;
        if (sec.title && sec.title.trim()) {
          rows.push({ kind: 'sec_header', title: sec.title });
        }
        activeItems.forEach(it => {
          rows.push({
            kind: 'item',
            stt: it.stt || String(runningStt),
            title: `${it.name_jp ? it.name_jp + ' ' : ''}${it.name_vi || ''}`,
            unit: it.unit || '',
            qty: it.quantity || 1,
            unitPrice: null,
            totalPrice: null,
            remark: it.remark || '',
            hidePrices: true,
            rowClass: ''
          });
          runningStt++;
          pushItemDetailLines(it, 1);
        });
      });

      rows.push({
        kind: 'subtotal',
        label: t.total_label_before_tax || 'TỔNG GIÁ TRỌN GÓI TRƯỚC THUẾ (TOTAL Before TAX)',
        amount: q.subtotal_before_tax
      });
      return { rows, showBeforeTaxInSummary: false, mode, specLevel };
    }

    if (mode === 'per_section') {
      // Mã 06: 1 giá trọn gói cho từng hệ / khu vực — ẩn giá thiết bị lẻ bên trong
      let secDisplayIdx = 0;
      sections.forEach(sec => {
        const activeItems = (sec.items || []).filter(it => it.included !== false);
        if (activeItems.length === 0) return;
        const secStt = romanLabels[secDisplayIdx] || String(secDisplayIdx + 1);
        secDisplayIdx++;
        const secTitle = (sec.title && sec.title.trim()) ? sec.title.trim() : `Hệ thống / Khu vực ${secDisplayIdx}`;
        rows.push({
          kind: 'item',
          stt: secStt,
          title: secTitle,
          unit: 'Hệ / Gói',
          qty: 1,
          unitPrice: sec.subtotal,
          totalPrice: sec.subtotal,
          remark: `${activeItems.length} hạng mục`,
          hidePrices: false,
          rowClass: 'bundle-section-row'
        });
        activeItems.forEach(it => {
          const itemLabel = `- ${it.name_jp ? it.name_jp + ' ' : ''}${it.name_vi || ''}`;
          rows.push({
            kind: 'sub_line',
            text: itemLabel,
            rightText: `x ${it.quantity || 1} ${it.unit || ''}`.trim(),
            remark: it.remark || '',
            indentLevel: 1
          });
          pushItemDetailLines(it, 2);
        });
      });
      return { rows, showBeforeTaxInSummary: true, mode, specLevel };
    }

    if (mode === 'custom_groups') {
      // Mã 07: Gộp nhóm linh hoạt (VD: gộp 1+3+5 thành 1 giá; tách riêng 2, 4)
      const allActiveItems = [];
      sections.forEach((sec, sIdx) => {
        (sec.items || []).forEach(it => {
          if (it.included !== false) allActiveItems.push({ it, sIdx });
        });
      });

      const groupSecMap = new Map();
      allActiveItems.forEach(({ it, sIdx }) => {
        const g = String(it.merge_group || '').trim();
        if (!g) return;
        if (!groupSecMap.has(g)) groupSecMap.set(g, new Set());
        groupSecMap.get(g).add(sIdx);
      });
      const hasCrossSecGroup = Array.from(groupSecMap.values()).some(set => set.size > 1);
      const emittedGroups = new Set();

      sections.forEach((sec, sIdx) => {
        const activeItems = (sec.items || []).filter(it => it.included !== false);
        if (activeItems.length === 0) return;

        const secVisibleRows = [];
        let localStt = 1;

        activeItems.forEach(it => {
          const gName = String(it.merge_group || '').trim();
          if (!gName) {
            secVisibleRows.push({ type: 'single', stt: String(localStt++), it });
          } else if (!emittedGroups.has(gName)) {
            emittedGroups.add(gName);
            const members = allActiveItems
              .filter(x => String(x.it.merge_group || '').trim() === gName)
              .map(x => x.it);
            const groupTotal = members.reduce((sum, m) => sum + Number(m.total_price || 0), 0);
            secVisibleRows.push({ type: 'group', stt: String(localStt++), gName, members, groupTotal });
          }
        });

        if (secVisibleRows.length === 0) return;

        if (sec.title && sec.title.trim()) {
          rows.push({ kind: 'sec_header', title: sec.title });
        }

        secVisibleRows.forEach(entry => {
          if (entry.type === 'single') {
            const it = entry.it;
            rows.push({
              kind: 'item',
              stt: entry.stt,
              title: `${it.name_jp ? it.name_jp + ' ' : ''}${it.name_vi || ''}`,
              unit: it.unit || '',
              qty: it.quantity || 1,
              unitPrice: it.unit_price,
              totalPrice: it.total_price,
              remark: it.remark || '',
              hidePrices: false,
              rowClass: ''
            });
            pushItemDetailLines(it, 1);
          } else {
            rows.push({
              kind: 'item',
              stt: entry.stt,
              title: entry.gName,
              unit: 'Gói / Set',
              qty: 1,
              unitPrice: entry.groupTotal,
              totalPrice: entry.groupTotal,
              remark: `Gộp ${entry.members.length} mục`,
              hidePrices: false,
              rowClass: 'group-parent-row'
            });
            entry.members.forEach(mem => {
              rows.push({
                kind: 'sub_line',
                text: `- ${mem.name_jp ? mem.name_jp + ' ' : ''}${mem.name_vi || ''}`,
                rightText: `x ${mem.quantity || 1} ${mem.unit || ''}`.trim(),
                remark: mem.remark || '',
                indentLevel: 1
              });
              pushItemDetailLines(mem, 2);
            });
          }
        });

        if (!hasCrossSecGroup && sec.showSubtotal) {
          rows.push({
            kind: 'subtotal',
            label: sec.subtotalLabel || 'TOTAL',
            amount: sec.subtotal
          });
        }
      });

      const anySecSubtotalShown = !hasCrossSecGroup && sections.some(s => s.showSubtotal && (s.items || []).some(x => x.included !== false));
      if (!anySecSubtotalShown) {
        rows.push({
          kind: 'subtotal',
          label: t.total_label_before_tax || 'TOTAL',
          amount: q.subtotal_before_tax
        });
      }
      return { rows, showBeforeTaxInSummary: anySecSubtotalShown, mode, specLevel };
    }

    // Mặc định: mode === 'itemized' (Mã 08: chi tiết giá từng thiết bị)
    sections.forEach(sec => {
      const activeItems = (sec.items || []).filter(it => it.included !== false);
      if (activeItems.length === 0) return;
      if (sec.title && sec.title.trim()) {
        rows.push({ kind: 'sec_header', title: sec.title });
      }
      activeItems.forEach(it => {
        rows.push({
          kind: 'item',
          stt: it.stt || '',
          title: `${it.name_jp ? it.name_jp + ' ' : ''}${it.name_vi || ''}`,
          unit: it.unit || '',
          qty: it.quantity || 1,
          unitPrice: it.unit_price,
          totalPrice: it.total_price,
          remark: it.remark || '',
          hidePrices: false,
          rowClass: ''
        });
        pushItemDetailLines(it, 1);
      });
      if (sec.showSubtotal) {
        rows.push({
          kind: 'subtotal',
          label: sec.subtotalLabel || 'TOTAL',
          amount: sec.subtotal
        });
      }
    });

    const anySecSubtotal = sections.some(s => s.showSubtotal && (s.items || []).some(x => x.included !== false));
    if (!anySecSubtotal) {
      rows.push({
        kind: 'subtotal',
        label: t.total_label_before_tax || 'TOTAL',
        amount: q.subtotal_before_tax
      });
    }
    return { rows, showBeforeTaxInSummary: anySecSubtotal, mode, specLevel };
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
    const tpl = state.printTemplate || 'executive';
    const showWatermark = state.printWatermark !== false;
    const wmOpacity = Number(state.printWatermarkOpacity || 0.10);
    const wmSize = Number(state.printWatermarkSize || 490);

    const rendered = buildRenderedQuoteRows(q);
    let tableRowsHtml = '';
    rendered.rows.forEach(r => {
      if (r.kind === 'sec_header') {
        tableRowsHtml += `
          <tr class="sec-header-row">
            <td colspan="7">${esc(r.title)}</td>
          </tr>
        `;
      } else if (r.kind === 'item') {
        tableRowsHtml += `
          <tr class="${esc(r.rowClass || '')}">
            <td style="text-align:center;font-weight:600;">${esc(r.stt)}</td>
            <td><strong>${esc(r.title)}</strong></td>
            <td style="text-align:center;">${esc(r.unit)}</td>
            <td style="text-align:center;">${esc(r.qty)}</td>
            <td style="text-align:right;">${r.hidePrices ? '' : fmtPdfNum(r.unitPrice)}</td>
            <td style="text-align:right;font-weight:600;">${r.hidePrices ? '' : fmtPdfNum(r.totalPrice)}</td>
            <td style="text-align:center;font-weight:700;">${esc(r.remark || '')}</td>
          </tr>
        `;
      } else if (r.kind === 'spec_line') {
        const padPx = r.indentLevel >= 2 ? 28 : 18;
        tableRowsHtml += `
          <tr>
            <td></td>
            <td style="padding-left:${padPx}px;font-size:9pt;color:#334155;">${esc(r.text)}</td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        `;
      } else if (r.kind === 'sub_line') {
        const padPx = r.indentLevel >= 2 ? 26 : 10;
        tableRowsHtml += `
          <tr>
            <td></td>
            <td style="padding-left:${padPx}px;font-size:9pt;">
              <div style="display:flex;justify-content:space-between;gap:8px;">
                <span>${esc(r.text)}</span>
                ${r.rightText ? `<span style="white-space:nowrap;">${esc(r.rightText)}</span>` : ''}
              </div>
            </td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td style="text-align:center;font-weight:700;font-size:8.5pt;">${esc(r.remark || '')}</td>
          </tr>
        `;
      } else if (r.kind === 'subtotal') {
        tableRowsHtml += `
          <tr class="subtotal-row">
            <td colspan="5">${esc(r.label || 'TOTAL')}</td>
            <td style="text-align:right;">${fmtPdfNum(r.amount)}</td>
            <td></td>
          </tr>
        `;
      }
    });

    const anySecSubtotal = rendered.showBeforeTaxInSummary;

    const itemsTableHtml = `
      <table class="kkvn-items-table">
        <thead>
          <tr>
            <th style="width:40px">番号<br>STT</th>
            <th>明細<br>Chi Tiết</th>
            <th style="width:58px">単位<br>Đơn Vị</th>
            <th style="width:36px">数<br>SL</th>
            <th style="width:98px">単価<br>Đơn giá</th>
            <th style="width:106px">金額(VND)<br>Thành Tiền</th>
            <th style="width:92px">備考<br>Ghi Chú</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    `;

    const stampImgSrc = q.stamp_type === 'tayninh'
      ? '/assets/stamp_tayninh.png'
      : q.stamp_type === 'longan'
        ? '/assets/stamp_longan.png'
        : null;

    const footerHtml = buildFooterNotesAndSignHtml(q, t, stampImgSrc);

    const watermarkLayerHtml = showWatermark ? `
      <div class="kkvn-watermark-layer" aria-hidden="true">
        <img id="sheetWatermarkImg"
             src="${state.watermarkDataUrlCache[String(wmOpacity.toFixed(3))] || '/assets/kkvn_logo.jpg'}"
             alt=""
             class="kkvn-watermark-img"
             style="width:${wmSize}px; ${state.watermarkDataUrlCache[String(wmOpacity.toFixed(3))] ? 'opacity:1;' : `opacity:${wmOpacity}; mix-blend-mode:multiply;`}">
      </div>
    ` : '';

    let sheetBodyHtml = '';

    if (tpl === 'executive') {
      sheetBodyHtml = `
        <div class="exec-top-accent"></div>
        <div class="kkvn-sheet-content">
          <div class="exec-header-grid">
            <div class="exec-brand-col">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" class="exec-logo-img">
              <div class="exec-company-sub">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
            <div class="exec-title-col">
              <h1 class="exec-doc-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
              <div class="exec-doc-sub">QUOTATION · PROPOSAL</div>
            </div>
            <div class="exec-meta-box">
              <div><span style="color:#64748b;">Số / No.:</span> <strong style="color:#1f3864;">${esc(q.quote_number)}</strong></div>
              <div><span style="color:#64748b;">Ngày / Date:</span> <strong style="color:#b91c1c;">${esc(formatDateDMY(q.quote_date))}</strong></div>
              <div><span style="color:#64748b;">Rev:</span> <strong>${String(q.revision || 1).padStart(2, '0')}</strong></div>
            </div>
          </div>

          <div class="exec-party-grid">
            <div class="exec-party-card cust">
              <div class="exec-party-kicker">Kính gửi / Customer</div>
              <div class="exec-party-name">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="exec-party-card comp">
              <div class="exec-party-kicker">Đơn vị báo giá / Supplier</div>
              <div class="exec-party-name">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="exec-project-strip">
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">プロジェクト Dự Án :</span><strong style="color:#1f3864;">${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="exec-summary-wrap">
            <table class="exec-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>TỔNG CỘNG (After TAX)</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'kyowa-green') {
      sheetBodyHtml = `
        <div class="green-top-bar"></div>
        <div class="kkvn-sheet-content">
          <div class="green-header">
            <div>
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:42px;object-fit:contain;">
              <div style="font-size:8.5pt;font-weight:700;color:#2e7d32;margin-top:2px;">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
            <div style="text-align:right;">
              <h1 class="green-doc-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
              <div class="green-quote-pill">
                No: ${esc(q.quote_number)} &nbsp;|&nbsp; Ngày: ${esc(formatDateDMY(q.quote_date))}
              </div>
            </div>
          </div>

          <div class="green-party-split">
            <div class="green-party-col">
              <div class="green-section-tag">Kính gửi / Customer</div>
              <div style="font-size:10.5pt;font-weight:800;color:#b91c1c;margin-bottom:4px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="green-party-col right-col">
              <div class="green-section-tag">Nhà cung cấp / Kyowa Kako</div>
              <div style="font-size:10.5pt;font-weight:800;color:#1b5e20;margin-bottom:4px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="kkvn-meta-lines" style="padding:4px 8px;border-left:3px solid #2e7d32;background:rgba(240,253,244,0.65);border-radius:0 4px 4px 0;">
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#166534;font-weight:600;">プロジェクト Dự Án :</span><strong>${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#166534;font-weight:600;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#166534;font-weight:600;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="green-summary-bar">
            <table class="green-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'japanese-jis') {
      sheetBodyHtml = `
        <div class="jis-outer-frame">
          <div class="kkvn-sheet-content">
            <div class="jis-meta-top">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:34px;object-fit:contain;">
              <div style="text-align:right;line-height:1.4;">
                <div>見積番号 / No.: <strong>${formatQuoteNumberSplit(q.quote_number)}</strong></div>
                <div>見積日 / Date: <strong style="color:#991b1b;">${esc(formatDateDMY(q.quote_date))}</strong></div>
              </div>
            </div>

            <div class="jis-title-banner">
              <h1 class="jis-title-text">${esc(q.doc_title || '御見積書 · BÁO GIÁ')}</h1>
            </div>

            <div class="jis-party-row">
              <div class="jis-cust-col">
                <div class="jis-cust-heading">
                  <span>${esc(q.customer_name)}</span>
                  <span style="font-size:10pt;color:#111827;">御中</span>
                </div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">住所 Địa chỉ:</span><span class="kkvn-info-val">${esc(q.customer_address || '')}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">電話番号 Điện thoại:</span><span class="kkvn-info-val">${esc(q.customer_phone || '')}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">連絡先 Liên hệ:</span><span class="kkvn-info-val">${esc(q.customer_contact || '')}</span></div>
                <div style="margin-top:5px;padding-top:4px;border-top:1px dashed #9ca3af;font-size:9pt;">
                  <div><strong>プロジェクト Dự Án:</strong> ${esc(q.project_name || '')}</div>
                  <div><strong>設置先 Nơi lắp đặt:</strong> ${esc(q.install_location || '')}</div>
                  <div><strong>納期 Thời gian đặt hàng:</strong> <strong>${esc(q.lead_time_days || 180)}</strong> 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</div>
                </div>
              </div>
              <div class="jis-comp-col">
                <div style="font-size:10.5pt;font-weight:700;color:#1f3864;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
                <div style="font-size:8.8pt;margin-bottom:3px;">住所: ${esc(q.kkvn_address || '')}</div>
                <div style="font-size:9pt;margin-bottom:2px;">承認者 Người duyệt: <strong><em>${esc(q.approver_name)}</em></strong> (${esc(q.approver_phone)})</div>
                <div style="font-size:9pt;">担当者 Người đảm trách: <strong><em>${esc(q.pic_name)}</em></strong> (${esc(q.pic_phone)})</div>
              </div>
            </div>

            <div class="jis-total-highlight">
              <span class="jis-total-label">御見積金額 &nbsp; Tổng Giá Trị Báo Giá (Đã gồm VAT ${Number(q.vat_percent || 0)}%):</span>
              <span class="jis-total-amount">${fmtPdfNum(q.total_after_tax)} VND</span>
            </div>

            ${itemsTableHtml}

            <table class="kkvn-summary-block" style="margin-top:4px;">
              ${anySecSubtotal ? `
                <tr>
                  <td style="width:95px"></td>
                  <td>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</td>
                  <td style="width:110px;text-align:right;">${fmtPdfNum(q.subtotal_before_tax)}</td>
                  <td style="width:92px"></td>
                </tr>
              ` : ''}
              <tr>
                <td style="width:95px"></td>
                <td>TAX VAT &nbsp;&nbsp;&nbsp; ${Number(q.vat_percent || 0)}%</td>
                <td style="width:110px;text-align:right;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) : '-'}</td>
                <td style="width:92px"></td>
              </tr>
              <tr>
                <td style="width:95px"></td>
                <td style="border-top:1.5px solid #111827;">Total - After TAX</td>
                <td style="width:110px;text-align:right;font-size:10.5pt;border-top:1.5px solid #111827;">${fmtPdfNum(q.total_after_tax)}</td>
                <td style="width:92px"></td>
              </tr>
            </table>

            ${footerHtml}
          </div>
        </div>
      `;
    } else if (tpl === 'luxury-gold') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="lux-banner">
            <div>
              <div class="lux-logo-pill">
                <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:34px;display:block;object-fit:contain;">
              </div>
              <div style="font-size:7.8pt;letter-spacing:0.6px;color:#e2e8f0;margin-top:4px;">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
            <div style="flex:1;">
              <h1 class="lux-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
              <div class="lux-subtitle">OFFICIAL PROJECT PROPOSAL</div>
            </div>
            <div class="lux-meta-pill">
              <div>No.: <strong style="color:#f8e3a3;">${esc(q.quote_number)}</strong></div>
              <div>Date: <strong>${esc(formatDateDMY(q.quote_date))}</strong></div>
              <div>Rev: <strong>${String(q.revision || 1).padStart(2, '0')}</strong></div>
            </div>
          </div>

          <div class="lux-party-grid">
            <div class="lux-party-box">
              <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#b48a3e;margin-bottom:2px;">Kính gửi / Valued Client</div>
              <div style="font-size:10.8pt;font-weight:700;color:#991b1b;margin-bottom:4px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="lux-party-box">
              <div style="font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#b48a3e;margin-bottom:2px;">Nhà cung cấp / Supplier</div>
              <div style="font-size:10.8pt;font-weight:700;color:#0f172a;margin-bottom:4px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="lux-project-bar">
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">プロジェクト Dự Án :</span><strong style="color:#0f172a;">${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#475569;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="lux-summary-wrap">
            <table class="lux-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>TỔNG CỘNG (After TAX)</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'crimson-fdi') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="crim-header">
            <div style="display:flex;align-items:center;gap:14px;">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:40px;object-fit:contain;">
              <div>
                <h1 class="crim-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
                <div style="font-size:8.2pt;font-weight:700;color:#4b5563;letter-spacing:0.6px;">KYOWA KAKO VIET NAM CO., LTD</div>
              </div>
            </div>
            <div class="crim-right-card">
              <div>Số BG / No.: <strong style="color:#fca5a5;">${esc(q.quote_number)}</strong></div>
              <div>Ngày / Date: <strong>${esc(formatDateDMY(q.quote_date))}</strong></div>
            </div>
          </div>

          <div class="crim-party-row">
            <div class="crim-party-box">
              <div style="font-size:7.5pt;font-weight:800;color:#991b1b;text-transform:uppercase;margin-bottom:2px;">Khách hàng / Customer</div>
              <div style="font-size:10.5pt;font-weight:800;color:#111827;margin-bottom:3px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="crim-party-box comp">
              <div style="font-size:7.5pt;font-weight:800;color:#1f2937;text-transform:uppercase;margin-bottom:2px;">Đơn vị cung cấp / Supplier</div>
              <div style="font-size:10.5pt;font-weight:800;color:#1f2937;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#6b7280;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="crim-meta-3col">
            <div class="crim-meta-cell">
              <strong>プロジェクト Dự Án</strong>
              <span>${esc(q.project_name || '—')}</span>
            </div>
            <div class="crim-meta-cell">
              <strong>設置先 Nơi lắp đặt</strong>
              <span>${esc(q.install_location || '—')}</span>
            </div>
            <div class="crim-meta-cell">
              <strong>納期 Thời gian đặt hàng</strong>
              <span><b>${esc(q.lead_time_days || 180)}</b> 日間 ${esc(q.lead_time_note || 'Ngày')}</span>
            </div>
          </div>

          ${itemsTableHtml}

          <div class="crim-summary-wrap">
            <table class="crim-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'tech-blueprint') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <table class="tech-title-block">
            <tr>
              <td style="width:24%;text-align:center;">
                <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:36px;object-fit:contain;">
              </td>
              <td style="width:48%;text-align:center;">
                <span class="tech-kicker">ENGINEERING &amp; ENVIRONMENTAL EQUIPMENT QUOTATION</span>
                <div style="font-size:17pt;font-weight:800;color:#0c4a6e;letter-spacing:0.6px;line-height:1.15;">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
              </td>
              <td style="width:28%;font-size:8.5pt;line-height:1.45;">
                <div><span style="color:#0369a1;font-weight:700;">DOC NO.:</span> <strong>${esc(q.quote_number)}</strong></div>
                <div><span style="color:#0369a1;font-weight:700;">DATE:</span> <strong style="color:#b91c1c;">${esc(formatDateDMY(q.quote_date))}</strong></div>
                <div><span style="color:#0369a1;font-weight:700;">REV:</span> <strong>${String(q.revision || 1).padStart(2, '0')}</strong></div>
              </td>
            </tr>
          </table>

          <table class="tech-spec-table">
            <tr>
              <td class="lbl-cell">KHÁCH HÀNG<br>CUSTOMER</td>
              <td style="width:32%;">
                <strong style="color:#b91c1c;font-size:9.8pt;">${esc(q.customer_name)}</strong><br>
                <span>住所: ${esc(q.customer_address || '—')}</span><br>
                <span>TEL: ${esc(q.customer_phone || '—')} · ATTN: ${esc(q.customer_contact || '—')}</span>
              </td>
              <td class="lbl-cell">NHÀ CUNG CẤP<br>SUPPLIER</td>
              <td style="width:32%;">
                <strong style="color:#0c4a6e;font-size:9.8pt;">KYOWA KAKO VIET NAM CO., LTD</strong><br>
                <span>住所: ${esc(q.kkvn_address || '')}</span><br>
                <span>承認者: <b>${esc(q.approver_name)}</b> (${esc(q.approver_phone)})</span><br>
                <span>担当者: <b>${esc(q.pic_name)}</b> (${esc(q.pic_phone)})</span>
              </td>
            </tr>
            <tr>
              <td class="lbl-cell">プロジェクト DỰ ÁN</td>
              <td><strong>${esc(q.project_name || '—')}</strong></td>
              <td class="lbl-cell">設置先 / 納期</td>
              <td>${esc(q.install_location || '—')} · <strong>${esc(q.lead_time_days || 180)}</strong> 日間 ${esc(q.lead_time_note || 'Ngày')}</td>
            </tr>
          </table>

          ${itemsTableHtml}

          <div class="tech-summary-wrap">
            <table class="tech-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>TOTAL - AFTER TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'minimal-mono') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="mono-header">
            <div>
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:36px;object-fit:contain;margin-bottom:4px;">
              <h1 class="mono-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
            </div>
            <div style="text-align:right;font-size:9.5pt;line-height:1.5;">
              <div>Số báo giá / No.: <strong>${esc(q.quote_number)}</strong></div>
              <div>Ngày lập / Date: <strong>${esc(formatDateDMY(q.quote_date))}</strong></div>
              <div style="font-size:8.5pt;color:#6b7280;">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
          </div>

          <div class="mono-party-grid">
            <div>
              <div class="mono-label-cap">To / Khách Hàng</div>
              <div style="font-size:10.5pt;font-weight:800;margin-bottom:3px;">${esc(q.customer_name)}</div>
              <div>Địa chỉ: ${esc(q.customer_address || '—')}</div>
              <div>Điện thoại: ${esc(q.customer_phone || '—')} · Liên hệ: ${esc(q.customer_contact || '—')}</div>
            </div>
            <div>
              <div class="mono-label-cap">From / Kyowa Kako Vietnam</div>
              <div style="font-size:10.5pt;font-weight:800;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div>Địa chỉ: ${esc(q.kkvn_address || '')}</div>
              <div>Người duyệt: <strong>${esc(q.approver_name)}</strong> (${esc(q.approver_phone)})</div>
              <div>Đảm trách: <strong>${esc(q.pic_name)}</strong> (${esc(q.pic_phone)})</div>
            </div>
          </div>

          <div class="kkvn-meta-lines" style="margin-bottom:8px;">
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#4b5563;">プロジェクト Dự Án :</span><strong>${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#4b5563;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#4b5563;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="mono-summary-wrap">
            <table class="mono-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'emerald-teal') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="teal-banner">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="teal-logo-box">
                <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:34px;display:block;object-fit:contain;">
              </div>
              <div>
                <div style="font-size:17pt;font-weight:800;letter-spacing:0.6px;line-height:1.1;">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
                <div style="font-size:8pt;opacity:0.9;margin-top:2px;">KYOWA KAKO VIET NAM CO., LTD</div>
              </div>
            </div>
            <div class="teal-badge">
              <div>Số / No.: <strong style="color:#0f766e;">${esc(q.quote_number)}</strong></div>
              <div>Ngày / Date: <strong style="color:#b91c1c;">${esc(formatDateDMY(q.quote_date))}</strong></div>
            </div>
          </div>

          <div class="teal-party-grid">
            <div class="teal-card">
              <div style="font-size:7.5pt;font-weight:800;color:#0f766e;text-transform:uppercase;margin-bottom:2px;">Khách hàng / Customer</div>
              <div style="font-size:10.5pt;font-weight:800;color:#b91c1c;margin-bottom:3px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="teal-card">
              <div style="font-size:7.5pt;font-weight:800;color:#0f766e;text-transform:uppercase;margin-bottom:2px;">Nhà cung cấp / Supplier</div>
              <div style="font-size:10.5pt;font-weight:800;color:#134e4a;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="teal-project-bar">
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#0f766e;font-weight:600;">プロジェクト Dự Án :</span><strong style="color:#0f172a;">${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#0f766e;font-weight:600;">設置先 Nơi lắp đặt :</span><span style="color:#0f172a;">${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#0f766e;font-weight:600;">納期 Thời gian đặt hàng :</span><span style="color:#0f172a;"><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="teal-summary-wrap">
            <table class="teal-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'royal-indigo') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="ind-header">
            <div>
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:38px;object-fit:contain;">
              <div style="font-size:8.2pt;font-weight:700;color:#312e81;margin-top:2px;">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
            <div class="ind-title-badge">
              <div style="font-size:17pt;font-weight:800;letter-spacing:0.8px;line-height:1.1;">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
              <div style="font-size:7.8pt;letter-spacing:1.2px;color:#c7d2fe;margin-top:2px;">COMMERCIAL QUOTATION</div>
            </div>
            <div style="text-align:right;font-size:9pt;line-height:1.45;">
              <div>No.: <strong style="color:#312e81;">${esc(q.quote_number)}</strong></div>
              <div>Date: <strong style="color:#be123c;">${esc(formatDateDMY(q.quote_date))}</strong></div>
              <div>Rev: <strong>${String(q.revision || 1).padStart(2, '0')}</strong></div>
            </div>
          </div>

          <div class="ind-party-grid">
            <div class="ind-party-card cust">
              <div style="font-size:7.5pt;font-weight:800;color:#be123c;text-transform:uppercase;margin-bottom:2px;">Khách hàng / Client</div>
              <div style="font-size:10.5pt;font-weight:800;color:#881337;margin-bottom:3px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="ind-party-card">
              <div style="font-size:7.5pt;font-weight:800;color:#312e81;text-transform:uppercase;margin-bottom:2px;">Đơn vị báo giá / Contractor</div>
              <div style="font-size:10.5pt;font-weight:800;color:#1e1b4b;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#475569;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="kkvn-meta-lines" style="padding:5px 9px;background:rgba(238,242,255,0.55);border-radius:5px;border:1px solid #c7d2fe;">
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#312e81;font-weight:600;">プロジェクト Dự Án :</span><strong>${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#312e81;font-weight:600;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:140px;color:#312e81;font-weight:600;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="ind-summary-wrap">
            <table class="ind-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'bronze-heritage') {
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
          <div class="brz-header">
            <div style="text-align:left;">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:35px;object-fit:contain;">
              <div style="font-size:9.5pt;font-weight:700;color:#78350f;margin-top:2px;">${formatQuoteNumberSplit(q.quote_number)}</div>
            </div>
            <div>
              <h1 class="brz-title">${esc(q.doc_title || '御見積 BÁO GIÁ')}</h1>
              <div style="font-size:8pt;letter-spacing:1.2px;color:#92400e;">KYOWA KAKO VIET NAM CO., LTD</div>
            </div>
            <div style="text-align:right;font-size:10pt;font-weight:700;color:#991b1b;">
              ${esc(formatDateDMY(q.quote_date))}
            </div>
          </div>

          <table class="brz-party-table">
            <tr>
              <td>
                <div style="font-size:10.5pt;font-weight:700;color:#991b1b;border-bottom:1px solid #d6d3d1;padding-bottom:2px;margin-bottom:4px;">${esc(q.customer_name)}</div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
              </td>
              <td>
                <div style="font-size:10.5pt;font-weight:700;color:#78350f;border-bottom:1px solid #d6d3d1;padding-bottom:2px;margin-bottom:4px;">KYOWA KAKO VIET NAM CO., LTD</div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
                <div class="kkvn-info-line"><span class="kkvn-info-label">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
              </td>
            </tr>
          </table>

          <div class="kkvn-meta-lines">
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#78350f;font-weight:700;">プロジェクト Dự Án :</span><strong>${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#78350f;font-weight:700;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#78350f;font-weight:700;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="brz-summary-wrap">
            <table class="brz-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else if (tpl === 'slate-sidebar') {
      sheetBodyHtml = `
        <div class="side-accent-rail"></div>
        <div class="kkvn-sheet-content">
          <div class="side-header">
            <div style="display:flex;align-items:center;gap:12px;">
              <img src="/assets/kkvn_logo.jpg" alt="KKVN" style="height:38px;object-fit:contain;">
              <div>
                <div style="font-size:19pt;font-weight:800;color:#0f172a;line-height:1.1;">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
                <div style="font-size:8pt;font-weight:700;color:#059669;letter-spacing:0.8px;">KYOWA KAKO VIET NAM CO., LTD</div>
              </div>
            </div>
            <div style="text-align:right;font-size:9pt;line-height:1.45;">
              <div>No.: <strong style="color:#0f172a;">${esc(q.quote_number)}</strong></div>
              <div>Date: <strong style="color:#059669;">${esc(formatDateDMY(q.quote_date))}</strong></div>
            </div>
          </div>

          <div class="side-party-grid">
            <div class="side-party-card cust">
              <div style="font-size:7.5pt;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:2px;">Khách hàng / Customer</div>
              <div style="font-size:10.5pt;font-weight:800;color:#b91c1c;margin-bottom:3px;">${esc(q.customer_name)}</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.customer_address || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">電話番号 Điện thoại</span><span class="kkvn-info-val">${esc(q.customer_phone || '—')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">連絡先 Liên hệ</span><span class="kkvn-info-val">${esc(q.customer_contact || '—')}</span></div>
            </div>
            <div class="side-party-card">
              <div style="font-size:7.5pt;font-weight:800;color:#059669;text-transform:uppercase;margin-bottom:2px;">Nhà cung cấp / Supplier</div>
              <div style="font-size:10.5pt;font-weight:800;color:#0f172a;margin-bottom:3px;">KYOWA KAKO VIET NAM CO., LTD</div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">住所 Địa chỉ</span><span class="kkvn-info-val">${esc(q.kkvn_address || '')}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">承認者 Người duyệt</span><span class="kkvn-info-val bold-italic">${esc(q.approver_name)} ${esc(q.approver_phone)}</span></div>
              <div class="kkvn-info-line"><span class="kkvn-info-label" style="color:#64748b;">担当者 Đảm trách</span><span class="kkvn-info-val bold-italic">${esc(q.pic_name)} ${esc(q.pic_phone)}</span></div>
            </div>
          </div>

          <div class="kkvn-meta-lines" style="padding:4px 8px;border-left:3px solid #059669;background:rgba(248,250,252,0.72);">
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#475569;">プロジェクト Dự Án :</span><strong>${esc(q.project_name || '')}</strong></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#475569;">設置先 Nơi lắp đặt :</span><span>${esc(q.install_location || '')}</span></div>
            <div class="kkvn-meta-row"><span style="min-width:135px;color:#475569;">納期 Thời gian đặt hàng :</span><span><strong>${esc(q.lead_time_days || 180)}</strong> &nbsp; 日間 ${esc(q.lead_time_note || 'Ngày (kể từ ngày nhận cọc)')}</span></div>
          </div>

          ${itemsTableHtml}

          <div class="side-summary-wrap">
            <table class="side-summary-table">
              ${anySecSubtotal ? `
                <tr>
                  <td><strong>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</strong></td>
                  <td style="text-align:right;font-weight:700;">${fmtPdfNum(q.subtotal_before_tax)} VND</td>
                </tr>
              ` : ''}
              <tr>
                <td><strong>TAX VAT (${Number(q.vat_percent || 0)}%)</strong></td>
                <td style="text-align:right;font-weight:700;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) + ' VND' : '-'}</td>
              </tr>
              <tr class="grand-row">
                <td>Total - After TAX</td>
                <td style="text-align:right;">${fmtPdfNum(q.total_after_tax)} VND</td>
              </tr>
            </table>
          </div>

          ${footerHtml}
        </div>
      `;
    } else {
      // Template 4: Classic KKVN Refined
      sheetBodyHtml = `
        <div class="kkvn-sheet-content">
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

          ${itemsTableHtml}

          <table class="kkvn-summary-block">
            ${anySecSubtotal ? `
              <tr>
                <td style="width:95px"></td>
                <td>${esc(t.total_label_before_tax || 'Total (A) + (B) - Before TAX')}</td>
                <td style="width:106px;text-align:right;">${fmtPdfNum(q.subtotal_before_tax)}</td>
                <td style="width:92px"></td>
              </tr>
            ` : ''}
            <tr>
              <td style="width:95px"></td>
              <td>TAX VAT &nbsp;&nbsp;&nbsp; ${Number(q.vat_percent || 0)}%</td>
              <td style="width:106px;text-align:right;">${q.vat_amount > 0 ? fmtPdfNum(q.vat_amount) : '-'}</td>
              <td style="width:92px"></td>
            </tr>
            <tr>
              <td style="width:95px"></td>
              <td>Total - After TAX</td>
              <td style="width:106px;text-align:right;font-size:10.5pt;">${fmtPdfNum(q.total_after_tax)}</td>
              <td style="width:92px"></td>
            </tr>
          </table>

          ${footerHtml}
        </div>
      `;
    }

    const isMobileViewport = window.innerWidth <= 840;
    const fitMobile = state.fitMobileA4 !== false;
    const mobileZoom = (isMobileViewport && fitMobile)
      ? Math.max(0.38, Math.min(1, (window.innerWidth - 28) / 794)).toFixed(3)
      : 1;
    const activeTplObj = PRINT_TEMPLATES.find(x => x.id === tpl) || PRINT_TEMPLATES[0];
    const pickerOpen = Boolean(state.printPickerOpen);

    container.innerHTML = `
      <div class="card no-print" style="padding:12px 14px;margin-bottom:12px;">
        <div class="row-between">
          <div>
            <h2 class="card-title" style="margin:0">Xem Trước Bản In / Xuất PDF, Word & Excel</h2>
          </div>
          <div class="row">
            <select onchange="App.loadQuotationById(this.value)">
              ${state.quotations.map(sq => `
                <option value="${sq.id}" ${sq.id === q.id ? 'selected' : ''}>
                  [${esc(sq.quote_number)}] ${esc(sq.customer_name)}
                </option>
              `).join('')}
            </select>
            <button type="button" class="btn ${pickerOpen ? 'btn-navy' : ''}" onclick="App.togglePrintPicker()" title="Bấm để chọn 1 trong 12 mẫu biểu in & chỉnh Logo chìm giữa trang">
              <span class="tpl-swatch-row" style="margin-right:2px;">
                ${activeTplObj.swatches.map(c => `<span class="tpl-swatch" style="background:${c};height:13px;width:8px;"></span>`).join('')}
              </span>
              ${esc(activeTplObj.name)} ${pickerOpen ? '▴' : '▾'}
            </button>
            ${isMobileViewport ? `
              <button class="btn" onclick="App.toggleMobileA4Fit()">
                ${fitMobile ? '🔍 Phóng to 100%' : '📱 Thu vừa màn hình ĐT'}
              </button>
            ` : ''}
            <button class="btn" onclick="App.showTab('flow2')">
              ✏️ Chỉnh sửa
            </button>
            ${canUserMarkSent(q) ? `
              <button class="btn" style="background:#2563eb;color:#fff;border-color:#1d4ed8;" onclick="App.changeQuoteStatus(${q.id}, 'sent')">
                📨 Đánh dấu Đã gửi KH
              </button>
            ` : ''}
            <button class="btn" id="btnExportPdfDirect" onclick="App.exportActiveQuoteToPdf(this)" title="Tải trực tiếp file PDF (.pdf) chuẩn khổ A4 về máy (Không mở hộp thoại máy in)">
              📄 Xuất PDF (.pdf)
            </button>
            <button class="btn" onclick="App.exportActiveQuoteToWord()" title="Tải về file Word (.doc) theo mẫu đang chọn để chỉnh sửa trong Microsoft Word">
              📝 Xuất Word (.doc)
            </button>
            <button class="btn" onclick="App.exportActiveQuoteToExcel()" title="Tải về file Excel (.xlsx) chuẩn bảng tính báo giá KKVN">
              📊 Xuất Excel (.xlsx)
            </button>
            <button class="btn btn-navy" onclick="window.print()" title="Mở hộp thoại kết nối máy in để in giấy trực tiếp">
              🖨️ In
            </button>
          </div>
        </div>

        <div class="print-quick-opts-bar">
          <div class="cfg-pill-group">
            <span class="cfg-pill-label">Hiển thị giá:</span>
            <button type="button" class="btn btn-sm ${rendered.mode === 'itemized' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuotePriceDisplayMode('itemized')">Chi tiết</button>
            <button type="button" class="btn btn-sm ${rendered.mode === 'per_section' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuotePriceDisplayMode('per_section')">1 giá từng hệ</button>
            <button type="button" class="btn btn-sm ${rendered.mode === 'single_total' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuotePriceDisplayMode('single_total')">1 giá tổng</button>
            <button type="button" class="btn btn-sm ${rendered.mode === 'custom_groups' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuotePriceDisplayMode('custom_groups')">Gộp nhóm</button>
          </div>
          <div class="cfg-pill-group">
            <span class="cfg-pill-label">Thông số:</span>
            <button type="button" class="btn btn-sm ${rendered.specLevel === 'basic' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuoteSpecDetailLevel('basic')">Cơ bản (Gọn)</button>
            <button type="button" class="btn btn-sm ${rendered.specLevel === 'detailed' ? 'btn-navy' : ''}" style="padding:2px 8px;font-size:11.5px;" onclick="App.setQuoteSpecDetailLevel('detailed')">Chi tiết (Đầy đủ)</button>
          </div>
        </div>

        ${pickerOpen ? `
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">
            <div class="template-picker-grid">
              ${PRINT_TEMPLATES.map(item => `
                <button type="button" class="tpl-card ${tpl === item.id ? 'active' : ''}" onclick="App.setPrintTemplate('${item.id}')" title="${esc(item.desc)}">
                  <span class="tpl-swatch-row">
                    ${item.swatches.map(c => `<span class="tpl-swatch" style="background:${c};"></span>`).join('')}
                  </span>
                  <span class="tpl-card-title">${esc(item.name)}</span>
                </button>
              `).join('')}
            </div>

            <div class="watermark-controls-bar">
              <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--navy);cursor:pointer;">
                <input type="checkbox" ${showWatermark ? 'checked' : ''} onchange="App.togglePrintWatermark(this.checked)" style="width:15px;height:15px;">
                💧 Logo chìm giữa trang
              </label>

              <div class="row" style="align-items:center;gap:10px;">
                ${showWatermark ? `
                  <div class="row" style="align-items:center;gap:4px;">
                    <span style="font-size:11.5px;font-weight:700;color:var(--muted);">Độ mờ:</span>
                    ${[
                      { v: 0.06, lbl: '6%' },
                      { v: 0.10, lbl: '10%' },
                      { v: 0.15, lbl: '15%' },
                      { v: 0.22, lbl: '22%' }
                    ].map(o => `
                      <button type="button" class="btn btn-sm ${Math.abs(wmOpacity - o.v) < 0.005 ? 'btn-navy' : ''}"
                              style="padding:2px 7px;font-size:11.5px;"
                              onclick="App.setPrintWatermarkOpacity(${o.v})">${o.lbl}</button>
                    `).join('')}
                  </div>

                  <div class="row" style="align-items:center;gap:4px;">
                    <span style="font-size:11.5px;font-weight:700;color:var(--muted);">Cỡ Logo:</span>
                    ${[
                      { v: 380, lbl: 'Vừa' },
                      { v: 490, lbl: 'To' },
                      { v: 590, lbl: 'Rất to' }
                    ].map(sz => `
                      <button type="button" class="btn btn-sm ${wmSize === sz.v ? 'btn-navy' : ''}"
                              style="padding:2px 7px;font-size:11.5px;"
                              onclick="App.setPrintWatermarkSize(${sz.v})">${sz.lbl}</button>
                    `).join('')}
                  </div>
                ` : ''}
                <button type="button" class="btn btn-sm" onclick="App.togglePrintPicker()" style="padding:2px 9px;font-size:11.5px;">
                  ▲ Thu gọn
                </button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="a4-preview-wrapper ${isMobileViewport && fitMobile ? 'mobile-fit-mode' : ''}">
        <div class="kkvn-sheet tpl-${esc(tpl)}" style="${mobileZoom < 1 ? `zoom: ${mobileZoom};` : ''}">
          ${watermarkLayerHtml}
          ${sheetBodyHtml}
        </div>
      </div>
    `;

    // Tách nền trắng & tạo sẵn PNG Watermark trong suốt cho hiển thị và xuất PDF/Word cực sắc nét
    if (showWatermark) {
      getTransparentWatermarkDataUrl(wmOpacity).then(pngUrl => {
        const wmEl = document.getElementById('sheetWatermarkImg');
        if (wmEl && pngUrl) {
          wmEl.src = pngUrl;
          wmEl.style.opacity = '1';
          wmEl.style.mixBlendMode = 'normal';
        }
      });
    }
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
      clone.style.boxShadow = 'none';
      clone.style.boxSizing = 'border-box';
      clone.style.background = '#ffffff';

      // Đảm bảo Watermark Logo chìm giữa trang dùng ảnh PNG đã tách nền trắng & đúng độ mờ opacity để html2canvas vẽ chuẩn xác 100%
      const wmImg = clone.querySelector('.kkvn-watermark-img');
      if (wmImg) {
        const wmOpacity = Number(state.printWatermarkOpacity || 0.10);
        const wmDataUrl = await getTransparentWatermarkDataUrl(wmOpacity);
        if (wmDataUrl) {
          wmImg.setAttribute('src', wmDataUrl);
          wmImg.style.opacity = '1';
          wmImg.style.mixBlendMode = 'normal';
        }
      }

      // Nhúng các ảnh Logo & Con dấu khác sang Base64 trên bản sao để html2canvas vẽ đầy đủ 100%
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

    const tpl = state.printTemplate || 'executive';
    const showWatermark = state.printWatermark !== false;
    const wmOpacity = Number(state.printWatermarkOpacity || 0.10);
    const wmSizePt = Math.round(Number(state.printWatermarkSize || 490) * 0.72);
    const wmHeightPt = Math.round(wmSizePt * 0.46);

    const themeColorsMap = {
      'executive': { primary: '#1f3864', headBg: '#1f3864', headFg: '#ffffff', secBg: '#e2e8f0', grandBg: '#1f3864', grandFg: '#ffffff', accent: '#4e954d' },
      'kyowa-green': { primary: '#2e7d32', headBg: '#2e7d32', headFg: '#ffffff', secBg: '#e8f5e9', grandBg: '#2e7d32', grandFg: '#ffffff', accent: '#4e954d' },
      'japanese-jis': { primary: '#111827', headBg: '#f1f5f9', headFg: '#111827', secBg: '#f3f4f6', grandBg: '#f8fafc', grandFg: '#111827', accent: '#111827' },
      'classic': { primary: '#1f3864', headBg: '#e2e8f0', headFg: '#000000', secBg: '#f1f5f9', grandBg: '#f0fdf4', grandFg: '#000000', accent: '#1f3864' },
      'luxury-gold': { primary: '#0f172a', headBg: '#0f172a', headFg: '#f8e3a3', secBg: '#fef9e7', grandBg: '#0f172a', grandFg: '#f8e3a3', accent: '#c59b27' },
      'crimson-fdi': { primary: '#991b1b', headBg: '#991b1b', headFg: '#ffffff', secBg: '#fee2e2', grandBg: '#991b1b', grandFg: '#ffffff', accent: '#991b1b' },
      'tech-blueprint': { primary: '#0c4a6e', headBg: '#0c4a6e', headFg: '#e0f2fe', secBg: '#e0f2fe', grandBg: '#0c4a6e', grandFg: '#ffffff', accent: '#0284c7' },
      'minimal-mono': { primary: '#111827', headBg: '#ffffff', headFg: '#111827', secBg: '#f3f4f6', grandBg: '#ffffff', grandFg: '#111827', accent: '#111827' },
      'emerald-teal': { primary: '#0f766e', headBg: '#0f766e', headFg: '#ffffff', secBg: '#ccfbf1', grandBg: '#0f766e', grandFg: '#ffffff', accent: '#14b8a6' },
      'royal-indigo': { primary: '#312e81', headBg: '#312e81', headFg: '#ffffff', secBg: '#e0e7ff', grandBg: '#312e81', grandFg: '#ffffff', accent: '#4338ca' },
      'bronze-heritage': { primary: '#78350f', headBg: '#78350f', headFg: '#fef3c7', secBg: '#fef3c7', grandBg: '#78350f', grandFg: '#fef3c7', accent: '#b45309' },
      'slate-sidebar': { primary: '#0f172a', headBg: '#1e293b', headFg: '#ffffff', secBg: '#f1f5f9', grandBg: '#059669', grandFg: '#ffffff', accent: '#059669' }
    };
    const themeColors = themeColorsMap[tpl] || themeColorsMap['executive'];

    const [logoDataUrl, stampDataUrl, wmDataUrl] = await Promise.all([
      fetchImageAsDataUrl('/assets/kkvn_logo.jpg'),
      fetchImageAsDataUrl(stampImgPath),
      showWatermark ? getTransparentWatermarkDataUrl(wmOpacity) : Promise.resolve(null)
    ]);

    const rendered = buildRenderedQuoteRows(q);
    let itemsRowsWord = '';
    rendered.rows.forEach(r => {
      if (r.kind === 'sec_header') {
        itemsRowsWord += `
          <tr>
            <td colspan="7" style="border:1pt solid #000; padding:4pt 6pt; font-weight:bold; background:#f2f4f8;">
              ${esc(r.title)}
            </td>
          </tr>
        `;
      } else if (r.kind === 'item') {
        const bgRow = (r.rowClass === 'group-parent-row' || r.rowClass === 'bundle-section-row') ? 'background:#f8fafc;' : '';
        itemsRowsWord += `
          <tr>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; font-weight:bold; ${bgRow}">${esc(r.stt)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; font-weight:bold; ${bgRow}">${esc(r.title)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; ${bgRow}">${esc(r.unit)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; ${bgRow}">${esc(r.qty)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; text-align:right; ${bgRow}">${r.hidePrices ? '' : fmtPdfNum(r.unitPrice)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 6pt; text-align:right; font-weight:bold; ${bgRow}">${r.hidePrices ? '' : fmtPdfNum(r.totalPrice)}</td>
            <td style="border:1pt solid #000; padding:3.5pt 4pt; text-align:center; font-weight:bold; ${bgRow}">${esc(r.remark || '')}</td>
          </tr>
        `;
      } else if (r.kind === 'spec_line') {
        const padLeft = r.indentLevel >= 2 ? '24pt' : '16pt';
        itemsRowsWord += `
          <tr>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 6pt 2pt ${padLeft};">${esc(r.text)}</td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
          </tr>
        `;
      } else if (r.kind === 'sub_line') {
        const padLeft = r.indentLevel >= 2 ? '22pt' : '10pt';
        itemsRowsWord += `
          <tr>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 6pt 2pt ${padLeft};">
              <span>${esc(r.text)}</span>
              ${r.rightText ? `<span style="float:right; font-weight:bold;"> &nbsp;&nbsp; ${esc(r.rightText)}</span>` : ''}
            </td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000;"></td>
            <td style="border-left:1pt solid #000; border-right:1pt solid #000; padding:2pt 4pt; text-align:center; font-weight:bold;">${esc(r.remark || '')}</td>
          </tr>
        `;
      } else if (r.kind === 'subtotal') {
        itemsRowsWord += `
          <tr>
            <td colspan="5" style="border:1pt solid #000; padding:4pt 8pt; text-align:center; font-weight:bold; background:#f8fafc;">
              ${esc(r.label || 'TOTAL')}
            </td>
            <td style="border:1pt solid #000; padding:4pt 6pt; text-align:right; font-weight:bold; background:#f8fafc;">
              ${fmtPdfNum(r.amount)}
            </td>
            <td style="border:1pt solid #000; background:#f8fafc;"></td>
          </tr>
        `;
      }
    });

    const anySecSubtotal = rendered.showBeforeTaxInSummary;

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
<div class="WordSection1" style="${tpl === 'japanese-jis' ? 'border:2.25pt double #111827; padding:10pt;' : ''}">
  ${(showWatermark && wmDataUrl) ? `
    <!--[if gte vml 1]>
    <v:shape id="KKVNWatermark" type="#_x0000_t75"
      style="position:absolute;left:0;text-align:left;margin-left:55pt;margin-top:260pt;width:${wmSizePt}pt;height:${wmHeightPt}pt;z-index:-251658240;mso-position-horizontal:center;mso-position-horizontal-relative:page;mso-position-vertical:center;mso-position-vertical-relative:page">
      <v:imagedata src="${wmDataUrl}" o:title="KKVN Watermark"/>
    </v:shape>
    <![endif]-->
  ` : ''}
  <!-- TOP HEADER -->
  <table width="100%" style="margin-bottom:6pt; border-top:3pt solid ${themeColors.primary}; padding-top:4pt;">
    <tr>
      <td width="28%" valign="top">
        ${logoDataUrl ? `<img src="${logoDataUrl}" width="115" height="36" alt="KKVN"><br>` : ''}
        <div style="font-size:10.5pt; margin-top:2pt;">${qNoHtml}</div>
      </td>
      <td width="44%" valign="middle" align="center">
        <div style="font-size:16pt; font-weight:bold; letter-spacing:0.5pt; color:${themeColors.primary};">${esc(q.doc_title || '御見積 BÁO GIÁ')}</div>
      </td>
      <td width="28%" valign="bottom" align="right" style="font-size:10pt; font-weight:bold; color:#b91c1c;">
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
  <table width="100%" style="border:1.5pt solid ${themeColors.primary}; font-size:9.5pt;">
    <thead>
      <tr style="background:${themeColors.headBg}; color:${themeColors.headFg};">
        <th width="6%" style="border:1pt solid ${themeColors.primary}; padding:4pt 2pt; text-align:center; color:${themeColors.headFg};">番号<br>STT</th>
        <th width="42%" style="border:1pt solid ${themeColors.primary}; padding:4pt 4pt; text-align:center; color:${themeColors.headFg};">明細<br>Chi Tiết</th>
        <th width="9%" style="border:1pt solid ${themeColors.primary}; padding:4pt 2pt; text-align:center; color:${themeColors.headFg};">単位<br>Đơn Vị</th>
        <th width="6%" style="border:1pt solid ${themeColors.primary}; padding:4pt 2pt; text-align:center; color:${themeColors.headFg};">数<br>SL</th>
        <th width="12%" style="border:1pt solid ${themeColors.primary}; padding:4pt 4pt; text-align:center; color:${themeColors.headFg};">単価<br>Đơn giá</th>
        <th width="13%" style="border:1pt solid ${themeColors.primary}; padding:4pt 4pt; text-align:center; color:${themeColors.headFg};">金額(VND)<br>Thành Tiền</th>
        <th width="12%" style="border:1pt solid ${themeColors.primary}; padding:4pt 2pt; text-align:center; color:${themeColors.headFg};">備考<br>Ghi Chú</th>
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

    // Items & Sections (Đồng bộ 4 chế độ hiển thị giá & 2 mức thông số với Bản in / Word)
    const renderedXlsx = buildRenderedQuoteRows(q);
    renderedXlsx.rows.forEach(r => {
      if (r.kind === 'sec_header') {
        const rSec = addRow({
          A: { v: r.title, s: 8 },
          B: { v: '', s: 8 }, C: { v: '', s: 8 }, D: { v: '', s: 8 },
          E: { v: '', s: 8 }, F: { v: '', s: 8 }, G: { v: '', s: 8 }
        }, 20);
        merges.push(`A${rSec}:G${rSec}`);
      } else if (r.kind === 'item') {
        addRow({
          A: { v: r.stt || '', s: 9 },
          B: { v: r.title || '', s: 10 },
          C: { v: r.unit || '', s: 9 },
          D: { v: Number(r.qty || 1), t: 'n', s: 9 },
          E: r.hidePrices ? { v: '', s: 12 } : { v: Number(r.unitPrice || 0), t: 'n', s: 12 },
          F: r.hidePrices ? { v: '', s: 13 } : { v: Number(r.totalPrice || 0), t: 'n', s: 13 },
          G: { v: r.remark || '', s: 14 }
        }, 20);
      } else if (r.kind === 'spec_line') {
        const indent = r.indentLevel >= 2 ? '      ' : '   ';
        addRow({
          A: { v: '', s: 9 },
          B: { v: `${indent}${r.text}`, s: 11 },
          C: { v: '', s: 9 }, D: { v: '', s: 9 },
          E: { v: '', s: 12 }, F: { v: '', s: 13 }, G: { v: '', s: 14 }
        }, 18);
      } else if (r.kind === 'sub_line') {
        const indent = r.indentLevel >= 2 ? '      ' : '   ';
        const subText = r.rightText ? `${indent}${r.text}   (${r.rightText})` : `${indent}${r.text}`;
        addRow({
          A: { v: '', s: 9 },
          B: { v: subText, s: 11 },
          C: { v: '', s: 9 }, D: { v: '', s: 9 },
          E: { v: '', s: 12 }, F: { v: '', s: 13 },
          G: { v: r.remark || '', s: 14 }
        }, 18);
      } else if (r.kind === 'subtotal') {
        const rSub = addRow({
          A: { v: r.label || 'TOTAL', s: 15 },
          B: { v: '', s: 15 }, C: { v: '', s: 15 }, D: { v: '', s: 15 }, E: { v: '', s: 15 },
          F: { v: Number(r.amount || 0), t: 'n', s: 16 },
          G: { v: '', s: 15 }
        }, 20);
        merges.push(`A${rSub}:E${rSub}`);
      }
    });

    // Summary Rows
    if (renderedXlsx.showBeforeTaxInSummary) {
      const rPre = addRow({
        A: { v: t.total_label_before_tax || 'Total (A) + (B) - Before TAX', s: 15 },
        B: { v: '', s: 15 }, C: { v: '', s: 15 }, D: { v: '', s: 15 }, E: { v: '', s: 15 },
        F: { v: Number(q.subtotal_before_tax || 0), t: 'n', s: 16 },
        G: { v: '', s: 15 }
      }, 20);
      merges.push(`A${rPre}:E${rPre}`);
    }

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
        const ppl = resolveQuotePeople(q);
        const match =
          (q.quote_number || '').toLowerCase().includes(s) ||
          (q.customer_name || '').toLowerCase().includes(s) ||
          (q.project_name || '').toLowerCase().includes(s) ||
          (ppl.creatorName || '').toLowerCase().includes(s) ||
          (ppl.creatorUsername || '').toLowerCase().includes(s) ||
          (ppl.creatorHandle || '').toLowerCase().includes(s) ||
          (ppl.picName || '').toLowerCase().includes(s) ||
          (ppl.picPhone || '').toLowerCase().includes(s) ||
          (ppl.approverName || '').toLowerCase().includes(s) ||
          (ppl.approvedBy || '').toLowerCase().includes(s);
        if (!match) return false;
      }
      return true;
    });

    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Quản Lý Hồ Sơ & Phê Duyệt Báo Giá</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              ${state.permissions.canViewAllQuotes ? 'Hiển thị toàn bộ báo giá trong hệ thống' : 'Chế độ giới hạn: Chỉ hiển thị các báo giá do bạn tạo hoặc đứng tên phụ trách.'}
            </p>
          </div>
          <div class="col">
            <input type="text" id="quoteSearchInput" placeholder="Tìm số BG, KH, dự án, người tạo, đảm trách, người duyệt..." value="${esc(state.quoteSearch)}"
                   oninput="App.setQuoteFilter('search', this.value)" style="flex:1 1 250px;">
            <select onchange="App.setQuoteFilter('status', this.value)">
              <option value="ALL" ${state.quoteStatusFilter === 'ALL' ? 'selected' : ''}>Tất cả trạng thái (${state.quotations.length})</option>
              <option value="draft" ${state.quoteStatusFilter === 'draft' ? 'selected' : ''}>Bản nháp</option>
              <option value="pending_approval" ${state.quoteStatusFilter === 'pending_approval' ? 'selected' : ''}>Chờ duyệt</option>
              <option value="approved" ${state.quoteStatusFilter === 'approved' ? 'selected' : ''}>Đã duyệt</option>
              <option value="sent" ${state.quoteStatusFilter === 'sent' ? 'selected' : ''}>Đã gửi KH</option>
              <option value="rejected" ${state.quoteStatusFilter === 'rejected' ? 'selected' : ''}>Cần chỉnh sửa</option>
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
                <th style="width:96px; min-width:90px;">Số Báo Giá</th>
                <th style="width:82px; min-width:78px;">Ngày BG</th>
                <th style="min-width:210px;">Khách Hàng & Dự Án</th>
                <th style="width:168px; min-width:155px;" title="Dòng 1: Người tạo hồ sơ · Dòng 2: Người đảm trách (PIC) · Dòng 3: Người duyệt">Nhân Sự</th>
                <th class="c" style="width:80px;">Cập Nhật</th>
                ${showCost ? '<th class="r cost-col" style="width:116px;">Tổng Giá Cost</th>' : ''}
                <th class="r" style="width:118px;">Tổng Trước Thuế</th>
                <th class="c" style="width:46px;">VAT</th>
                <th class="r" style="width:122px;">Tổng Sau Thuế</th>
                <th class="c" style="width:90px;">Trạng Thái</th>
                <th class="c" style="width:136px;">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length > 0 ? filtered.map(q => {
      const canEditRow = canUserEditQuote(q);
      const canMarkSentRow = canUserMarkSent(q);
      const ppl = resolveQuotePeople(q);
      const viewTooltip = (q.status === 'approved' || q.status === 'sent')
        ? `Báo giá ${q.status === 'sent' ? 'Đã gửi KH' : 'Đã duyệt'} (Khóa chỉnh sửa - Nhấn để xem chi tiết)`
        : `Báo giá do ${ppl.creatorName} (${ppl.creatorHandle}) tạo (Chế độ Chỉ xem)`;

      const displayApproverMain = (ppl.approverName && ppl.approverName !== '—')
        ? ppl.approverName
        : (ppl.approvedBy || '—');

      const dtStr = ppl.approvedAt ? formatDateTimeVN(ppl.approvedAt) : '';
      const approverTitle = (q.status === 'approved' || q.status === 'sent')
        ? `Người duyệt: ${displayApproverMain}${ppl.isDiffActualApprover ? ` | Thực duyệt: ${ppl.approvedBy}` : ''}${dtStr ? ` (${dtStr})` : ''}`
        : `Người duyệt: ${displayApproverMain}`;

      return `
                <tr>
                  <td style="white-space:nowrap;">
                    <strong style="color:var(--navy)">${esc(q.quote_number)}</strong>
                    <div style="font-size:11px;color:var(--muted)">Rev ${String(q.revision || 1).padStart(2, '0')}</div>
                  </td>
                  <td style="white-space:nowrap;">${esc(formatDateDMY(q.quote_date))}</td>
                  <td>
                    <strong>${esc(q.customer_name)}</strong>
                    <div style="font-size:12px;color:var(--muted)">${esc(q.project_name || q.install_location || '—')}</div>
                  </td>
                  <td class="q-people-merged">
                    <div class="q-p-line" title="Người tạo hồ sơ: ${esc(ppl.creatorName)}${ppl.creatorHandle ? ` (${esc(ppl.creatorHandle)})` : ''}">
                      <span class="q-p-lbl creator">Tạo:</span>
                      <span class="q-p-val">${esc(ppl.creatorName)}</span>
                    </div>
                    <div class="q-p-line" title="担当者 Đảm trách (PIC): ${esc(ppl.picName)}${ppl.picPhone ? ` · ${esc(ppl.picPhone)}` : ''}">
                      <span class="q-p-lbl creator">PIC:</span>
                      <span class="q-p-val pic">${esc(ppl.picName)}</span>
                    </div>
                    <div class="q-p-line" title="${esc(approverTitle)}">
                      <span class="q-p-lbl creator">Duyệt:</span>
                      <span class="q-p-val">${esc(displayApproverMain)}</span>
                      ${(q.status === 'approved' || q.status === 'sent')
                        ? `<span class="q-p-tick" title="${esc(approverTitle)}">✓</span>`
                        : ''}
                    </div>
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
    }).join('') : `
                <tr>
                  <td colspan="${showCost ? 11 : 10}" class="c" style="padding:18px;color:var(--muted);">
                    Không tìm thấy hồ sơ báo giá nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              `}
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
    const ppl = resolveQuotePeople(target);

    openConfirmModal({
      title: '⚠️ Xác Nhận Xóa Hồ Sơ Báo Giá',
      okText: '🗑 Xác nhận Xóa vĩnh viễn',
      isDanger: true,
      messageHtml: `
        Bạn có chắc chắn muốn <strong style="color:var(--red)">XÓA VĨNH VIỄN</strong> hồ sơ báo giá này khỏi hệ thống?
        <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin:10px 0;font-size:13px;line-height:1.5;">
          <div>• Số báo giá: <strong style="color:var(--red)">${esc(qNum)}</strong></div>
          <div>• Khách hàng: <strong>${esc(cName)}</strong></div>
          <div>• Người tạo: <strong>${esc(ppl.creatorName)}</strong>${ppl.creatorHandle && !ppl.creatorName.startsWith('@') ? ` (${esc(ppl.creatorHandle)})` : ''}</div>
          <div>• Người đảm trách (PIC): <strong>${esc(ppl.picName)}</strong></div>
          <div>• Người duyệt: <strong>${esc(ppl.approverName)}</strong></div>
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
  // TAB 5: QUẢN LÝ SẢN PHẨM, THIẾT BỊ & DỊCH VỤ (MASTER DATA & EXCEL)
  // ===========================================================================
  function getFilteredAndSortedModels() {
    const search = (state.catModelSearch || '').trim().toLowerCase();
    const list = state.models.filter(m => {
      if (state.catFilterProd !== 'ALL' && m.product_line !== state.catFilterProd) return false;
      if (search) {
        const hay = [
          m.product_line,
          m.model_code,
          `model ${m.model_code}`,
          String(m.flow_rate),
          m.fan_model,
          `${m.motor_kw}kw`,
          `${m.fan_pressure_pa}pa`,
          m.pump_model
        ].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const sortKey = state.catModelSort || 'default';
    if (sortKey === 'default') return list;

    const sorted = [...list];
    const numCode = (c) => {
      const n = parseFloat(String(c || '').replace(/[^0-9.]/g, ''));
      return Number.isNaN(n) ? 0 : n;
    };

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'prod_asc': return String(a.product_line || '').localeCompare(String(b.product_line || ''));
        case 'prod_desc': return String(b.product_line || '').localeCompare(String(a.product_line || ''));
        case 'model_asc': return numCode(a.model_code) - numCode(b.model_code) || String(a.model_code).localeCompare(String(b.model_code));
        case 'model_desc': return numCode(b.model_code) - numCode(a.model_code) || String(b.model_code).localeCompare(String(a.model_code));
        case 'flow_asc': return Number(a.flow_rate || 0) - Number(b.flow_rate || 0);
        case 'flow_desc': return Number(b.flow_rate || 0) - Number(a.flow_rate || 0);
        case 'tower_base_asc': return Number(a.tower_base || 0) - Number(b.tower_base || 0);
        case 'tower_base_desc': return Number(b.tower_base || 0) - Number(a.tower_base || 0);
        case 'fan_base_asc': return Number(a.fan_base || 0) - Number(b.fan_base || 0);
        case 'fan_base_desc': return Number(b.fan_base || 0) - Number(a.fan_base || 0);
        case 'pump_base_asc': return Number(a.pump_base || 0) - Number(b.pump_base || 0);
        case 'pump_base_desc': return Number(b.pump_base || 0) - Number(a.pump_base || 0);
        case 'total_cost_asc': return Number(a.total_cost || 0) - Number(b.total_cost || 0);
        case 'total_cost_desc': return Number(b.total_cost || 0) - Number(a.total_cost || 0);
        case 'total_base_asc': return Number(a.total_base || 0) - Number(b.total_base || 0);
        case 'total_base_desc': return Number(b.total_base || 0) - Number(a.total_base || 0);
        default: return 0;
      }
    });
    return sorted;
  }

  function getFilteredAndSortedEquip() {
    const search = (state.equipSearch || '').trim().toLowerCase();
    const list = state.equipment.filter(e => {
      if (state.equipFilterCat !== 'ALL' && e.category !== state.equipFilterCat) return false;
      if (search) {
        const hay = [
          e.category,
          e.name_jp,
          e.name_vi,
          e.specs,
          e.unit,
          e.origin_note
        ].join(' ').toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const sortKey = state.equipSort || 'default';
    if (sortKey === 'default') return list;

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'cat_asc': return String(a.category || '').localeCompare(String(b.category || ''));
        case 'cat_desc': return String(b.category || '').localeCompare(String(a.category || ''));
        case 'jp_asc': return String(a.name_jp || '').localeCompare(String(b.name_jp || ''));
        case 'jp_desc': return String(b.name_jp || '').localeCompare(String(a.name_jp || ''));
        case 'name_asc': return String(a.name_vi || '').localeCompare(String(b.name_vi || ''), 'vi');
        case 'name_desc': return String(b.name_vi || '').localeCompare(String(a.name_vi || ''), 'vi');
        case 'cost_asc': return Number(a.cost_price || 0) - Number(b.cost_price || 0);
        case 'cost_desc': return Number(b.cost_price || 0) - Number(a.cost_price || 0);
        case 'base_asc': return Number(a.base_price ?? -1) - Number(b.base_price ?? -1);
        case 'base_desc': return Number(b.base_price ?? -1) - Number(a.base_price ?? -1);
        default: return 0;
      }
    });
    return sorted;
  }

  function sortIconHtml(currentSort, prefix) {
    if (currentSort === `${prefix}_asc`) return ' <span style="color:var(--green)">↑</span>';
    if (currentSort === `${prefix}_desc`) return ' <span style="color:var(--red)">↓</span>';
    return ' <span style="opacity:0.35;font-size:11px;">⇅</span>';
  }

  function renderCatalogView() {
    const container = document.getElementById('view-catalog');
    if (!container) return;

    const showCost = state.permissions.canViewCost;
    const canManageCat = state.permissions.canManageCatalog;
    const canExport = state.permissions.canExportExcel || canManageCat;
    const productLines = [...new Set(state.models.map(m => m.product_line))];
    const filteredModels = getFilteredAndSortedModels();
    const filteredEquip = getFilteredAndSortedEquip();
    const mSort = state.catModelSort || 'default';
    const eSort = state.equipSort || 'default';

    const activeEl = document.activeElement;
    const focusId = (activeEl && (activeEl.id === 'catModelSearchInput' || activeEl.id === 'equipSearchInput'))
      ? activeEl.id
      : null;
    const selStart = focusId ? activeEl.selectionStart : null;
    const selEnd = focusId ? activeEl.selectionEnd : null;

    container.innerHTML = `
      <div class="card">
        <div class="row-between">
          <div>
            <h2 class="card-title">Quản Lý Sản Phẩm, Thiết Bị & Dịch Vụ</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--muted)">
              ${state.models.length} cấu hình Sản phẩm Hệ tháp (Giá Cost & Giá Cơ Bản) và ${state.equipment.length} thiết bị đo, quạt, bơm, phụ kiện, dịch vụ.
            </p>
          </div>
          <div class="row">
            ${canExport ? `
              <a class="btn btn-navy" href="/api/catalog/export-excel?token=${encodeURIComponent(state.authToken)}" download="Data_bao_gia_Kyowa_Kako.xlsx" style="text-decoration:none">
                📤 Xuất Danh Mục Ra Excel (.xlsx 3 Sheet)
              </a>
            ` : ''}
            ${canManageCat ? `
              <label class="btn btn-primary" style="cursor:pointer;margin:0;">
                📥 Nhập / Cập Nhật Từ File Excel (.xlsx)
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
          <div class="row" style="align-items:center; flex:1;">
            <h3 class="card-title" style="margin:0;">1. Bảng Giá Cấu Hình Hệ Tháp (${filteredModels.length}/${state.models.length} Model)</h3>
            <select onchange="App.setCatFilterProd(this.value)">
              <option value="ALL" ${state.catFilterProd === 'ALL' ? 'selected' : ''}>Tất cả dòng tháp (${state.models.length})</option>
              ${productLines.map(p => `<option value="${esc(p)}" ${state.catFilterProd === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
            </select>
            <input type="text" id="catModelSearchInput"
                   placeholder="Tìm dòng SP, mã model, lưu lượng, quạt, bơm..."
                   value="${esc(state.catModelSearch || '')}"
                   oninput="App.setCatModelSearch(this.value)"
                   style="flex:1 1 210px;">
            <select onchange="App.setCatModelSort(this.value)" title="Sắp xếp bảng cấu hình Hệ tháp">
              <option value="default" ${mSort === 'default' ? 'selected' : ''}>⇅ Sắp xếp: Mặc định</option>
              <option value="flow_asc" ${mSort === 'flow_asc' ? 'selected' : ''}>Lưu lượng: Thấp → Cao (↑)</option>
              <option value="flow_desc" ${mSort === 'flow_desc' ? 'selected' : ''}>Lưu lượng: Cao → Thấp (↓)</option>
              <option value="total_base_asc" ${mSort === 'total_base_asc' ? 'selected' : ''}>Tổng Giá Cơ Bản: Thấp → Cao (↑)</option>
              <option value="total_base_desc" ${mSort === 'total_base_desc' ? 'selected' : ''}>Tổng Giá Cơ Bản: Cao → Thấp (↓)</option>
              <option value="tower_base_asc" ${mSort === 'tower_base_asc' ? 'selected' : ''}>Giá Tháp (CB): Thấp → Cao (↑)</option>
              <option value="tower_base_desc" ${mSort === 'tower_base_desc' ? 'selected' : ''}>Giá Tháp (CB): Cao → Thấp (↓)</option>
              ${showCost ? `
                <option value="total_cost_asc" ${mSort === 'total_cost_asc' ? 'selected' : ''}>Tổng Giá Cost: Thấp → Cao (↑)</option>
                <option value="total_cost_desc" ${mSort === 'total_cost_desc' ? 'selected' : ''}>Tổng Giá Cost: Cao → Thấp (↓)</option>
              ` : ''}
              <option value="model_asc" ${mSort === 'model_asc' ? 'selected' : ''}>Mã Model: Nhỏ → Lớn (↑)</option>
              <option value="model_desc" ${mSort === 'model_desc' ? 'selected' : ''}>Mã Model: Lớn → Nhỏ (↓)</option>
              <option value="prod_asc" ${mSort === 'prod_asc' ? 'selected' : ''}>Dòng SP: A → Z (↑)</option>
              <option value="prod_desc" ${mSort === 'prod_desc' ? 'selected' : ''}>Dòng SP: Z → A (↓)</option>
            </select>
            ${(state.catModelSearch || state.catFilterProd !== 'ALL' || mSort !== 'default') ? `
              <button class="btn btn-sm" onclick="App.resetCatModelFilter()" title="Xóa bộ lọc và sắp xếp">✕ Đặt lại</button>
            ` : ''}
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
                <th style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('prod')" title="Nhấn để sắp xếp theo Dòng SP">Dòng SP${sortIconHtml(mSort, 'prod')}</th>
                <th style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('model')" title="Nhấn để sắp xếp theo Mã Model">Model${sortIconHtml(mSort, 'model')}</th>
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('flow')" title="Nhấn để sắp xếp theo Lưu lượng">Lưu lượng${sortIconHtml(mSort, 'flow')}</th>
                ${showCost ? '<th class="r cost-col">Tháp (Cost)</th>' : ''}
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('tower_base')" title="Nhấn để sắp xếp theo Giá Tháp">Tháp (Cơ bản)${sortIconHtml(mSort, 'tower_base')}</th>
                <th>Quạt (Motor/Pa)</th>
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('fan_base')" title="Nhấn để sắp xếp theo Giá Quạt">Giá Quạt (CB)${sortIconHtml(mSort, 'fan_base')}</th>
                <th>Dòng Bơm</th>
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('pump_base')" title="Nhấn để sắp xếp theo Giá Bơm">Giá Bơm (CB)${sortIconHtml(mSort, 'pump_base')}</th>
                <th class="r">Tủ điện (CB)</th>
                <th class="r">Stage (CB)</th>
                <th class="r">QL & TK (CB)</th>
                ${showCost ? `<th class="r cost-col" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('total_cost')" title="Nhấn để sắp xếp theo Tổng Cost">Tổng Cost${sortIconHtml(mSort, 'total_cost')}</th>` : ''}
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleCatModelColSort('total_base')" title="Nhấn để sắp xếp theo Tổng Giá Cơ Bản">Tổng Giá Cơ Bản${sortIconHtml(mSort, 'total_base')}</th>
              </tr>
            </thead>
            <tbody>
              ${filteredModels.length > 0 ? filteredModels.map(m => `
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
              `).join('') : `
                <tr>
                  <td colspan="${showCost ? 14 : 12}" class="c" style="padding:18px;color:var(--muted);">
                    Không tìm thấy Model tháp nào phù hợp với từ khóa "${esc(state.catModelSearch)}".
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="row" style="align-items:center; flex:1;">
            <h3 class="card-title" style="margin:0;">2. Danh Mục khác (${filteredEquip.length}/${state.equipment.length})</h3>
            <select onchange="App.setEquipFilterCat(this.value)">
              <option value="ALL" ${state.equipFilterCat === 'ALL' ? 'selected' : ''}>Tất cả nhóm (${state.equipment.length})</option>
              <option value="instrument" ${state.equipFilterCat === 'instrument' ? 'selected' : ''}>Thiết bị đo (Sheet 3 Excel)</option>
              <option value="option" ${state.equipFilterCat === 'option' ? 'selected' : ''}>Option Hệ tháp (pH, Bồn hóa chất, INV...)</option>
              <option value="fan" ${state.equipFilterCat === 'fan' ? 'selected' : ''}>Quạt hút lẻ (Exhaust Fan)</option>
              <option value="pump" ${state.equipFilterCat === 'pump' ? 'selected' : ''}>Bơm tuần hoàn lẻ (Pump)</option>
              <option value="service" ${state.equipFilterCat === 'service' ? 'selected' : ''}>Dịch vụ (Thiết kế, Vận chuyển, Lắp đặt...)</option>
            </select>
            <input type="text" id="equipSearchInput"
                   placeholder="Tìm tên thiết bị/dịch vụ, tiếng Nhật, thông số, xuất xứ..."
                   value="${esc(state.equipSearch || '')}"
                   oninput="App.setEquipSearch(this.value)"
                   style="flex:1 1 210px;">
            <select onchange="App.setEquipSort(this.value)" title="Sắp xếp bảng Thiết bị & Dịch vụ">
              <option value="default" ${eSort === 'default' ? 'selected' : ''}>⇅ Sắp xếp: Mặc định</option>
              <option value="base_asc" ${eSort === 'base_asc' ? 'selected' : ''}>Đơn giá cơ bản: Thấp → Cao (↑)</option>
              <option value="base_desc" ${eSort === 'base_desc' ? 'selected' : ''}>Đơn giá cơ bản: Cao → Thấp (↓)</option>
              ${showCost ? `
                <option value="cost_asc" ${eSort === 'cost_asc' ? 'selected' : ''}>Giá Cost: Thấp → Cao (↑)</option>
                <option value="cost_desc" ${eSort === 'cost_desc' ? 'selected' : ''}>Giá Cost: Cao → Thấp (↓)</option>
              ` : ''}
              <option value="name_asc" ${eSort === 'name_asc' ? 'selected' : ''}>Tên Thiết Bị / Dịch Vụ: A → Z (↑)</option>
              <option value="name_desc" ${eSort === 'name_desc' ? 'selected' : ''}>Tên Thiết Bị / Dịch Vụ: Z → A (↓)</option>
              <option value="cat_asc" ${eSort === 'cat_asc' ? 'selected' : ''}>Nhóm: A → Z (↑)</option>
              <option value="cat_desc" ${eSort === 'cat_desc' ? 'selected' : ''}>Nhóm: Z → A (↓)</option>
            </select>
            ${(state.equipSearch || state.equipFilterCat !== 'ALL' || eSort !== 'default') ? `
              <button class="btn btn-sm" onclick="App.resetEquipFilter()" title="Xóa bộ lọc và sắp xếp">✕ Đặt lại</button>
            ` : ''}
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
                <th style="cursor:pointer;user-select:none;" onclick="App.toggleEquipColSort('cat')" title="Nhấn để sắp xếp theo Nhóm">Nhóm${sortIconHtml(eSort, 'cat')}</th>
                <th style="min-width:110px;cursor:pointer;user-select:none;" onclick="App.toggleEquipColSort('jp')" title="Nhấn để sắp xếp theo Tên tiếng Nhật">Tên tiếng Nhật${sortIconHtml(eSort, 'jp')}</th>
                <th style="min-width:210px;cursor:pointer;user-select:none;" onclick="App.toggleEquipColSort('name')" title="Nhấn để sắp xếp theo Tên Thiết Bị / Dịch Vụ">Tên Thiết Bị / Dịch Vụ (Tiếng Việt)${sortIconHtml(eSort, 'name')}</th>
                <th style="min-width:170px;">Thông số kỹ thuật</th>
                <th class="c">Đơn vị</th>
                ${showCost ? `<th class="r cost-col" style="cursor:pointer;user-select:none;" onclick="App.toggleEquipColSort('cost')" title="Nhấn để sắp xếp theo Giá Cost">Giá Cost (VND)${sortIconHtml(eSort, 'cost')}</th>` : ''}
                <th class="r" style="cursor:pointer;user-select:none;" onclick="App.toggleEquipColSort('base')" title="Nhấn để sắp xếp theo Đơn giá cơ bản">Đơn giá cơ bản (VND)${sortIconHtml(eSort, 'base')}</th>
                <th style="min-width:135px;">Quy tắc gói cơ bản</th>
                <th style="min-width:95px;">Ghi chú</th>
                ${canManageCat ? '<th class="c">Xóa</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${filteredEquip.length > 0 ? filteredEquip.map(eq => `
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
              `).join('') : `
                <tr>
                  <td colspan="${(showCost ? 9 : 8) + (canManageCat ? 1 : 0)}" class="c" style="padding:18px;color:var(--muted);">
                    Không tìm thấy Thiết bị / Dịch vụ nào phù hợp với từ khóa "${esc(state.equipSearch)}".
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;

    if (focusId) {
      const nextInput = document.getElementById(focusId);
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


  function setCatFilterProd(val) {
    state.catFilterProd = val;
    renderCatalogView();
  }

  function setCatModelSearch(val) {
    state.catModelSearch = val;
    renderCatalogView();
  }

  function setCatModelSort(val) {
    state.catModelSort = val;
    renderCatalogView();
  }

  function toggleCatModelColSort(prefix) {
    if (state.catModelSort === `${prefix}_asc`) {
      state.catModelSort = `${prefix}_desc`;
    } else {
      state.catModelSort = `${prefix}_asc`;
    }
    renderCatalogView();
  }

  function resetCatModelFilter() {
    state.catFilterProd = 'ALL';
    state.catModelSearch = '';
    state.catModelSort = 'default';
    renderCatalogView();
  }

  function setEquipFilterCat(val) {
    state.equipFilterCat = val;
    renderCatalogView();
  }

  function setEquipSearch(val) {
    state.equipSearch = val;
    renderCatalogView();
  }

  function setEquipSort(val) {
    state.equipSort = val;
    renderCatalogView();
  }

  function toggleEquipColSort(prefix) {
    if (state.equipSort === `${prefix}_asc`) {
      state.equipSort = `${prefix}_desc`;
    } else {
      state.equipSort = `${prefix}_asc`;
    }
    renderCatalogView();
  }

  function resetEquipFilter() {
    state.equipFilterCat = 'ALL';
    state.equipSearch = '';
    state.equipSort = 'default';
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
            <h3 class="card-title">Phân Quyền Mặc Định Theo Vai Trò</h3>
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
          ${isEdit ? `Chỉnh Sửa Tài Khoản & Phân Quyền: ${esc(u.full_name)} (${esc(u.username)})` : '➕ Tạo Tài Khoản Người Dùng Mới & Phân Quyền'}
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
            Số điện thoại
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
            Vai Trò (Tự động áp dụng bộ quyền chuẩn bên dưới):
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

  // ===========================================================================
  // HỆ THỐNG THÔNG BÁO (NOTIFICATIONS BELL & REALTIME POLLING)
  // ===========================================================================
  function renderNotifications() {
    const badge = document.getElementById('notifBadge');
    const titleEl = document.getElementById('notifHeaderTitle');
    const listEl = document.getElementById('notifListContainer');
    const unread = Number(state.unreadNotifications || 0);

    if (badge) {
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.remove('hidden');
      } else {
        badge.textContent = '0';
        badge.classList.add('hidden');
      }
    }

    if (titleEl) {
      titleEl.textContent = unread > 0 ? `Thông báo (${unread} mới)` : 'Thông báo';
    }

    if (!listEl) return;
    if (!state.notifications || state.notifications.length === 0) {
      listEl.innerHTML = '<div class="notif-empty">Hiện chưa có thông báo nào.</div>';
      return;
    }

    listEl.innerHTML = state.notifications.map(n => `
      <button type="button" class="notif-item ${n.is_read ? '' : 'unread'}" onclick="App.openNotification(${n.id})">
        <div class="notif-item-body">
          <div class="notif-item-title">${esc(n.title)}</div>
          <div class="notif-item-msg">${esc(n.message)}</div>
          <div class="notif-item-time">
            <span>🕒 ${esc(formatDateTimeVN(n.created_at))}</span>
            <span>${n.quote_number ? `Mở ${esc(n.quote_number)} →` : ''}</span>
          </div>
        </div>
        ${n.is_read ? '' : '<span class="notif-unread-dot" title="Chưa đọc"></span>'}
      </button>
    `).join('');
  }

  function toggleNotifDropdown(e) {
    if (e) e.stopPropagation();
    closeUserDropdown();
    const menu = document.getElementById('notifDropdownMenu');
    if (!menu) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');
    if (willOpen) {
      pollNotifications(true);
    }
  }

  function closeNotifDropdown() {
    document.getElementById('notifDropdownMenu')?.classList.add('hidden');
  }

  async function openNotification(notifId) {
    const n = (state.notifications || []).find(x => x.id === notifId);
    closeNotifDropdown();
    if (!n) return;

    if (!n.is_read) {
      n.is_read = 1;
      state.unreadNotifications = Math.max(0, state.unreadNotifications - 1);
      renderNotifications();
      api(`/api/notifications/${notifId}/read`, { method: 'POST' }).catch(() => {});
    }

    try {
      await loadBootstrap();
      if (n.quote_id) {
        const exists = state.quotations.some(q => q.id === n.quote_id);
        if (exists) {
          await openQuoteToTab(n.quote_id, n.target_tab || 'flow2');
          return;
        }
      }
      if (n.target_tab) {
        showTab(n.target_tab);
      }
    } catch (err) {
      toast('Không thể mở mục thông báo: ' + err.message);
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      (state.notifications || []).forEach(n => { n.is_read = 1; });
      state.unreadNotifications = 0;
      renderNotifications();
      toast('Đã đánh dấu đã đọc tất cả thông báo.');
    } catch (err) {
      toast('Lỗi: ' + err.message);
    }
  }

  function clearReadNotifications() {
    const readCount = (state.notifications || []).filter(n => n.is_read).length;
    if (readCount === 0) {
      toast('Hiện không có thông báo đã đọc nào để xóa.');
      return;
    }

    openConfirmModal({
      title: 'Xác Nhận Xóa Thông Báo Đã Đọc',
      okText: 'Xác nhận Xóa',
      isDanger: true,
      messageHtml: `
        Bạn có chắc chắn muốn xóa <strong>${readCount} thông báo đã đọc</strong> khỏi danh sách thông báo của bạn không?
        <div style="margin-top:8px;font-size:12.5px;color:var(--muted);">
          (Các thông báo chưa đọc vẫn sẽ được giữ nguyên.)
        </div>
      `,
      onConfirm: async () => {
        try {
          await api('/api/notifications/clear-read', { method: 'DELETE' });
          state.notifications = (state.notifications || []).filter(n => !n.is_read);
          renderNotifications();
          toast(`Đã xóa ${readCount} thông báo đã đọc.`);
        } catch (err) {
          toast('Lỗi: ' + err.message);
        }
      }
    });
  }

  async function pollNotifications(silent = false) {
    if (!state.authToken) return;
    try {
      const data = await api('/api/notifications');
      const incoming = data.notifications || [];
      const newestUnread = incoming.find(n => !n.is_read && n.id > state.lastSeenNotifId);
      if (newestUnread && !silent && state.lastSeenNotifId > 0) {
        toast(`🔔 ${newestUnread.title}`);
        // Tải lại danh sách báo giá nếu có thông báo mới về báo giá
        loadBootstrap().then(() => {
          if (state.activeTab === 'quotes') renderQuotesList();
        }).catch(() => {});
      }
      if (incoming.length > 0) {
        state.lastSeenNotifId = Math.max(state.lastSeenNotifId, incoming[0].id);
      }
      state.notifications = incoming;
      state.unreadNotifications = Number(data.unread_count || 0);
      renderNotifications();
    } catch {}
  }

  function startNotifPolling() {
    stopNotifPolling();
    state.notifPollTimer = setInterval(() => {
      if (state.authToken && !document.hidden) {
        pollNotifications(false);
      }
    }, 20000);
  }

  function stopNotifPolling() {
    if (state.notifPollTimer) {
      clearInterval(state.notifPollTimer);
      state.notifPollTimer = null;
    }
  }

  function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    closeNotifDropdown();
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
    const notifWrap = document.getElementById('notifMenuWrap');
    if (notifWrap && !notifWrap.contains(e.target)) {
      closeNotifDropdown();
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
    toggleNotifDropdown,
    closeNotifDropdown,
    openNotification,
    markAllNotificationsRead,
    clearReadNotifications,
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
    toggleF1Component,
    toggleF1DefaultInst,
    resetF1Components,
    setF1SpecLevel,
    setF1MgmtPercent,
    setF1VatPercent,
    setF1NoteInstallTrans,
    applyF1NotePreset,
    startDetailedFromF1,
    updateQField,
    onSelectApproverUser,
    onSelectPicUser,
    updateTermField,
    updatePaymentLines,
    updateBankCombined,
    applyTermsPreset,
    toggleAutoCalcMgmt,
    setQuickAddTargetSection,
    setQuickTowerProdLine,
    setQuickTowerModelCode,
    setQuickTowerInsertMode,
    insertTowerIntoSection,
    addNewAreaWithTower,
    setQuotePriceDisplayMode,
    setQuoteSpecDetailLevel,
    setCustomGroupNameInput,
    toggleGroupSelectItem,
    mergeSelectedItemsIntoGroup,
    ungroupSelectedItems,
    clearItemMergeGroup,
    toggleItemIncluded,
    toggleBundleComponent,
    applyNote5InstallPreset,
    syncNote5FromServices,
    handleMgmtFeeModeChange,
    onMgmtFeePercentInput,
    onMgmtFeePercentBlur,
    setQuickMgmtFeePercent,
    setQuickAddSelection,
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
    setPrintTemplate,
    togglePrintPicker,
    togglePrintWatermark,
    setPrintWatermarkOpacity,
    setPrintWatermarkSize,
    exportActiveQuoteToPdf,
    exportActiveQuoteToWord,
    exportActiveQuoteToExcel,
    setQuoteFilter,
    openQuoteToTab,
    deleteQuote,
    setCatFilterProd,
    setCatModelSearch,
    setCatModelSort,
    toggleCatModelColSort,
    resetCatModelFilter,
    setEquipFilterCat,
    setEquipSearch,
    setEquipSort,
    toggleEquipColSort,
    resetEquipFilter,
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
