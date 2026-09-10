/**
 * 憲法急診室 — 前端邏輯
 *
 * 單一資料來源：window.CASES（本機靜態快照，無任何網路請求）。
 * 篩選狀態分兩層：
 *   - applied：已套用、實際驅動畫面的條件（搜尋文字即時進入此層）。
 *   - staged：抽屜內尚未套用的暫存條件，按下「套用篩選」才寫入 applied。
 * 所有渲染都來自同一份 filteredCases() 投影，確保星圖、清單、統計一致；
 * 每一筆顯示中的案件，恰好對應清單中的一列與星圖中的一個可聚焦星點。
 */
(function () {
  'use strict';

  var CASES = Array.isArray(window.CASES) ? window.CASES : [];
  /** 快照的資料查核時間；舊快照只有 CASES_UPDATED_AT，仍可讀。 */
  var SOURCE_UPDATED_AT = window.CASES_SOURCE_UPDATED_AT || window.CASES_UPDATED_AT || '';
  var CRITICAL_DAYS = 1000;
  var DOT_MIN = 11;
  var DOT_MAX = 40;
  /** 星群內星點分布的最大半徑（佔星群方框邊長的百分比）。 */
  var CLUSTER_RADIUS = 34;
  /** 黃金角，用於確定性的葉序排列（無亂數、無物理模擬）。 */
  var GOLDEN_ANGLE = 2.399963229728653;

  /** 已套用條件：真正決定畫面的狀態。 */
  var applied = {
    query: '',
    identities: [],
    right: '',
    review: '',
    status: ''
  };

  /** 抽屜暫存條件：改動不影響畫面，直到套用。 */
  var staged = {
    identities: [],
    right: '',
    review: '',
    status: ''
  };

  /** 互動狀態：selectedId 為點選鎖定，hoverId 為滑過／鍵盤聚焦。 */
  var ui = {
    selectedId: null,
    hoverId: null
  };

  /** 目前畫面上的節點索引，供同步強調時直接改 class，不重繪、不奪走焦點。 */
  var nodes = {
    rows: [],
    dots: [],
    clusters: []
  };

  /** 星群固定順序：由完整資料集決定，不隨篩選改變位置。 */
  var rightOrder = [];

  /* ---------- 純函式推導 ---------- */

  /** 以 UTC 日界計算自受理日起算的等待天數。 */
  function daysWaiting(filedAt, today) {
    var parts = String(filedAt).split('-');
    var filed = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var now = today || new Date();
    var nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((nowUtc - filed) / 86400000));
  }

  /** 嚴格解析 YYYY-MM-DD 為 UTC 日界毫秒；格式或日期不存在時回傳 NaN。 */
  function utcDayOf(iso) {
    if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
    var y = Number(iso.slice(0, 4));
    var m = Number(iso.slice(5, 7));
    var d = Number(iso.slice(8, 10));
    var ms = Date.UTC(y, m - 1, d);
    var back = new Date(ms);
    // 反向比對可擋掉 2026-02-31 這種「格式合法但日期不存在」的值。
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN;
    return ms;
  }

  function isCount(n) {
    return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n;
  }

  function slashDate(iso) {
    return String(iso).replace(/-/g, '/');
  }

  /**
   * 由制度快照推導席次現況。
   * 天數只由 shortageStartedOn 與快照日推導，與瀏覽器當下時間無關；
   * 任何一項不合法就回傳 null，由呼叫端顯示「席次資料待查證」而不是猜一個數字。
   */
  function institutionSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var seats = raw.authorizedSeats;
    var sitting = raw.sittingJustices;
    if (!isCount(seats) || !isCount(sitting) || seats <= 0 || sitting > seats) return null;

    var vacancies = seats - sitting;
    if (vacancies <= 0) return null; // 沒有缺額就不該出現「未補齊」的敘述

    var startMs = utcDayOf(raw.shortageStartedOn);
    var asOfMs = utcDayOf(raw.asOfDate);
    if (isNaN(startMs) || isNaN(asOfMs) || asOfMs < startMs) return null;

    // shortageEndedOn 為 null／undefined＝截至快照日仍未補齊，計算終點就是快照日。
    var ongoing = raw.shortageEndedOn === null || raw.shortageEndedOn === undefined;
    var endIso = ongoing ? raw.asOfDate : raw.shortageEndedOn;
    var endMs = utcDayOf(endIso);
    if (isNaN(endMs) || endMs < startMs) return null;

    var days = Math.round((endMs - startMs) / 86400000);
    if (days <= 0) return null;

    return {
      seats: seats,
      sitting: sitting,
      vacancies: vacancies,
      days: days,
      ongoing: ongoing,
      startIso: raw.shortageStartedOn,
      endIso: endIso,
      asOfIso: raw.asOfDate,
      verifiedAt: typeof raw.verifiedAt === 'string' ? raw.verifiedAt : '',
      sources: Array.isArray(raw.sources) ? raw.sources : []
    };
  }

  /** 顯示用：2026-09-10T09:00:00+08:00 → 2026/09/10 09:00（UTC+8）；無法解析時回傳 null。 */
  function verifiedLabel(stamp) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?([+-])(\d{2}):(\d{2})$/.exec(String(stamp));
    if (!m) return null;
    return m[1] + '/' + m[2] + '/' + m[3] + ' ' + m[4] + ':' + m[5] +
      '（UTC' + m[6] + Number(m[7]) + (m[8] === '00' ? '' : ':' + m[8]) + '）';
  }

  /** 案件的主要權益分類，決定它屬於哪個星群。 */
  function primaryRight(record) {
    return (record.rights && record.rights[0]) || '未分類';
  }

  function haystack(record) {
    return [
      record.id,
      record.title,
      record.summary,
      record.court,
      record.status,
      record.review,
      record.filedAt,
      record.rights.join(' '),
      record.identities.join(' ')
    ].join(' ').toLowerCase();
  }

  /** 所有啟用條件為 AND；已選身份彼此為 OR。 */
  function matchesCase(record, s) {
    if (s.query && haystack(record).indexOf(s.query.trim().toLowerCase()) === -1) return false;
    if (s.right && record.rights.indexOf(s.right) === -1) return false;
    if (s.review && record.review !== s.review) return false;
    if (s.status && record.status !== s.status) return false;
    if (s.identities.length) {
      var hit = s.identities.some(function (id) {
        return record.identities.indexOf(id) !== -1;
      });
      if (!hit) return false;
    }
    return true;
  }

  function filteredCases() {
    return CASES
      .filter(function (r) { return matchesCase(r, applied); })
      .slice()
      .sort(function (a, b) { return b.waitDays - a.waitDays || a.id.localeCompare(b.id); });
  }

  function findCase(id) {
    for (var i = 0; i < CASES.length; i++) {
      if (CASES[i].id === id) return CASES[i];
    }
    return null;
  }

  /** 由字串推導的穩定雜湊，用於星群的固定起始角。 */
  function hashOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) % 100000;
    }
    return h;
  }

  function dotSize(days, maxDays) {
    if (maxDays <= 0) return DOT_MIN;
    var ratio = Math.pow(Math.min(1, days / maxDays), 0.85);
    return Math.round(Math.min(DOT_MAX, Math.max(DOT_MIN, DOT_MIN + ratio * (DOT_MAX - DOT_MIN))));
  }

  /**
   * 星群內第 i 個星點的位置（百分比座標）。
   * 葉序（phyllotaxis）排列：只由索引、總數與星群名稱雜湊決定，
   * 同樣輸入永遠得到同樣版面，無亂數也無物理模擬。
   */
  function dotPosition(index, total, seed) {
    var spread = total <= 1 ? 0 : Math.sqrt(index / (total - 1));
    var angle = seed + index * GOLDEN_ANGLE;
    return {
      x: Math.round((50 + spread * CLUSTER_RADIUS * Math.cos(angle)) * 100) / 100,
      y: Math.round((50 + spread * CLUSTER_RADIUS * Math.sin(angle)) * 100) / 100
    };
  }

  function uniqueSorted(getter) {
    var counts = Object.create(null);
    CASES.forEach(function (r) {
      getter(r).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; });
    });
    return Object.keys(counts)
      .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b, 'zh-Hant'); })
      .map(function (name) { return { name: name, count: counts[name] }; });
  }

  /* ---------- 安全 DOM 工具 ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /** 僅允許 https: 的來源連結。 */
  function safeHttpsUrl(raw) {
    try {
      var url = new URL(String(raw));
      return url.protocol === 'https:' ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US');
  }

  /**
   * 將快照的 RFC3339 UTC 查核時間格式化為台灣時區的顯示字串。
   * 解析不出有效時間就回傳空字串，由呼叫端保留破折號，不顯示可疑數值。
   */
  function formatTaiwanTime(iso) {
    if (!iso) return '';
    var stamp = Date.parse(iso);
    if (isNaN(stamp)) return '';
    var date = new Date(stamp);
    try {
      return date.toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) + '（台北時間）';
    } catch (error) {
      // 極少數環境不支援 IANA 時區；此時退回顯示原始 UTC 字串。
      return iso;
    }
  }

  /* ---------- DOM 參照 ---------- */

  var dom = {
    stamp: document.getElementById('today-stamp'),
    sourceStamp: document.getElementById('source-stamp'),
    footerMono: document.getElementById('footer-mono'),
    total: document.getElementById('vital-total'),
    shown: document.getElementById('vital-shown'),
    avg: document.getElementById('vital-avg'),
    max: document.getElementById('vital-max'),
    critical: document.getElementById('vital-critical'),
    q: document.getElementById('q'),
    toggle: document.getElementById('filter-toggle'),
    badge: document.getElementById('filter-badge'),
    drawer: document.getElementById('filter-drawer'),
    chips: document.getElementById('identity-chips'),
    rightSelect: document.getElementById('right-select'),
    reviewSelect: document.getElementById('review-select'),
    statusSelect: document.getElementById('status-select'),
    clearBtn: document.getElementById('filter-clear'),
    applyBtn: document.getElementById('filter-apply'),
    sky: document.getElementById('sky'),
    skyEmpty: document.getElementById('sky-empty'),
    list: document.getElementById('case-list'),
    listCount: document.getElementById('list-count'),
    detail: document.getElementById('case-detail'),
    seatWidget: document.getElementById('seat-widget'),
    seatFallback: document.getElementById('seat-fallback'),
    seatToggle: document.getElementById('seat-toggle'),
    seatLabel: document.getElementById('seat-label'),
    seatPanel: document.getElementById('seat-panel'),
    seatCounts: document.getElementById('seat-counts'),
    seatRange: document.getElementById('seat-range'),
    seatSource: document.getElementById('seat-source')
  };

  /* ---------- 篩選抽屜 ---------- */

  function activeFilterCount() {
    return (applied.right ? 1 : 0) +
      (applied.review ? 1 : 0) +
      (applied.status ? 1 : 0) +
      applied.identities.length;
  }

  function isDrawerOpen() {
    return dom.toggle.getAttribute('aria-expanded') === 'true';
  }

  function syncStagedFromApplied() {
    staged.identities = applied.identities.slice();
    staged.right = applied.right;
    staged.review = applied.review;
    staged.status = applied.status;
  }

  function setDrawer(open) {
    dom.drawer.hidden = !open;
    dom.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      // 每次開啟都以已套用條件為起點，未套用的舊改動不會殘留。
      syncStagedFromApplied();
      renderDrawer();
      dom.rightSelect.focus();
    }
  }

  function closeDrawer(restoreFocus) {
    if (!isDrawerOpen()) return;
    setDrawer(false);
    if (restoreFocus) dom.toggle.focus();
  }

  function applyStaged() {
    applied.identities = staged.identities.slice();
    applied.right = staged.right;
    applied.review = staged.review;
    applied.status = staged.status;
    closeDrawer(true);
    renderApp();
  }

  function clearAll() {
    applied.query = '';
    applied.identities = [];
    applied.right = '';
    applied.review = '';
    applied.status = '';
    syncStagedFromApplied();
    dom.q.value = '';
    ui.selectedId = null;
    ui.hoverId = null;
    renderApp();
  }

  /* ---------- 席次徽章的展開面板 ---------- */

  function isSeatPanelOpen() {
    return dom.seatToggle.getAttribute('aria-expanded') === 'true';
  }

  function setSeatPanel(open) {
    dom.seatPanel.hidden = !open;
    dom.seatToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeSeatPanel(restoreFocus) {
    if (!isSeatPanelOpen()) return;
    setSeatPanel(false);
    if (restoreFocus) dom.seatToggle.focus();
  }

  /* ---------- 渲染 ---------- */

  function renderBadge() {
    var n = activeFilterCount();
    dom.badge.textContent = n ? String(n) : '';
    dom.badge.hidden = n === 0;
    dom.toggle.classList.toggle('is-active', n > 0);
  }

  function renderChips() {
    clear(dom.chips);
    uniqueSorted(function (r) { return r.identities; }).forEach(function (item) {
      var chip = el('button', 'chip');
      chip.type = 'button';
      chip.setAttribute('aria-pressed', staged.identities.indexOf(item.name) !== -1 ? 'true' : 'false');
      chip.appendChild(document.createTextNode(item.name));
      chip.appendChild(el('span', 'chip__n', item.count));
      chip.addEventListener('click', function () {
        var i = staged.identities.indexOf(item.name);
        if (i === -1) staged.identities.push(item.name);
        else staged.identities.splice(i, 1);
        // 只更新自己的按下狀態；暫存條件在套用前不影響結果。
        chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
      });
      dom.chips.appendChild(chip);
    });
  }

  function fillSelect(select, allLabel, values, current) {
    clear(select);
    var head = el('option', null, allLabel);
    head.value = '';
    select.appendChild(head);
    values.forEach(function (item) {
      var opt = el('option', null, item.name + '（' + item.count + '）');
      opt.value = item.name;
      select.appendChild(opt);
    });
    select.value = current;
  }

  function renderDrawer() {
    fillSelect(dom.rightSelect, '全部權益分類',
      uniqueSorted(function (r) { return r.rights; }), staged.right);
    fillSelect(dom.reviewSelect, '全部程序類別',
      uniqueSorted(function (r) { return [r.review]; }), staged.review);
    fillSelect(dom.statusSelect, '全部受理狀態',
      uniqueSorted(function (r) { return [r.status]; }), staged.status);
    renderChips();
  }

  function renderList(rows) {
    clear(dom.list);
    nodes.rows = [];
    dom.listCount.textContent = fmt(rows.length) + ' / ' + fmt(CASES.length) + ' 件';

    if (!rows.length) {
      dom.list.appendChild(el('p', 'empty', '沒有符合條件的案件。'));
      return;
    }

    rows.forEach(function (r) {
      var critical = r.waitDays >= CRITICAL_DAYS;
      var row = el('button', 'card' + (critical ? ' is-critical' : ''));
      row.type = 'button';
      row.setAttribute('aria-pressed', 'false');

      var top = el('div', 'card__top');
      top.appendChild(el('span', 'card__id', r.id));
      top.appendChild(el('span', 'card__days', fmt(r.waitDays) + ' 天'));
      row.appendChild(top);

      row.appendChild(el('span', 'card__title', r.title));

      var meta = el('div', 'card__meta');
      meta.appendChild(el('span', 'tag tag--muted', r.status));
      r.rights.slice(0, 2).forEach(function (name) {
        meta.appendChild(el('span', 'tag tag--right', name));
      });
      r.identities.slice(0, 2).forEach(function (name) {
        meta.appendChild(el('span', 'tag tag--identity', name));
      });
      row.appendChild(meta);

      row.addEventListener('click', function () { select(r.id); });
      row.addEventListener('mouseenter', function () { setHover(r.id); });
      row.addEventListener('mouseleave', function () { setHover(null); });
      row.addEventListener('focus', function () { setHover(r.id); });
      row.addEventListener('blur', function () { setHover(null); });

      nodes.rows.push({ id: r.id, right: primaryRight(r), node: row });
      dom.list.appendChild(row);
    });
  }

  /**
   * 星圖：每個顯示中的主要權益分類是一個固定、帶標籤的星群，
   * 每一筆顯示中的案件恰好產生一個可鍵盤聚焦的星點。
   */
  function renderSky(rows, maxDays) {
    clear(dom.sky);
    nodes.dots = [];
    nodes.clusters = [];
    dom.skyEmpty.hidden = rows.length !== 0;
    dom.sky.hidden = rows.length === 0;

    var buckets = Object.create(null);
    rows.forEach(function (r) {
      var name = primaryRight(r);
      (buckets[name] || (buckets[name] = [])).push(r);
    });

    rightOrder.forEach(function (name) {
      var members = buckets[name];
      if (!members) return;

      // 群內依等待天數排序：最久候的案件落在星群中心。
      members = members.slice().sort(function (a, b) {
        return b.waitDays - a.waitDays || a.id.localeCompare(b.id);
      });

      var cluster = el('div', 'cluster');
      var label = el('p', 'cluster__label');
      label.appendChild(document.createTextNode(name));
      label.appendChild(el('span', 'cluster__n', members.length));
      cluster.appendChild(label);

      var field = el('div', 'cluster__field');
      var seed = (hashOf(name) % 360) * Math.PI / 180;

      members.forEach(function (r, i) {
        var pos = dotPosition(i, members.length, seed);
        var critical = r.waitDays >= CRITICAL_DAYS;
        var dot = el('button', 'dot' + (critical ? ' is-critical' : ''));
        dot.type = 'button';
        dot.setAttribute('aria-pressed', 'false');
        dot.style.setProperty('--dot-size', dotSize(r.waitDays, maxDays) + 'px');
        dot.style.setProperty('--x', pos.x + '%');
        dot.style.setProperty('--y', pos.y + '%');
        dot.setAttribute('aria-label',
          r.title + '，' + r.id + '，' + name + '，已等待 ' + fmt(r.waitDays) + ' 天' +
          (critical ? '，逾 1,000 天' : ''));
        dot.title = r.title + '｜' + fmt(r.waitDays) + ' 天';

        dot.addEventListener('click', function () { select(r.id); });
        dot.addEventListener('mouseenter', function () { setHover(r.id); });
        dot.addEventListener('mouseleave', function () { setHover(null); });
        dot.addEventListener('focus', function () { setHover(r.id); });
        dot.addEventListener('blur', function () { setHover(null); });

        nodes.dots.push({ id: r.id, right: name, node: dot });
        field.appendChild(dot);
      });

      cluster.appendChild(field);
      nodes.clusters.push({ right: name, node: cluster });
      dom.sky.appendChild(cluster);
    });
  }

  /** 目前要在詳細卡呈現的案件：滑過／聚焦優先於點選鎖定。 */
  function activeId() {
    return ui.hoverId || ui.selectedId;
  }

  /**
   * 同步強調：清單列、星點與星群共用同一個 activeId，
   * 相關星群突出、無關星點降低透明度。只改 class，不重繪，故不影響焦點。
   */
  function applyEmphasis() {
    var id = activeId();
    var record = id ? findCase(id) : null;
    var right = record ? primaryRight(record) : null;

    nodes.dots.forEach(function (item) {
      var isActive = item.id === id;
      item.node.classList.toggle('is-active', isActive);
      item.node.classList.toggle('is-selected', item.id === ui.selectedId);
      item.node.classList.toggle('is-dim', !!right && item.right !== right);
      item.node.setAttribute('aria-pressed', item.id === ui.selectedId ? 'true' : 'false');
    });

    nodes.rows.forEach(function (item) {
      item.node.classList.toggle('is-active', item.id === id);
      item.node.classList.toggle('is-selected', item.id === ui.selectedId);
      item.node.classList.toggle('is-dim', !!right && item.right !== right);
      item.node.setAttribute('aria-pressed', item.id === ui.selectedId ? 'true' : 'false');
    });

    nodes.clusters.forEach(function (item) {
      item.node.classList.toggle('is-focus', !!right && item.right === right);
      item.node.classList.toggle('is-dim', !!right && item.right !== right);
    });
  }

  function renderDetail() {
    clear(dom.detail);

    var record = findCase(activeId());

    if (!record) {
      dom.detail.appendChild(el('p', 'detail__placeholder',
        '點選或以鍵盤聚焦左側清單項目、中間星圖的任一星點，' +
        '這裡會顯示該案件的受理日期、等待天數、程序位置、涉及權益與官方來源連結。'));
      return;
    }

    var critical = record.waitDays >= CRITICAL_DAYS;

    dom.detail.appendChild(el('p', 'detail__id', record.court + '　' + record.id));
    dom.detail.appendChild(el('h3', 'detail__title', record.title));

    var grid = el('div', 'detail__grid');

    function pair(key, value, cls) {
      var wrap = el('div');
      wrap.appendChild(el('p', 'detail__key', key));
      wrap.appendChild(el('p', 'detail__val' + (cls ? ' ' + cls : ''), value));
      grid.appendChild(wrap);
    }

    pair('等待天數（自受理日起算）', fmt(record.waitDays) + ' 天',
      'detail__val--big' + (critical ? ' is-critical' : ''));
    pair('受理日期', record.filedAt);
    pair('受理狀態', record.status + '／公開書狀案件');
    pair('程序類別', record.review);
    pair('主要權益星群', primaryRight(record));
    dom.detail.appendChild(grid);

    dom.detail.appendChild(el('p', 'detail__summary', record.summary));

    var tags = el('div', 'detail__tags');
    tags.appendChild(el('span', 'tag tag--review', record.review));
    record.rights.forEach(function (name) {
      tags.appendChild(el('span', 'tag tag--right', name));
    });
    record.identities.forEach(function (name) {
      tags.appendChild(el('span', 'tag tag--identity', name));
    });
    dom.detail.appendChild(tags);

    var href = safeHttpsUrl(record.sourceUrl);
    if (href) {
      var link = el('a', 'detail__source', '查看官方來源頁面：' + record.sourceLabel);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      dom.detail.appendChild(link);
    } else {
      dom.detail.appendChild(el('p', 'detail__note', '此筆資料缺少可驗證的來源連結。'));
    }

    dom.detail.appendChild(el('p', 'detail__note',
      '說明：本欄位僅呈現官方公開書狀清單所載之受理日期與程序位置，' +
      '不代表憲法法庭已作成實體判斷、違憲認定或任何當事人勝敗結果。' +
      '官方公開列表未為每筆案件提供獨立永久詳情頁，來源連結指向直接列出本案的官方分頁。'));
  }

  function renderVitals(rows) {
    var total = rows.reduce(function (sum, r) { return sum + r.waitDays; }, 0);
    var maxDays = rows.reduce(function (m, r) { return Math.max(m, r.waitDays); }, 0);
    var criticalCount = rows.filter(function (r) { return r.waitDays >= CRITICAL_DAYS; }).length;

    dom.total.textContent = fmt(CASES.length);
    dom.shown.textContent = fmt(rows.length);
    dom.avg.textContent = rows.length ? fmt(Math.round(total / rows.length)) : '—';
    dom.max.textContent = rows.length ? fmt(maxDays) : '—';
    dom.critical.textContent = fmt(criticalCount);
  }

  /** 依 ISO 日期產生 <time datetime="YYYY-MM-DD">YYYY/MM/DD</time>。 */
  function dateTimeEl(iso) {
    var node = el('time', null, slashDate(iso));
    node.setAttribute('datetime', iso);
    return node;
  }

  /**
   * 席次徽章：只讀 window.INSTITUTION，只寫抬頭右側這一顆徽章、它的面板與頁尾的資料鮮度標記。
   * 只在啟動時渲染一次，任何篩選條件都不會改動它。
   */
  function renderInstitution() {
    var snap = institutionSnapshot(window.INSTITUTION);
    var caseStamp = 'CASE SNAPSHOT ' + fmt(CASES.length) + ' RECORDS';
    var tail = ' ／ LOCAL DATA ONLY ／ NO NETWORK FETCH';

    if (!snap) {
      // Fail closed：維持 HTML 預設的「席次資料待查證」標記，
      // 徽章與面板都不亮出來，也就不會有任何沒被驗證過的數字外流。
      dom.footerMono.textContent = caseStamp + ' ／ SEAT SNAPSHOT UNVERIFIED' + tail;
      return;
    }

    var lead = snap.ongoing ? '未補齊 ' : '未補齊共計 ';

    clear(dom.seatLabel);
    dom.seatLabel.appendChild(document.createTextNode(lead));
    var duration = el('time', 'seatwidget__num', fmt(snap.days));
    duration.setAttribute('datetime', 'P' + snap.days + 'D');
    dom.seatLabel.appendChild(duration);
    dom.seatLabel.appendChild(document.createTextNode(' 天'));

    // 無障礙名稱包含徽章上看得到的文字，再補上這顆按鈕會展開什麼。
    dom.seatToggle.setAttribute('aria-label',
      '大法官席次現況：' + lead + fmt(snap.days) + ' 天，展開席次明細與資料來源');

    dom.seatFallback.hidden = true;
    dom.seatToggle.hidden = false;

    dom.seatCounts.textContent = '在任 ' + fmt(snap.sitting) + ' 人／法定 ' + fmt(snap.seats) +
      ' 人・缺額 ' + fmt(snap.vacancies) + ' 席';

    clear(dom.seatRange);
    dom.seatRange.appendChild(document.createTextNode('自 '));
    dom.seatRange.appendChild(dateTimeEl(snap.startIso));
    dom.seatRange.appendChild(document.createTextNode(' 起，計至 '));
    dom.seatRange.appendChild(dateTimeEl(snap.endIso));

    clear(dom.seatSource);
    dom.seatSource.appendChild(el('p', null,
      '計算方式：天數＝計算終點 ' + slashDate(snap.endIso) + ' 與起算日 ' + slashDate(snap.startIso) +
      ' 之間的日曆日數（以 UTC 日界計），由快照日期推導、不隨開啟畫面的時間改變；' +
      '缺額＝法定席次 ' + fmt(snap.seats) + ' 減在任人數 ' + fmt(snap.sitting) + '。'));

    var links = el('ul', 'seatpanel__links');
    snap.sources.forEach(function (src) {
      var href = safeHttpsUrl(src && src.url);
      if (!href) return;
      var item = el('li');
      var link = el('a', null, String((src && src.label) || href));
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.appendChild(link);
      links.appendChild(item);
    });
    if (links.childNodes.length) dom.seatSource.appendChild(links);

    var verified = verifiedLabel(snap.verifiedAt);
    if (verified) {
      var stampLine = el('p', null, '席次資料查證時間：');
      var stamp = el('time', null, verified);
      stamp.setAttribute('datetime', snap.verifiedAt);
      stampLine.appendChild(stamp);
      dom.seatSource.appendChild(stampLine);
    }

    dom.footerMono.textContent = caseStamp + ' ／ SEAT SNAPSHOT ' + snap.asOfIso + tail;
  }

  function renderApp() {
    var rows = filteredCases();
    var maxAll = CASES.reduce(function (m, r) { return Math.max(m, r.waitDays); }, 0);

    // 篩選後若選取案件已不在結果內，就放掉選取。
    if (ui.selectedId && !rows.some(function (r) { return r.id === ui.selectedId; })) {
      ui.selectedId = null;
    }
    ui.hoverId = null;

    renderBadge();
    renderVitals(rows);
    renderList(rows);
    renderSky(rows, maxAll);
    if (isDrawerOpen()) renderDrawer();
    applyEmphasis();
    renderDetail();
  }

  /* ---------- 同步互動 ---------- */

  function setHover(id) {
    if (ui.hoverId === id) return;
    ui.hoverId = id;
    applyEmphasis();
    renderDetail();
  }

  function select(id) {
    ui.selectedId = ui.selectedId === id ? null : id;
    applyEmphasis();
    renderDetail();
  }

  /* ---------- 啟動 ---------- */

  function init() {
    var today = new Date();

    CASES.forEach(function (r) {
      r.waitDays = daysWaiting(r.filedAt, today);
    });

    // 星群順序取自完整資料集，篩選時星群位置維持穩定。
    rightOrder = uniqueSorted(function (r) { return [primaryRight(r)]; })
      .map(function (item) { return item.name; });

    dom.stamp.textContent = '看板日期 ' +
      today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    // 資料查核時間來自快照本身，不是頁面載入時間，也不會發出任何請求。
    var checkedAt = formatTaiwanTime(SOURCE_UPDATED_AT);
    dom.sourceStamp.textContent = '資料最後查核：' + (checkedAt || '—');

    // 制度層狀態獨立於篩選，只在啟動時渲染一次；頁尾 mono 標記由 renderInstitution()
    // 統一寫入（同時涵蓋案件筆數與席次快照日期），此處不再重複賦值。
    renderInstitution();

    dom.seatToggle.addEventListener('click', function () {
      setSeatPanel(!isSeatPanelOpen());
    });

    // 點面板外、按 Esc 都關閉；徽章本身的點擊由上面的 toggle 處理，這裡放行。
    document.addEventListener('click', function (event) {
      if (!isSeatPanelOpen()) return;
      if (dom.seatWidget.contains(event.target)) return;
      closeSeatPanel(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeSeatPanel(true);
    });

    renderDrawer();

    dom.q.addEventListener('input', function () {
      applied.query = dom.q.value;
      renderApp();
    });

    dom.toggle.addEventListener('click', function () {
      setDrawer(!isDrawerOpen());
    });

    // 星點以外的星圖底色是明確的取消選取 affordance。
    dom.sky.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('.dot')) return;
      if (!ui.selectedId) return;
      ui.selectedId = null;
      ui.hoverId = null;
      applyEmphasis();
      renderDetail();
    });

    dom.rightSelect.addEventListener('change', function () {
      staged.right = dom.rightSelect.value;
    });
    dom.reviewSelect.addEventListener('change', function () {
      staged.review = dom.reviewSelect.value;
    });
    dom.statusSelect.addEventListener('change', function () {
      staged.status = dom.statusSelect.value;
    });

    dom.applyBtn.addEventListener('click', applyStaged);
    dom.clearBtn.addEventListener('click', clearAll);

    dom.drawer.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDrawer(true);
    });

    renderApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
