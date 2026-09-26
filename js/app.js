/* ==========================================================
   Expense & Budget Visualizer — app.js
   Vanilla JS only · No frameworks · LocalStorage
   ========================================================== */

'use strict';

/* ----------------------------------------------------------
   1. Constants
   ---------------------------------------------------------- */
const LS_TRANSACTIONS = 'ebv_transactions';
const LS_LIMIT        = 'ebv_limit';
const LS_THEME        = 'ebv_theme';

const CATEGORY_META = {
  Food:      { emoji: '🍔', color: '#4361ee' },
  Transport: { emoji: '🚌', color: '#7209b7' },
  Fun:       { emoji: '🎮', color: '#f72585' },
};

/* ----------------------------------------------------------
   2. State
   ---------------------------------------------------------- */
let transactions = [];   // [{ id, name, amount, category, createdAt }]
let spendingLimit = 0;   // 0 means no limit set
let pieChart = null;     // Chart.js instance

/* ----------------------------------------------------------
   3. DOM References
   ---------------------------------------------------------- */
// Header
const themeToggle  = document.getElementById('themeToggle');
const themeIcon    = document.getElementById('themeIcon');

// Balance
const totalBalanceEl = document.getElementById('totalBalance');

// Limit section
const limitInput    = document.getElementById('limitInput');
const setLimitBtn   = document.getElementById('setLimitBtn');
const clearLimitBtn = document.getElementById('clearLimitBtn');
const limitBadge    = document.getElementById('limitBadge');
const limitDisplay  = document.getElementById('limitDisplay');
const limitSpentEl  = document.getElementById('limitSpent');
const limitMaxEl    = document.getElementById('limitMax');
const progressBar   = document.getElementById('progressBar');
const progressFill  = document.getElementById('progressFill');
const limitPctEl    = document.getElementById('limitPct');

// Form
const transactionForm = document.getElementById('transactionForm');
const itemNameInput   = document.getElementById('itemName');
const amountInput     = document.getElementById('amount');
const categorySelect  = document.getElementById('category');

// List
const transactionList = document.getElementById('transactionList');
const emptyListEl     = document.getElementById('emptyList');
const sortSelect      = document.getElementById('sortSelect');

// Chart
const pieChartCanvas = document.getElementById('pieChart');
const emptyChartEl   = document.getElementById('emptyChart');

/* ----------------------------------------------------------
   4. LocalStorage Helpers
   ---------------------------------------------------------- */
function saveTransactions() {
  localStorage.setItem(LS_TRANSACTIONS, JSON.stringify(transactions));
}

function saveLimit() {
  localStorage.setItem(LS_LIMIT, JSON.stringify(spendingLimit));
}

function loadFromStorage() {
  // Transactions
  try {
    const raw = localStorage.getItem(LS_TRANSACTIONS);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }

  // Spending limit
  try {
    const raw = localStorage.getItem(LS_LIMIT);
    spendingLimit = raw ? JSON.parse(raw) : 0;
  } catch {
    spendingLimit = 0;
  }
}

/* ----------------------------------------------------------
   5. Formatting
   ---------------------------------------------------------- */
function formatRp(amount) {
  return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ----------------------------------------------------------
   6. Theme
   ---------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(LS_THEME, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ----------------------------------------------------------
   7. Validation
   ---------------------------------------------------------- */
function showError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  field.classList.add('is-invalid');
  error.textContent = message;
}

function clearErrors() {
  [
    ['itemName',  'itemNameError'],
    ['amount',    'amountError'],
    ['category',  'categoryError'],
  ].forEach(([fieldId, errorId]) => {
    document.getElementById(fieldId).classList.remove('is-invalid');
    document.getElementById(errorId).textContent = '';
  });
}

function validateForm() {
  let valid = true;

  if (!itemNameInput.value.trim()) {
    showError('itemName', 'itemNameError', 'Item name is required.');
    valid = false;
  }

  const amt = parseFloat(amountInput.value);
  if (amountInput.value === '' || isNaN(amt) || amt <= 0) {
    showError('amount', 'amountError', 'Enter a valid amount greater than 0.');
    valid = false;
  }

  if (!categorySelect.value) {
    showError('category', 'categoryError', 'Please select a category.');
    valid = false;
  }

  return valid;
}

/* ----------------------------------------------------------
   8. Transactions — Add & Delete
   ---------------------------------------------------------- */
function addTransaction(e) {
  e.preventDefault();
  clearErrors();

  if (!validateForm()) return;

  const tx = {
    id:        generateId(),
    name:      itemNameInput.value.trim(),
    amount:    parseFloat(amountInput.value),
    category:  categorySelect.value,
    createdAt: Date.now(),
  };

  transactions.unshift(tx);   // newest first in the source array
  saveTransactions();

  transactionForm.reset();
  clearErrors();

  render();
}

function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveTransactions();
  render();
}

/* ----------------------------------------------------------
   9. Sorting
   ---------------------------------------------------------- */
function getSortedTransactions() {
  const mode = sortSelect.value;
  // Copy so we never mutate the source array
  const arr = [...transactions];

  switch (mode) {
    case 'oldest':
      // source array is newest-first; reverse gives oldest-first
      return arr.reverse();
    case 'amount-desc':
      return arr.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return arr.sort((a, b) => a.amount - b.amount);
    case 'category':
      return arr.sort((a, b) => a.category.localeCompare(b.category));
    case 'newest':
    default:
      return arr;   // already newest-first
  }
}

/* ----------------------------------------------------------
   10. Render — Balance
   ---------------------------------------------------------- */
function renderBalance() {
  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  totalBalanceEl.textContent = formatRp(total);
  return total;
}

/* ----------------------------------------------------------
   11. Render — Spending Limit
   ---------------------------------------------------------- */
function renderLimit(total) {
  if (spendingLimit <= 0) {
    limitDisplay.hidden  = true;
    clearLimitBtn.hidden = true;
    limitBadge.hidden    = true;
    return;
  }

  // Show controls
  limitDisplay.hidden  = false;
  clearLimitBtn.hidden = false;

  // Numbers
  limitSpentEl.textContent = formatRp(total);
  limitMaxEl.textContent   = formatRp(spendingLimit);

  // Percentage (cap visual at 100%)
  const pct        = (total / spendingLimit) * 100;
  const visualPct  = Math.min(pct, 100);
  const isOver     = pct >= 100;
  const isWarn     = pct >= 80 && !isOver;

  progressFill.style.width = visualPct + '%';
  progressFill.classList.toggle('warn', isWarn);
  progressFill.classList.toggle('over', isOver);

  // ARIA
  progressBar.setAttribute('aria-valuenow', Math.round(visualPct));

  // Label
  limitPctEl.textContent = pct.toFixed(1) + '% used';

  // Over-limit badge
  limitBadge.hidden = !isOver;
}

/* ----------------------------------------------------------
   12. Render — Transaction List
   ---------------------------------------------------------- */
function renderList() {
  transactionList.innerHTML = '';

  const sorted = getSortedTransactions();

  if (sorted.length === 0) {
    emptyListEl.hidden = false;
    return;
  }

  emptyListEl.hidden = true;

  sorted.forEach(tx => {
    const meta    = CATEGORY_META[tx.category] || { emoji: '📦', color: '#6b7280' };
    const isOver  = spendingLimit > 0 && tx.amount > spendingLimit;

    const li = document.createElement('li');
    li.className = 'transaction-item' + (isOver ? ' over-limit' : '');
    li.setAttribute('data-id', tx.id);

    li.innerHTML = `
      <span class="item-icon" aria-hidden="true">${meta.emoji}</span>
      <div class="item-body">
        <div class="item-name">${escapeHtml(tx.name)}</div>
        <div class="item-category">${escapeHtml(tx.category)}</div>
      </div>
      <span class="item-amount">${formatRp(tx.amount)}</span>
      <button
        class="btn-delete"
        aria-label="Delete transaction: ${escapeHtml(tx.name)}"
        data-id="${tx.id}"
      >🗑️</button>
    `;

    transactionList.appendChild(li);
  });

  // Attach delete listeners (event delegation alternative — direct binding is fine here)
  transactionList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTransaction(btn.dataset.id));
  });
}

/* ----------------------------------------------------------
   13. Render — Pie Chart
   ---------------------------------------------------------- */
function renderChart() {
  // Aggregate totals by category
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  const colors = labels.map(l => (CATEGORY_META[l] || { color: '#6b7280' }).color);

  if (labels.length === 0) {
    pieChartCanvas.hidden = true;
    emptyChartEl.style.display = 'block';
    if (pieChart) {
      pieChart.destroy();
      pieChart = null;
    }
    return;
  }

  pieChartCanvas.hidden = false;
  emptyChartEl.style.display = 'none';

  if (pieChart) {
    // Update existing chart in-place (no flicker)
    pieChart.data.labels                        = labels;
    pieChart.data.datasets[0].data             = data;
    pieChart.data.datasets[0].backgroundColor  = colors;
    pieChart.update();
    return;
  }

  // Create chart for the first time
  pieChart = new Chart(pieChartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: document.documentElement.getAttribute('data-theme') === 'dark'
          ? '#161926'
          : '#ffffff',
        borderWidth: 3,
        hoverOffset: 10,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 16,
            font: { size: 13, family: "'Segoe UI', system-ui, sans-serif" },
            color: getComputedStyle(document.documentElement)
                     .getPropertyValue('--color-text').trim() || '#1a1d2e',
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const val   = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((val / total) * 100).toFixed(1);
              return `  ${formatRp(val)}  (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ----------------------------------------------------------
   14. Master Render
   ---------------------------------------------------------- */
function render() {
  const total = renderBalance();
  renderLimit(total);
  renderList();
  renderChart();
}

/* ----------------------------------------------------------
   15. Spending Limit — Set & Clear
   ---------------------------------------------------------- */
function handleSetLimit() {
  const value = parseFloat(limitInput.value);
  if (!limitInput.value || isNaN(value) || value <= 0) {
    limitInput.classList.add('is-invalid');
    limitInput.focus();
    return;
  }
  limitInput.classList.remove('is-invalid');
  spendingLimit = value;
  saveLimit();
  render();
}

function handleClearLimit() {
  spendingLimit = 0;
  saveLimit();
  limitInput.value = '';
  limitInput.classList.remove('is-invalid');
  render();
}

/* ----------------------------------------------------------
   16. Event Listeners
   ---------------------------------------------------------- */
themeToggle.addEventListener('click', toggleTheme);

transactionForm.addEventListener('submit', addTransaction);

sortSelect.addEventListener('change', renderList);

setLimitBtn.addEventListener('click', handleSetLimit);

clearLimitBtn.addEventListener('click', handleClearLimit);

// Allow pressing Enter in the limit input to set the limit
limitInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSetLimit();
  }
});

// Clear invalid styling as soon as the user starts typing
limitInput.addEventListener('input', () => {
  limitInput.classList.remove('is-invalid');
});

/* ----------------------------------------------------------
   17. Initialisation
   ---------------------------------------------------------- */
(function init() {
  // 1. Restore theme (before paint to avoid flash)
  const savedTheme = localStorage.getItem(LS_THEME) || 'light';
  applyTheme(savedTheme);

  // 2. Load data from LocalStorage
  loadFromStorage();

  // 3. Pre-fill limit input if a limit was saved
  if (spendingLimit > 0) {
    limitInput.value = spendingLimit;
  }

  // 4. Initial render
  render();
}());
