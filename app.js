const API_ALL = 'https://api.mfapi.in/mf';
const API_SCHEME = (code) => `https://api.mfapi.in/mf/${code}`;
const PORTFOLIO_KEY = 'mf_portfolio_v1';

const state = {
  fundList: [],
  selected: new Map(),
  compareMetrics: [],
  chart: null,
  portfolio: loadPortfolio(),
};

const el = {
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  searchResults: document.getElementById('search-results'),
  compareBtn: document.getElementById('compare-btn'),
  clearSelectionBtn: document.getElementById('clear-selection-btn'),
  metricsPanel: document.getElementById('metrics-panel'),
  chartCanvas: document.getElementById('nav-chart'),

  pSchemeCode: document.getElementById('portfolio-scheme-code'),
  pUnits: document.getElementById('portfolio-units'),
  pAvgNav: document.getElementById('portfolio-avg-nav'),
  pAddUpdate: document.getElementById('portfolio-add-update'),
  pRefresh: document.getElementById('portfolio-refresh'),
  pClear: document.getElementById('portfolio-clear'),
  pSummary: document.getElementById('portfolio-summary'),
  pTableBody: document.querySelector('#portfolio-table tbody'),
  pdfInput: document.getElementById('pdf-input'),
  pdfImportBtn: document.getElementById('pdf-import-btn'),
  pdfStatus: document.getElementById('pdf-status'),

  sip: document.getElementById('sip-amount'),
  horizon: document.getElementById('horizon-years'),
  risk: document.getElementById('risk-profile'),
  emergency: document.getElementById('emergency-fund'),
  adviceBtn: document.getElementById('generate-advice'),
  adviceOutput: document.getElementById('advice-output'),
};

init();

async function init() {
  bindEvents();
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js";
  }
  await loadFundList();
  renderSearchResults(state.fundList.slice(0, 30));
  renderPortfolio();
}

function bindEvents() {
  el.searchBtn.addEventListener('click', () => performSearch());
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  el.compareBtn.addEventListener('click', compareSelectedFunds);
  el.clearSelectionBtn.addEventListener('click', () => {
    state.selected.clear();
    performSearch();
  });

  el.pAddUpdate.addEventListener('click', addOrUpdateHoldingFromInputs);
  el.pRefresh.addEventListener('click', refreshPortfolioNAV);
  el.pClear.addEventListener('click', clearPortfolio);
  el.pdfImportBtn.addEventListener('click', importFromPdf);

  el.adviceBtn.addEventListener('click', generateAdvice);
}

async function loadFundList() {
  const cacheKey = 'mf_all_cache_v1';
  const cacheTsKey = 'mf_all_cache_ts_v1';
  const maxAgeMs = 24 * 60 * 60 * 1000;

  const cached = localStorage.getItem(cacheKey);
  const cachedTs = Number(localStorage.getItem(cacheTsKey));

  if (cached && cachedTs && Date.now() - cachedTs < maxAgeMs) {
    state.fundList = JSON.parse(cached);
    return;
  }

  const res = await fetch(API_ALL);
  if (!res.ok) throw new Error('Unable to load fund list');
  const data = await res.json();
  state.fundList = data || [];

  localStorage.setItem(cacheKey, JSON.stringify(state.fundList));
  localStorage.setItem(cacheTsKey, String(Date.now()));
}

function performSearch() {
  const q = el.searchInput.value.trim().toLowerCase();
  if (!q) {
    renderSearchResults(state.fundList.slice(0, 50));
    return;
  }

  const filtered = state.fundList
    .filter((f) => f.schemeName?.toLowerCase().includes(q))
    .slice(0, 100);

  renderSearchResults(filtered);
}

function renderSearchResults(items) {
  el.searchResults.innerHTML = '';

  if (!items.length) {
    el.searchResults.innerHTML = '<div class="result-item">No matching funds found.</div>';
    return;
  }

  items.forEach((fund) => {
    const row = document.createElement('label');
    row.className = 'result-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(fund.schemeCode);
    cb.addEventListener('change', () => toggleSelectedFund(fund, cb.checked));

    const text = document.createElement('span');
    text.textContent = `${fund.schemeCode} — ${fund.schemeName}`;

    row.append(cb, text);
    el.searchResults.appendChild(row);
  });
}

function toggleSelectedFund(fund, checked) {
  if (checked) {
    if (state.selected.size >= 3) {
      alert('You can compare up to 3 funds only.');
      performSearch();
      return;
    }
    state.selected.set(fund.schemeCode, fund);
  } else {
    state.selected.delete(fund.schemeCode);
  }
}

async function compareSelectedFunds() {
  const selectedFunds = [...state.selected.values()];
  if (!selectedFunds.length) {
    alert('Please select at least one fund.');
    return;
  }

  const datasets = [];
  const metrics = [];

  for (const fund of selectedFunds) {
    const scheme = await fetchSchemeData(fund.schemeCode);
    const navData = (scheme.data || []).slice().reverse();
    if (!navData.length) continue;

    const parsed = navData
      .map((x) => ({
        date: parseDate(x.date),
        nav: Number(x.nav),
      }))
      .filter((x) => x.date && Number.isFinite(x.nav));

    const latestNAV = parsed[parsed.length - 1].nav;
    const oneYearReturn = trailing1YReturn(parsed);
    const vol = annualizedVolatility(parsed);

    metrics.push({
      schemeCode: fund.schemeCode,
      schemeName: fund.schemeName,
      latestNAV,
      oneYearReturn,
      volatility: vol,
    });

    datasets.push({
      label: `${fund.schemeCode}`,
      data: parsed.map((p) => p.nav),
      tension: 0.15,
      borderWidth: 2,
      pointRadius: 0,
    });
  }

  state.compareMetrics = metrics;
  renderMetrics(metrics);
  drawChart(datasets);
}

async function fetchSchemeData(code) {
  const res = await fetch(API_SCHEME(code));
  if (!res.ok) throw new Error(`Unable to load scheme ${code}`);
  return res.json();
}

function parseDate(str) {
  if (!str) return null;
  const [d, m, y] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function trailing1YReturn(points) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const targetDate = new Date(last.date);
  targetDate.setFullYear(targetDate.getFullYear() - 1);

  let closest = points[0];
  let minDiff = Infinity;
  for (const p of points) {
    const diff = Math.abs(p.date - targetDate);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }

  return ((last.nav - closest.nav) / closest.nav) * 100;
}

function annualizedVolatility(points) {
  if (points.length < 3) return null;
  const dailyReturns = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].nav;
    const curr = points[i].nav;
    if (prev > 0 && curr > 0) {
      dailyReturns.push(Math.log(curr / prev));
    }
  }

  if (!dailyReturns.length) return null;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((acc, x) => acc + (x - mean) ** 2, 0) / dailyReturns.length;
  const dailyStd = Math.sqrt(variance);
  return dailyStd * Math.sqrt(252) * 100;
}

function renderMetrics(metrics) {
  el.metricsPanel.innerHTML = '';
  if (!metrics.length) return;

  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `
      <h4>${escapeHTML(m.schemeName)}</h4>
      <p><strong>Scheme Code:</strong> ${m.schemeCode}</p>
      <p><strong>Latest NAV:</strong> ₹${fmt(m.latestNAV)}</p>
      <p><strong>Trailing 1Y Return:</strong> ${fmtPct(m.oneYearReturn)}</p>
      <p><strong>Annualized Volatility:</strong> ${fmtPct(m.volatility)}</p>
    `;
    el.metricsPanel.appendChild(card);
  });
}

function drawChart(datasets) {
  if (state.chart) state.chart.destroy();

  const labels = selectedDateLabels(datasets);

  state.chart = new Chart(el.chartCanvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
      },
      scales: {
        x: {
          title: { display: true, text: 'Date (recent to old)' },
        },
        y: {
          title: { display: true, text: 'NAV (₹)' },
        },
      },
    },
  });
}

function selectedDateLabels(datasets) {
  const maxLen = Math.max(...datasets.map((d) => d.data.length), 0);
  return Array.from({ length: maxLen }, (_, i) => `Point ${i + 1}`);
}

function loadPortfolio() {
  try {
    return JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePortfolio() {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(state.portfolio));
}

async function addOrUpdateHoldingFromInputs() {
  const schemeCode = String(el.pSchemeCode.value).trim();
  const units = Number(el.pUnits.value);
  const avgNav = Number(el.pAvgNav.value);

  if (!schemeCode || !Number.isFinite(units) || units <= 0 || !Number.isFinite(avgNav) || avgNav <= 0) {
    alert('Please provide valid scheme code, units, and avg buy NAV.');
    return;
  }

  const fund = state.fundList.find((x) => String(x.schemeCode) === schemeCode);
  if (!fund) {
    alert('Scheme code not found in fund master list.');
    return;
  }

  state.portfolio[schemeCode] = {
    schemeCode,
    schemeName: fund.schemeName,
    units,
    avgNav,
    latestNav: state.portfolio[schemeCode]?.latestNav || null,
  };

  savePortfolio();
  renderPortfolio();
}

async function refreshPortfolioNAV() {
  const codes = Object.keys(state.portfolio);
  if (!codes.length) {
    alert('Portfolio is empty.');
    return;
  }

  for (const code of codes) {
    try {
      const scheme = await fetchSchemeData(code);
      const latest = scheme.data?.[0]?.nav;
      if (latest) state.portfolio[code].latestNav = Number(latest);
    } catch (err) {
      console.error('Failed NAV refresh for', code, err);
    }
  }

  savePortfolio();
  renderPortfolio();
}

function clearPortfolio() {
  if (!confirm('Clear all portfolio holdings?')) return;
  state.portfolio = {};
  savePortfolio();
  renderPortfolio();
}

function removeHolding(code) {
  delete state.portfolio[code];
  savePortfolio();
  renderPortfolio();
}

function renderPortfolio() {
  const holdings = Object.values(state.portfolio);
  el.pTableBody.innerHTML = '';

  let totalInvested = 0;
  let totalCurrent = 0;

  holdings.forEach((h) => {
    const invested = h.units * h.avgNav;
    const current = h.latestNav ? h.units * h.latestNav : 0;
    const pl = current - invested;
    totalInvested += invested;
    totalCurrent += current;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Scheme Code">${h.schemeCode}</td>
      <td data-label="Scheme Name">${escapeHTML(h.schemeName)}</td>
      <td data-label="Units">${fmt(h.units)}</td>
      <td data-label="Avg NAV">₹${fmt(h.avgNav)}</td>
      <td data-label="Latest NAV">${h.latestNav ? `₹${fmt(h.latestNav)}` : 'N/A'}</td>
      <td data-label="Invested">₹${fmt(invested)}</td>
      <td data-label="Current">${current ? `₹${fmt(current)}` : 'N/A'}</td>
      <td data-label="P/L" class="${pl >= 0 ? 'pl-positive' : 'pl-negative'}">${current ? `₹${fmt(pl)}` : 'N/A'}</td>
      <td data-label="Actions"><button class="btn btn-danger" data-remove="${h.schemeCode}">Remove</button></td>
    `;
    el.pTableBody.appendChild(tr);
  });

  el.pTableBody.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeHolding(btn.dataset.remove));
  });

  const totalPL = totalCurrent - totalInvested;
  el.pSummary.innerHTML = `
    <strong>Summary:</strong>
    Invested: ₹${fmt(totalInvested)} | Current: ₹${fmt(totalCurrent)} |
    <span class="${totalPL >= 0 ? 'pl-positive' : 'pl-negative'}">P/L: ₹${fmt(totalPL)}</span>
  `;
}

async function importFromPdf() {
  const file = el.pdfInput.files?.[0];
  if (!file) {
    updatePdfStatus('Please choose a PDF file first.');
    return;
  }

  if (!window.pdfjsLib) {
    updatePdfStatus('pdf.js is not available. Check CDN loading.');
    return;
  }

  try {
    updatePdfStatus('Reading PDF...');
    const buf = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: buf });
    const pdf = await loadingTask.promise;

    let fullText = '';
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = content.items.map((i) => i.str).join(' ');
      fullText += `\n${pageText}`;
    }

    const matches = detectHoldingsFromText(fullText);

    if (!matches.length) {
      updatePdfStatus('No holdings confidently detected. Try a text-based folio PDF.');
      return;
    }

    let importedCount = 0;
    for (const match of matches) {
      const code = String(match.schemeCode);
      const existing = state.portfolio[code];

      state.portfolio[code] = {
        schemeCode: code,
        schemeName: match.schemeName,
        units: match.units,
        avgNav: existing?.avgNav || 10,
        latestNav: existing?.latestNav || null,
      };
      importedCount++;
    }

    savePortfolio();
    renderPortfolio();

    updatePdfStatus(
      `Imported ${importedCount} holdings (heuristic). Avg NAV defaulted to 10 for new holdings where unknown. Please review values.`
    );
  } catch (err) {
    console.error(err);
    updatePdfStatus(`PDF import failed: ${err.message}`);
  }
}

function detectHoldingsFromText(text) {
  const lowered = text.toLowerCase();
  const out = [];

  for (const fund of state.fundList) {
    const name = (fund.schemeName || '').toLowerCase();
    if (!name || name.length < 18) continue;

    const idx = lowered.indexOf(name);
    if (idx === -1) continue;

    const windowStart = Math.max(0, idx - 100);
    const windowEnd = Math.min(lowered.length, idx + name.length + 140);
    const nearby = lowered.slice(windowStart, windowEnd);

    const numMatches = nearby.match(/\b\d{1,6}(?:[.,]\d{1,4})?\b/g) || [];
    const parsedNums = numMatches
      .map((s) => Number(s.replace(/,/g, '')))
      .filter((n) => Number.isFinite(n) && n > 0.0001);

    if (!parsedNums.length) continue;

    const units = parsedNums.find((n) => n > 0.1 && n < 10000000);
    if (!units) continue;

    out.push({
      schemeCode: fund.schemeCode,
      schemeName: fund.schemeName,
      units,
    });

    if (out.length >= 30) break;
  }

  const dedup = new Map();
  out.forEach((m) => dedup.set(String(m.schemeCode), m));
  return [...dedup.values()];
}

function updatePdfStatus(msg) {
  el.pdfStatus.value = msg;
}

function generateAdvice() {
  const sip = Number(el.sip.value);
  const years = Number(el.horizon.value);
  const risk = el.risk.value;
  const emergencyReady = el.emergency.value === 'yes';

  if (!Number.isFinite(sip) || sip <= 0 || !Number.isFinite(years) || years <= 0) {
    alert('Please enter valid SIP amount and horizon.');
    return;
  }

  const riskReturns = {
    conservative: 0.09,
    moderate: 0.12,
    aggressive: 0.14,
  };

  const annualRate = riskReturns[risk] || 0.12;
  const monthlyRate = annualRate / 12;
  const months = years * 12;

  const corpus = sip * (((1 + monthlyRate) ** months - 1) / monthlyRate) * (1 + monthlyRate);

  const avgVol = state.compareMetrics.length
    ? state.compareMetrics.reduce((acc, m) => acc + (m.volatility || 0), 0) / state.compareMetrics.length
    : null;

  const points = [];
  points.push(`Estimated SIP corpus after ${years} years at ~${(annualRate * 100).toFixed(1)}% p.a.: ₹${fmt(corpus)}.`);

  if (!emergencyReady) {
    points.push('Build/strengthen an emergency fund (typically 3–6 months expenses) before taking higher equity risk.');
  } else {
    points.push('Emergency fund readiness looks positive; this supports long-term SIP discipline.');
  }

  if (state.compareMetrics.length) {
    points.push(`Current selected fund basket average annualized volatility is around ${fmtPct(avgVol)}.`);
    points.push('Prefer diversification across categories (large cap/flexi cap/hybrid/debt) based on your risk profile.');
  } else {
    points.push('Select and compare funds first to get fund-specific risk and return context in this advice.');
  }

  if (risk === 'conservative') {
    points.push('Consider a higher allocation to debt/hybrid funds and stagger equity exposure via SIP.');
  } else if (risk === 'moderate') {
    points.push('Balance core diversified equity funds with some debt allocation to reduce drawdown stress.');
  } else {
    points.push('Aggressive profile: keep horizon long and review downside tolerance during market corrections.');
  }

  points.push('Educational note: this is a heuristic guidance engine, not personalized financial advice.');

  el.adviceOutput.innerHTML = `
    <h3>AI Guidance Snapshot</h3>
    <ul>${points.map((p) => `<li>${escapeHTML(p)}</li>`).join('')}</ul>
  `;
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtPct(n) {
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : 'N/A';
}

function escapeHTML(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
