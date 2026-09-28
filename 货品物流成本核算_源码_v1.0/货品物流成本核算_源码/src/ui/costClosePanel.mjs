import {
  COST_CLOSE_CATEGORIES,
  calculateActualCostSummary,
  compareCostSnapshots,
  createActualCosts,
  createEstimatedCostSnapshot,
  reopenSettlement,
  settleBatch,
  upliftPercentage
} from '../calculators/costClose.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const localeFor = lang => lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : 'en-US';
const makeLineId = () => globalThis.crypto?.randomUUID?.() || `cost-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function mountCostClosePanel({state, root, estimatedSection, tx, money, getLang, getEstimate, onPersist, onMutation}) {
  let activeTab = 'estimate';
  let latestEstimate = null;
  let message = '';
  let messageState = 'neutral';

  const batch = () => state.activeBatch;
  const dateTime = value => value ? new Date(value).toLocaleString(localeFor(getLang())) : '—';
  const percent = value => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : '—';
  const inputAmount = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '' : Number(value).toFixed(2);
  const varianceClass = value => !Number.isFinite(Number(value)) || Math.abs(Number(value)) < 0.01 ? 'neutral' : Number(value) > 0 ? 'over' : 'under';
  const sourceLabel = snapshot => {
    if (!snapshot?.source) return '—';
    if (snapshot.source.kind === 'quote') return [snapshot.source.forwarderName, snapshot.source.quoteNumber].filter(Boolean).join(' · ');
    return tx(snapshot.source.kind === 'manual' ? 'fclManualSource' : 'referenceEstimate');
  };

  function ensureActualCosts() {
    if (!batch().actualCosts || !Array.isArray(batch().actualCosts.lines)) {
      batch().actualCosts = createActualCosts(batch().actualCosts || {});
    }
    return batch().actualCosts;
  }

  function captureEstimate() {
    const result = latestEstimate || getEstimate();
    batch().estimatedCosts = createEstimatedCostSnapshot({batch: batch(), result});
    ensureActualCosts();
    message = tx('settlementSnapshotSaved');
    messageState = 'success';
    onPersist();
  }

  function ensureSnapshot() {
    if (batch().estimatedCosts?.capturedAt) return true;
    try {
      captureEstimate();
      return true;
    } catch (error) {
      message = tx(`settlementError_${error.code || 'ESTIMATE_UNAVAILABLE'}`);
      messageState = 'error';
      return false;
    }
  }

  function summaryMarkup(estimate, actualSummary) {
    const estimatedTotal = Number(estimate?.total);
    const actualTotal = actualSummary?.valid ? actualSummary.totals.total : null;
    const difference = Number.isFinite(estimatedTotal) && Number.isFinite(actualTotal) ? actualTotal - estimatedTotal : null;
    const varianceRate = Number.isFinite(difference) && estimatedTotal !== 0 ? difference / estimatedTotal * 100 : null;
    return `<section class="settlement-summary" aria-label="${escapeHtml(tx('settlementSummary'))}">
      <div><span>${escapeHtml(tx('settlementEstimatedTotal'))}</span><strong>${Number.isFinite(estimatedTotal) ? money(estimatedTotal) : '—'}</strong></div>
      <div><span>${escapeHtml(tx('settlementActualTotal'))}</span><strong>${Number.isFinite(actualTotal) ? money(actualTotal) : '—'}</strong></div>
      <div><span>${escapeHtml(tx('settlementDifference'))}</span><strong class="variance-value ${varianceClass(difference)}">${Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${money(difference)}` : '—'}</strong></div>
      <div><span>${escapeHtml(tx('settlementVarianceRate'))}</span><strong class="variance-value ${varianceClass(varianceRate)}">${Number.isFinite(varianceRate) ? `${varianceRate > 0 ? '+' : ''}${percent(varianceRate)}` : '—'}</strong></div>
    </section>`;
  }

  function settlementStatusMarkup(current) {
    if (current.status !== 'settled') return '';
    return `<section class="settlement-status" role="status">
      <div><strong>${escapeHtml(tx('settlementClosed'))}</strong><span>${escapeHtml(tx('settlementClosedAt'))}: ${escapeHtml(dateTime(current.settlement?.settledAt))}</span></div>
      <div class="settlement-uplift"><span>${escapeHtml(tx('settlementEstimatedUplift'))} <b>${percent(current.settlement?.estimatedUplift)}</b></span><span>${escapeHtml(tx('settlementActualUplift'))} <b>${percent(current.settlement?.actualUplift)}</b></span></div>
      <button class="btn secondary" type="button" data-reopen-settlement>${escapeHtml(tx('settlementReopen'))}</button>
    </section>`;
  }

  function estimateMarkup(estimate, current) {
    if (!estimate?.capturedAt) {
      return `<section class="settlement-empty"><h3>${escapeHtml(tx('settlementEstimateEmptyTitle'))}</h3><p>${escapeHtml(tx('settlementEstimateEmptyHint'))}</p><button class="btn primary" type="button" data-capture-estimate>${escapeHtml(tx('settlementCaptureEstimate'))}</button></section>`;
    }
    const quote = estimate.quoteSnapshot;
    return `<section class="settlement-snapshot-meta">
      <div><span>${escapeHtml(tx('settlementSnapshotTime'))}</span><b>${escapeHtml(dateTime(estimate.capturedAt))}</b></div>
      <div><span>${escapeHtml(tx('landedSource'))}</span><b>${escapeHtml(sourceLabel(estimate))}</b></div>
      <div><span>${escapeHtml(tx('settlementRouteSnapshot'))}</span><b>${escapeHtml(estimate.routeSnapshot?.selectedRoute || '—')}</b></div>
      <div><span>JPY/CNY</span><b>${Number(estimate.fxSnapshot?.JPY_CNY?.rate || 0).toFixed(4)}</b></div>
      <div><span>USD/CNY</span><b>${Number(estimate.fxSnapshot?.USD_CNY?.rate || 0).toFixed(4)}</b></div>
      <div><span>${escapeHtml(tx('settlementQuoteSnapshot'))}</span><b>${escapeHtml(quote ? [quote.forwarderName, quote.quoteNumber].filter(Boolean).join(' · ') : tx('settlementNoQuote'))}</b></div>
      ${current.status === 'settled' ? '' : `<button class="btn secondary" type="button" data-capture-estimate>${escapeHtml(tx('settlementRefreshEstimate'))}</button>`}
    </section>`;
  }

  function actualFormMarkup(current, estimate, actualSummary) {
    const actual = ensureActualCosts();
    const locked = current.status === 'settled';
    const fields = COST_CLOSE_CATEGORIES.map(key => `<div class="actual-cost-field">
      <label for="actual-${key}">${escapeHtml(tx(`settlementCategory_${key}`))}</label>
      <div class="actual-cost-control"><span>¥</span><input id="actual-${key}" type="number" min="0" step="0.01" inputmode="decimal" data-actual-cost="${key}" value="${inputAmount(actual[key])}" ${locked ? 'disabled' : ''}></div>
      ${locked ? '' : `<button class="cost-copy" type="button" data-use-estimate="${key}">${escapeHtml(tx('settlementUseEstimate'))} ${Number.isFinite(Number(estimate?.[key])) ? money(estimate[key]) : '—'}</button>`}
    </div>`).join('');
    const lines = actual.lines.map(line => `<div class="actual-line" data-actual-line="${escapeHtml(line.id)}">
      <input aria-label="${escapeHtml(tx('settlementLineName'))}" data-line-field="name" value="${escapeHtml(line.name)}" placeholder="${escapeHtml(tx('settlementLineName'))}" ${locked ? 'disabled' : ''}>
      <select aria-label="${escapeHtml(tx('settlementLineCategory'))}" data-line-field="category" ${locked ? 'disabled' : ''}>${COST_CLOSE_CATEGORIES.map(key => `<option value="${key}"${line.category === key ? ' selected' : ''}>${escapeHtml(tx(`settlementCategory_${key}`))}</option>`).join('')}</select>
      <input aria-label="${escapeHtml(tx('settlementLineAmount'))}" data-line-field="amount" type="number" min="0" step="0.01" value="${inputAmount(line.amount)}" placeholder="0.00" ${locked ? 'disabled' : ''}>
      <input aria-label="${escapeHtml(tx('settlementLineNote'))}" data-line-field="note" value="${escapeHtml(line.note)}" placeholder="${escapeHtml(tx('settlementLineNote'))}" ${locked ? 'disabled' : ''}>
      ${locked ? '' : `<button class="remove" type="button" data-remove-line aria-label="${escapeHtml(tx('settlementRemoveLine'))}">×</button>`}
    </div>`).join('');
    return `<section class="actual-cost-entry">
      <div class="settlement-section-head"><div><h3>${escapeHtml(tx('settlementActualEntry'))}</h3><p>${escapeHtml(tx('settlementActualHint'))}</p></div><strong>${actualSummary?.valid ? money(actualSummary.totals.total) : '—'}</strong></div>
      <div class="actual-cost-grid">${fields}</div>
      <div class="actual-lines-head"><div><h3>${escapeHtml(tx('settlementActualLines'))}</h3><p>${escapeHtml(tx('settlementActualLinesHint'))}</p></div>${locked ? '' : `<button class="btn secondary" type="button" data-add-line>${escapeHtml(tx('settlementAddLine'))}</button>`}</div>
      <div class="actual-lines">${lines || `<p class="settlement-inline-empty">${escapeHtml(tx('settlementNoLines'))}</p>`}</div>
    </section>`;
  }

  function comparisonMarkup(estimate, actualSummary) {
    const rows = compareCostSnapshots(estimate, actualSummary);
    return `<section class="settlement-comparison"><div class="table-scroll-hint">${escapeHtml(tx('tableScrollHint'))}</div><div class="tablewrap"><table class="table"><thead><tr><th>${escapeHtml(tx('settlementCostCategory'))}</th><th class="col-money">${escapeHtml(tx('settlementEstimate'))}</th><th class="col-money">${escapeHtml(tx('settlementActual'))}</th><th class="col-money">${escapeHtml(tx('settlementVariance'))}</th><th class="col-number">${escapeHtml(tx('settlementVarianceRate'))}</th></tr></thead><tbody>${rows.map(row => `<tr${row.key === 'total' ? ' class="comparison-total"' : ''}><td>${escapeHtml(tx(`settlementCategory_${row.key}`))}</td><td class="col-money">${row.estimated == null ? '—' : money(row.estimated)}</td><td class="col-money">${row.actual == null ? '—' : money(row.actual)}</td><td class="col-money variance-value ${varianceClass(row.variance)}">${row.variance == null ? '—' : `${row.variance > 0 ? '+' : ''}${money(row.variance)}`}</td><td class="col-number variance-value ${varianceClass(row.variancePercent)}">${row.variancePercent == null ? '—' : `${row.variancePercent > 0 ? '+' : ''}${percent(row.variancePercent)}`}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function allocationMarkup(current) {
    const rows = current.settlement?.actualItemCosts;
    if (!Array.isArray(rows) || !rows.length) return '';
    return `<section class="actual-item-allocation"><div class="settlement-section-head"><div><h3>${escapeHtml(tx('settlementActualAllocation'))}</h3><p>${escapeHtml(tx('settlementActualAllocationHint'))}</p></div><span>${escapeHtml(tx('allocationCurrent'))}: <b>${escapeHtml(tx(`basis_${current.settlement.allocationBasis}`))}</b></span></div><div class="table-scroll-hint">${escapeHtml(tx('tableScrollHint'))}</div><div class="tablewrap"><table class="table"><thead><tr><th>${escapeHtml(tx('name'))}</th><th>${escapeHtml(tx('sku'))}</th><th class="col-number">${escapeHtml(tx('qty'))}</th><th class="col-money">${escapeHtml(tx('purchase'))}</th><th class="col-money">${escapeHtml(tx('settlementActualTotal'))}</th><th class="col-money">${escapeHtml(tx('settlementActualUnitCost'))}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.sku || '—')}</td><td class="col-number">${row.quantity}</td><td class="col-money">${money(row.purchase)}</td><td class="col-money"><b>${money(row.total)}</b></td><td class="col-money"><b>${money(row.unitCost)}</b></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function bindEvents() {
    root.querySelectorAll('[data-cost-tab]').forEach(button => button.addEventListener('click', () => {
      const next = button.dataset.costTab;
      if (next !== 'estimate' && !ensureSnapshot()) { render(); return; }
      activeTab = next;
      render();
    }));
    root.querySelectorAll('[data-capture-estimate]').forEach(button => button.addEventListener('click', () => {
      try { captureEstimate(); } catch (error) {
        message = tx(`settlementError_${error.code || 'ESTIMATE_UNAVAILABLE'}`);
        messageState = 'error';
      }
      render();
    }));
    root.querySelectorAll('[data-use-estimate]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.useEstimate;
      ensureActualCosts()[key] = Number(batch().estimatedCosts[key]);
      onPersist();
      render();
    }));
    root.querySelectorAll('[data-actual-cost]').forEach(input => input.addEventListener('input', () => {
      ensureActualCosts()[input.dataset.actualCost] = input.value === '' ? null : Number(input.value);
      ensureActualCosts().updatedAt = new Date().toISOString();
      onPersist();
    }));
    root.querySelectorAll('[data-actual-cost]').forEach(input => input.addEventListener('change', () => render()));
    root.querySelector('[data-add-line]')?.addEventListener('click', () => {
      ensureActualCosts().lines.push({id: makeLineId(), name: '', category: 'other', amount: null, note: ''});
      onPersist();
      render();
      root.querySelector('.actual-line:last-child input')?.focus();
    });
    root.querySelectorAll('[data-actual-line]').forEach(row => {
      const line = ensureActualCosts().lines.find(entry => entry.id === row.dataset.actualLine);
      row.querySelectorAll('[data-line-field]').forEach(input => input.addEventListener('input', () => {
        line[input.dataset.lineField] = input.dataset.lineField === 'amount' ? input.value === '' ? null : Number(input.value) : input.value;
        ensureActualCosts().updatedAt = new Date().toISOString();
        onPersist();
      }));
      row.querySelector('[data-remove-line]')?.addEventListener('click', () => {
        ensureActualCosts().lines = ensureActualCosts().lines.filter(entry => entry.id !== row.dataset.actualLine);
        onPersist();
        render();
      });
    });
    root.querySelector('[data-close-settlement]')?.addEventListener('click', () => {
      try {
        if (!ensureSnapshot()) { render(); return; }
        settleBatch(batch());
        message = tx('settlementClosedSuccess');
        messageState = 'success';
        onMutation();
      } catch (error) {
        const key = `settlementError_${error.code || 'UNKNOWN'}`;
        message = tx(key) === key ? tx('settlementError_UNKNOWN') : tx(key);
        messageState = 'error';
      }
      render();
    });
    root.querySelector('[data-reopen-settlement]')?.addEventListener('click', () => {
      if (!globalThis.confirm(tx('settlementReopenConfirm'))) return;
      try {
        reopenSettlement(batch());
        message = tx('settlementReopenedSuccess');
        messageState = 'success';
        onMutation();
      } catch (error) {
        message = tx('settlementError_UNKNOWN');
        messageState = 'error';
      }
      render();
    });
  }

  function render({estimate = latestEstimate} = {}) {
    if (estimate) latestEstimate = estimate;
    const current = batch();
    const estimated = current.estimatedCosts || {};
    const actualSummary = calculateActualCostSummary({estimatedCosts: estimated, actualCosts: current.actualCosts || {}});
    estimatedSection.hidden = activeTab !== 'estimate';
    const body = activeTab === 'estimate'
      ? estimateMarkup(estimated, current)
      : activeTab === 'actual'
        ? actualFormMarkup(current, estimated, actualSummary) + allocationMarkup(current)
        : comparisonMarkup(estimated, actualSummary);
    const estimatedUplift = upliftPercentage(estimated.total, estimated.goodsValue);
    root.innerHTML = `${settlementStatusMarkup(current)}${summaryMarkup(estimated, actualSummary)}
      <div class="cost-close-tabs" role="tablist" aria-label="${escapeHtml(tx('settlementTabs'))}">${['estimate','actual','comparison'].map(key => `<button type="button" role="tab" aria-selected="${activeTab === key}" class="${activeTab === key ? 'on' : ''}" data-cost-tab="${key}">${escapeHtml(tx(`settlementTab_${key}`))}</button>`).join('')}</div>
      <div class="cost-close-body">${body}</div>
      ${Number.isFinite(estimatedUplift) && activeTab === 'estimate' ? `<p class="settlement-uplift-note">${escapeHtml(tx('settlementEstimatedUplift'))}: <b>${percent(estimatedUplift)}</b></p>` : ''}
      ${message ? `<p class="settlement-message" data-state="${messageState}" role="status">${escapeHtml(message)}</p>` : ''}
      ${current.status === 'settled' ? '' : `<div class="settlement-close-bar"><div><strong>${escapeHtml(tx('settlementCloseTitle'))}</strong><p>${escapeHtml(tx('settlementCloseHint'))}</p></div><button class="btn primary" type="button" data-close-settlement>${escapeHtml(tx('settlementCloseAction'))}</button></div>`}`;
    bindEvents();
  }

  return {render, reset() { activeTab = 'estimate'; latestEstimate = null; message = ''; render(); }};
}
