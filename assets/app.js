const state = {
  itemsFinance: [],
  itemsAll: [],
  itemsAllRaw: [],
  statsFinance: [],
  totalFinance: 0,
  totalRaw: 0,
  totalAllMode: 0,
  allDedup: true,
  siteFilter: "",
  marketFilter: "",
  query: "",
  mode: "finance",
  generatedAt: null,
};

const $ = (id) => document.getElementById(id);
const statsEl = $("stats");
const siteSelectEl = $("siteSelect");
const sitePillsEl = $("sitePills");
const newsListEl = $("newsList");
const updatedAtEl = $("updatedAt");
const searchInputEl = $("searchInput");
const resultCountEl = $("resultCount");
const itemTpl = $("itemTpl");
const modeFinBtnEl = $("modeFinBtn");
const modeAllBtnEl = $("modeAllBtn");
const modeHintEl = $("modeHint");
const allDedupeWrapEl = $("allDedupeWrap");
const allDedupeToggleEl = $("allDedupeToggle");
const allDedupeLabelEl = $("allDedupeLabel");
const marketTabsEl = $("marketTabs");

function escapeHTML(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MARKET_LABELS = {
  a_stock: "A股", us_stock: "美股", hk_stock: "港股",
  macro: "宏观", crypto: "加密", commodity: "大宗", forex: "外汇", general: "综合",
};

function fmtNumber(n) {
  return new Intl.NumberFormat("zh-CN").format(n || 0);
}

function fmtTime(iso) {
  if (!iso) return "时间未知";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function setStats(payload) {
  const cards = [
    ["24h 金融", fmtNumber(payload.total_items)],
    ["24h 全量", fmtNumber(payload.total_items_raw || payload.total_items)],
    ["去重后", fmtNumber(payload.total_items_all_mode || payload.total_items)],
    ["数据源", fmtNumber(payload.site_count)],
    ["来源分组", fmtNumber(payload.source_count)],
    ["归档总量", fmtNumber(payload.archive_total || 0)],
  ];
  statsEl.innerHTML = "";
  cards.forEach(([k, v]) => {
    const node = document.createElement("div");
    node.className = "stat";
    node.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
    statsEl.appendChild(node);
  });
}

function computeSiteStats(items) {
  const m = new Map();
  items.forEach((item) => {
    if (!m.has(item.site_id)) {
      m.set(item.site_id, { site_id: item.site_id, site_name: item.site_name, count: 0, raw_count: 0 });
    }
    const row = m.get(item.site_id);
    row.count += 1;
    row.raw_count += 1;
  });
  return Array.from(m.values()).sort((a, b) => b.count - a.count || a.site_name.localeCompare(b.site_name, "zh-CN"));
}

function currentSiteStats() {
  if (state.mode === "finance") return state.statsFinance || [];
  return computeSiteStats(state.allDedup ? (state.itemsAll || []) : (state.itemsAllRaw || []));
}

function renderSiteFilters() {
  const stats = currentSiteStats();
  siteSelectEl.innerHTML = '<option value="">全部站点</option>';
  stats.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.site_id;
    opt.textContent = `${s.site_name} (${s.count}/${s.raw_count ?? s.count})`;
    siteSelectEl.appendChild(opt);
  });
  siteSelectEl.value = state.siteFilter;

  sitePillsEl.innerHTML = "";
  const allPill = document.createElement("button");
  allPill.className = `pill ${state.siteFilter === "" ? "active" : ""}`;
  allPill.textContent = "全部";
  allPill.onclick = () => { state.siteFilter = ""; renderSiteFilters(); renderList(); };
  sitePillsEl.appendChild(allPill);

  stats.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = `pill ${state.siteFilter === s.site_id ? "active" : ""}`;
    btn.textContent = `${s.site_name} ${s.count}/${s.raw_count ?? s.count}`;
    btn.onclick = () => { state.siteFilter = s.site_id; renderSiteFilters(); renderList(); };
    sitePillsEl.appendChild(btn);
  });
}

function renderModeSwitch() {
  modeFinBtnEl.classList.toggle("active", state.mode === "finance");
  modeAllBtnEl.classList.toggle("active", state.mode === "all");
  if (allDedupeWrapEl) allDedupeWrapEl.classList.toggle("show", state.mode === "all");
  if (allDedupeToggleEl) allDedupeToggleEl.checked = state.allDedup;
  if (allDedupeLabelEl) allDedupeLabelEl.textContent = state.allDedup ? "去重开" : "去重关";
  if (state.mode === "finance") {
    modeHintEl.textContent = `当前视图：金融过滤（${fmtNumber(state.totalFinance)} 条）`;
  } else {
    const c = state.allDedup ? state.totalAllMode || state.itemsAll.length : state.totalRaw || state.itemsAllRaw.length;
    modeHintEl.textContent = `当前视图：全量（${state.allDedup ? "去重开" : "去重关"}，${fmtNumber(c)} 条）`;
  }
}

function renderMarketTabs() {
  marketTabsEl.querySelectorAll(".market-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.market === state.marketFilter);
  });
}

function effectiveAllItems() {
  return state.allDedup ? state.itemsAll : state.itemsAllRaw;
}

function modeItems() {
  return state.mode === "all" ? effectiveAllItems() : state.itemsFinance;
}

function getFilteredItems() {
  const q = state.query.trim().toLowerCase();
  return modeItems().filter((item) => {
    if (state.siteFilter && item.site_id !== state.siteFilter) return false;
    if (state.marketFilter) {
      const tags = item.market_tags || [];
      if (!tags.includes(state.marketFilter)) return false;
    }
    if (!q) return true;
    const hay = `${item.title || ""} ${item.title_zh || ""} ${item.title_en || ""} ${item.site_name || ""} ${item.source || ""}`.toLowerCase();
    return hay.includes(q);
  });
}

function renderItemNode(item) {
  const node = itemTpl.content.firstElementChild.cloneNode(true);
  node.querySelector(".site").textContent = item.site_name;
  node.querySelector(".source").textContent = item.source;
  node.querySelector(".time").textContent = fmtTime(item.published_at || item.first_seen_at);

  const tagList = node.querySelector(".market-tag-list");
  (item.market_tags || []).forEach((t) => {
    if (t === "general") return;
    const span = document.createElement("span");
    span.className = "mtag";
    span.textContent = MARKET_LABELS[t] || t;
    tagList.appendChild(span);
  });

  const importance = item.importance || "normal";
  if (importance !== "normal") {
    const badge = document.createElement("span");
    badge.className = `importance-badge importance-${importance}`;
    badge.textContent = importance === "high" ? "重要" : "关注";
    node.querySelector(".meta-row").prepend(badge);
  }

  const titleEl = node.querySelector(".title");
  const zh = (item.title_zh || "").trim();
  const en = (item.title_en || "").trim();
  titleEl.textContent = "";
  if (zh && en && zh !== en) {
    const primary = document.createElement("span");
    primary.textContent = zh;
    const sub = document.createElement("span");
    sub.className = "title-sub";
    sub.textContent = en;
    titleEl.appendChild(primary);
    titleEl.appendChild(sub);
  } else {
    titleEl.textContent = item.title || zh || en;
  }
  titleEl.href = item.url;
  return node;
}

function buildSourceGroupNode(source, items) {
  const section = document.createElement("section");
  section.className = "source-group";
  section.innerHTML = `
    <header class="source-group-head"><h3>${escapeHTML(source)}</h3><span>${fmtNumber(items.length)} 条</span></header>
    <div class="source-group-list"></div>`;
  const listEl = section.querySelector(".source-group-list");
  items.forEach((item) => listEl.appendChild(renderItemNode(item)));
  return section;
}

function groupBySource(items) {
  const m = new Map();
  items.forEach((item) => {
    const key = item.source || "未分区";
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(item);
  });
  return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));
}

function renderList() {
  const filtered = getFilteredItems();
  resultCountEl.textContent = `${fmtNumber(filtered.length)} 条`;
  newsListEl.innerHTML = "";

  if (!filtered.length) {
    newsListEl.innerHTML = '<div class="empty">当前筛选条件下没有结果。</div>';
    return;
  }

  if (state.siteFilter) {
    groupBySource(filtered).forEach(([source, items]) => {
      newsListEl.appendChild(buildSourceGroupNode(source, items));
    });
    return;
  }

  // Group by site then source
  const siteMap = new Map();
  filtered.forEach((item) => {
    if (!siteMap.has(item.site_id)) siteMap.set(item.site_id, { siteName: item.site_name || item.site_id, items: [] });
    siteMap.get(item.site_id).items.push(item);
  });

  const sites = Array.from(siteMap.entries()).sort((a, b) => b[1].items.length - a[1].items.length);
  const frag = document.createDocumentFragment();
  sites.forEach(([, site]) => {
    const sec = document.createElement("section");
    sec.className = "site-group";
    sec.innerHTML = `<header class="site-group-head"><h3>${escapeHTML(site.siteName)}</h3><span>${fmtNumber(site.items.length)} 条</span></header><div class="site-group-list"></div>`;
    const listEl = sec.querySelector(".site-group-list");
    groupBySource(site.items).forEach(([source, items]) => {
      listEl.appendChild(buildSourceGroupNode(source, items));
    });
    frag.appendChild(sec);
  });
  newsListEl.appendChild(frag);
}

// ── Sentiment Panel ──

function ratingLabel(rating) {
  const map = {
    "extreme fear": "极度恐惧", "fear": "恐惧", "neutral": "中性",
    "greed": "贪婪", "extreme greed": "极度贪婪",
    "Extreme Fear": "极度恐惧", "Fear": "恐惧", "Neutral": "中性",
    "Greed": "贪婪", "Extreme Greed": "极度贪婪",
  };
  return map[rating] || rating || "";
}

function gaugeColor(value) {
  if (value <= 25) return "var(--down)";
  if (value <= 45) return "#ff6d00";
  if (value <= 55) return "var(--accent)";
  if (value <= 75) return "#66bb6a";
  return "var(--up)";
}

async function fetchSentiment() {
  const panel = $("sentimentPanel");
  try {
    const res = await fetch(`./data/sentiment.json?t=${Date.now()}`);
    if (!res.ok) { panel.style.display = "none"; return; }
    const d = await res.json();
    renderSentiment(d, panel);
  } catch { panel.style.display = "none"; }
}

function renderSentiment(d, panel) {
  const cards = [];

  if (d.cnn_fear_greed?.ok) {
    const s = d.cnn_fear_greed.score;
    const r = ratingLabel(d.cnn_fear_greed.rating);
    cards.push({ label: "Fear & Greed", value: Math.round(s), sub: r, color: gaugeColor(s) });
  }

  if (d.crypto_fear_greed?.ok) {
    const v = d.crypto_fear_greed.value;
    const c = ratingLabel(d.crypto_fear_greed.classification);
    cards.push({ label: "加密恐贪", value: v, sub: c, color: gaugeColor(v) });
  }

  if (d.vix?.ok && d.vix.value != null) {
    cards.push({ label: "VIX 恐慌指数", value: d.vix.value, sub: "", color: d.vix.value > 25 ? "var(--down)" : "var(--up)" });
  }

  if (!cards.length) { panel.style.display = "none"; return; }

  panel.innerHTML = cards.map((c) => `
    <div class="sentiment-card">
      <div class="sentiment-value" style="color:${c.color}">${escapeHTML(c.value)}</div>
      <div class="sentiment-label">${escapeHTML(c.label)}</div>
      <div class="sentiment-sub">${escapeHTML(c.sub)}</div>
    </div>
  `).join("");
}

// ── Market Summary ──

async function fetchSummary() {
  const section = $("summarySection");
  try {
    const res = await fetch(`./data/market-summary.json?t=${Date.now()}`);
    if (!res.ok) { section.style.display = "none"; return; }
    const d = await res.json();
    if (!d.ok || !d.text) { section.style.display = "none"; return; }
    renderSummary(d, section);
  } catch { section.style.display = "none"; }
}

function renderSummary(d, section) {
  const typeBadge = d.type === "llm" ? '<span class="summary-badge">AI 生成</span>' : '';
  const pills = Object.entries(d.sections || {}).map(([tag, s]) => {
    const label = MARKET_LABELS[tag] || escapeHTML(tag);
    return `<span class="summary-pill">${label} <b>${s.total}</b></span>`;
  }).join("");

  section.innerHTML = `
    <div class="summary-head"><h2>市场速览</h2>${typeBadge}</div>
    <div class="summary-text">${escapeHTML(d.text).replace(/\n/g, "<br>")}</div>
    <div class="summary-pills">${pills}</div>
  `;
}

// ── Economic Calendar ──

async function fetchCalendar() {
  const section = $("calendarSection");
  try {
    const res = await fetch(`./data/economic-calendar.json?t=${Date.now()}`);
    if (!res.ok) { section.style.display = "none"; return; }
    const d = await res.json();
    if (!d.ok || !d.dates) { section.style.display = "none"; return; }
    renderCalendar(d, section);
  } catch { section.style.display = "none"; }
}

function renderCalendar(d, section) {
  const dates = Object.keys(d.dates).sort();
  if (!dates.length) { section.style.display = "none"; return; }

  const today = new Date().toISOString().slice(0, 10);
  const dateLabels = dates.map((dt) => {
    const label = dt === today ? "今天" : dt.slice(5).replace("-", "/");
    return `<button class="cal-tab${dt === dates[0] ? " active" : ""}" data-date="${dt}">${label}</button>`;
  }).join("");

  section.innerHTML = `
    <div class="calendar-head"><h2>经济日历</h2><div class="cal-tabs">${dateLabels}</div></div>
    <div class="calendar-list" id="calendarList"></div>
  `;

  const listEl = section.querySelector("#calendarList");
  const renderDate = (dateKey) => {
    const events = d.dates[dateKey] || [];
    if (!events.length) {
      listEl.innerHTML = '<div class="empty">暂无经济事件</div>';
      return;
    }
    const highFirst = [...events].sort((a, b) => (b.importance || 0) - (a.importance || 0));
    listEl.innerHTML = highFirst.map((e) => {
      const stars = "★".repeat(e.importance || 1) + "☆".repeat(3 - (e.importance || 1));
      const impClass = e.importance >= 3 ? "cal-high" : e.importance >= 2 ? "cal-med" : "";
      return `<div class="cal-event ${impClass}">
        <span class="cal-time">${escapeHTML(e.time) || "--:--"}</span>
        <span class="cal-country">${escapeHTML(e.country)}</span>
        <span class="cal-stars">${stars}</span>
        <span class="cal-indicator">${escapeHTML(e.indicator)}</span>
        <span class="cal-values">
          ${e.previous ? `<span class="cal-prev">前 ${escapeHTML(e.previous)}</span>` : ""}
          ${e.forecast ? `<span class="cal-forecast">预 ${escapeHTML(e.forecast)}</span>` : ""}
          ${e.actual ? `<span class="cal-actual">实 ${escapeHTML(e.actual)}</span>` : ""}
        </span>
      </div>`;
    }).join("");
  };

  renderDate(dates[0]);

  section.querySelector(".cal-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".cal-tab");
    if (!btn) return;
    section.querySelectorAll(".cal-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderDate(btn.dataset.date);
  });
}

async function init() {
  try {
    const res = await fetch(`./data/latest-24h.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    state.itemsFinance = payload.items_finance || payload.items || [];
    state.itemsAllRaw = payload.items_all_raw || payload.items_all || payload.items || [];
    state.itemsAll = payload.items_all || payload.items || [];
    state.statsFinance = payload.site_stats || [];
    state.totalFinance = payload.total_items || state.itemsFinance.length;
    state.totalRaw = payload.total_items_raw || state.itemsAllRaw.length;
    state.totalAllMode = payload.total_items_all_mode || state.itemsAll.length;
    state.generatedAt = payload.generated_at;
    setStats(payload);
    renderModeSwitch();
    renderMarketTabs();
    renderSiteFilters();
    renderList();
    updatedAtEl.textContent = `更新：${fmtTime(state.generatedAt)}`;
    // Phase 2 features (non-blocking)
    fetchSentiment();
    fetchSummary();
    fetchCalendar();
  } catch (e) {
    updatedAtEl.textContent = "数据加载失败";
    newsListEl.innerHTML = `<div class="empty">${escapeHTML(e.message)}</div>`;
  }
}

// ── Event bindings ──
searchInputEl.addEventListener("input", (e) => { state.query = e.target.value; renderList(); });
siteSelectEl.addEventListener("change", (e) => { state.siteFilter = e.target.value; renderSiteFilters(); renderList(); });

modeFinBtnEl.addEventListener("click", () => { state.mode = "finance"; renderModeSwitch(); renderSiteFilters(); renderList(); });
modeAllBtnEl.addEventListener("click", () => { state.mode = "all"; renderModeSwitch(); renderSiteFilters(); renderList(); });

if (allDedupeToggleEl) {
  allDedupeToggleEl.addEventListener("change", (e) => {
    state.allDedup = Boolean(e.target.checked);
    renderModeSwitch(); renderSiteFilters(); renderList();
  });
}

marketTabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".market-btn");
  if (!btn) return;
  state.marketFilter = btn.dataset.market || "";
  renderMarketTabs();
  renderList();
});

init();
// Auto-refresh every 5 minutes
setInterval(() => { init(); }, 5 * 60 * 1000);
