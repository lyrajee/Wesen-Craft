import {BATCH_STATUSES, createNextBatchNo} from '../models/batch.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const localeFor = lang => lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja-JP' : 'en-US';

export function mountBatchManager({state, translate, getLang, onActivate, onMutation, onError}) {
  const repository = state.repository;
  const picker = document.querySelector('#activeBatchSelect');
  const dialog = document.querySelector('#batchManagerDialog');
  const tableBody = document.querySelector('#batchManagerRows');
  const createForm = document.querySelector('#batchCreateForm');

  const statusLabel = value => translate(`batchStatus_${value}`);
  const batchGoodsJpy = batch => batch.items.reduce((sum, item) => sum + item.qty * item.price, 0);

  function renderSwitcher() {
    const activeId = repository.getActiveBatchId();
    const visible = repository.list({includeArchived: false});
    picker.innerHTML = visible.map(batch => `<option value="${escapeHtml(batch.id)}">${escapeHtml(batch.name || batch.batchNo || translate('unnamedBatch'))}</option>`).join('');
    picker.value = activeId;
    picker.setAttribute('aria-label', translate('activeBatchLabel'));
  }

  function renderTable() {
    const batches = repository.list().slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    tableBody.innerHTML = batches.map(batch => {
      const archived = Boolean(batch.archivedAt);
      const statusOptions = BATCH_STATUSES.map(status => `<option value="${status}"${batch.status === status ? ' selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('');
      return `<tr data-batch-id="${escapeHtml(batch.id)}">
        <td><strong>${escapeHtml(batch.name || translate('unnamedBatch'))}</strong></td>
        <td>${escapeHtml(batch.batchNo)}</td>
        <td>${escapeHtml(batch.supplier)}</td>
        <td>${archived ? escapeHtml(translate('batchArchived')) : `<select data-batch-status aria-label="${escapeHtml(translate('batchStatusLabel'))}">${statusOptions}</select>`}</td>
        <td class="batch-number">${batch.items.length}</td>
        <td class="batch-number">¥${batchGoodsJpy(batch).toLocaleString(localeFor(getLang()))}</td>
        <td>${new Date(batch.updatedAt).toLocaleDateString(localeFor(getLang()))}</td>
        <td class="batch-actions">
          ${archived ? `<button type="button" class="btn secondary" data-action="restore">${escapeHtml(translate('batchRestore'))}</button>` : `
            <button type="button" class="btn secondary" data-action="switch">${escapeHtml(translate('batchOpen'))}</button>
            <button type="button" class="btn secondary" data-action="rename">${escapeHtml(translate('batchRename'))}</button>
            <button type="button" class="btn secondary" data-action="duplicate">${escapeHtml(translate('batchDuplicate'))}</button>
            <button type="button" class="btn secondary" data-action="archive">${escapeHtml(translate('batchArchive'))}</button>`}
          <button type="button" class="btn secondary" data-action="delete">${escapeHtml(translate('batchDelete'))}</button>
        </td>
      </tr>`;
    }).join('');
  }

  function rerender({recalculate = true} = {}) {
    renderSwitcher();
    renderTable();
    if (recalculate) onMutation();
  }

  function ensureActive() {
    const active = repository.get(repository.getActiveBatchId());
    if (active && !active.archivedAt) return;
    const next = repository.list({includeArchived: false})[0] || repository.create({name: translate('newBatch'), batchNo: createNextBatchNo(repository.list())});
    repository.setActiveBatchId(next.id);
    onActivate(next.id);
  }

  picker.addEventListener('change', () => {
    try {
      repository.setActiveBatchId(picker.value);
      onActivate(picker.value);
      rerender();
    } catch (error) { onError(error); }
  });

  document.querySelector('#openBatchManager').addEventListener('click', () => {
    renderTable();
    dialog.showModal();
  });
  document.querySelector('#closeBatchManager').addEventListener('click', () => dialog.close());
  document.querySelector('#quickNewBatch').addEventListener('click', () => {
    dialog.showModal();
    createForm.reset();
    createForm.elements.batchName.focus();
  });

  createForm.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(createForm);
    const name = String(form.get('batchName') || '').trim();
    if (!name) { createForm.elements.batchName.focus(); return; }
    try {
      const created = repository.create({
        name,
        batchNo: String(form.get('batchNo') || '').trim() || createNextBatchNo(repository.list()),
        supplier: String(form.get('supplier') || '').trim(),
        purchaseDate: String(form.get('purchaseDate') || ''),
        originCountry: String(form.get('originCountry') || 'Japan').trim(),
        originPort: String(form.get('originPort') || '').trim(),
        destinationCountry: String(form.get('destinationCountry') || 'China').trim(),
        destinationPort: String(form.get('destinationPort') || 'Shanghai').trim(),
        status: String(form.get('status') || 'draft'),
        exchangeRates: state.activeBatch.exchangeRates,
        declarationSettings: state.activeBatch.declarationSettings,
        selectedRoute: state.activeBatch.selectedRoute
      });
      repository.setActiveBatchId(created.id);
      createForm.reset();
      onActivate(created.id);
      rerender();
    } catch (error) { onError(error); }
  });

  tableBody.addEventListener('change', event => {
    const row = event.target.closest('[data-batch-id]');
    if (!row || !event.target.matches('[data-batch-status]')) return;
    const batch = repository.get(row.dataset.batchId);
    if (!batch) return;
    batch.status = event.target.value;
    try { repository.update(batch); rerender(); }
    catch (error) { onError(error); }
  });

  tableBody.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    const row = button?.closest('[data-batch-id]');
    if (!button || !row) return;
    const batch = repository.get(row.dataset.batchId);
    if (!batch) return;
    try {
      switch (button.dataset.action) {
        case 'switch':
          repository.setActiveBatchId(batch.id);
          onActivate(batch.id);
          break;
        case 'rename': {
          const nextName = window.prompt(translate('batchRenamePrompt'), batch.name);
          if (nextName == null || !nextName.trim()) return;
          batch.name = nextName.trim();
          repository.update(batch);
          break;
        }
        case 'duplicate': {
          const nextName = window.prompt(translate('batchDuplicatePrompt'), `${batch.name} ${translate('batchCopySuffix')}`);
          if (nextName == null || !nextName.trim()) return;
          const copy = repository.duplicate(batch.id, nextName.trim());
          repository.setActiveBatchId(copy.id);
          onActivate(copy.id);
          break;
        }
        case 'archive':
          batch.archivedAt = new Date().toISOString();
          repository.update(batch);
          ensureActive();
          break;
        case 'restore':
          batch.archivedAt = null;
          repository.update(batch);
          break;
        case 'delete':
          if (!window.confirm(translate('batchDeleteConfirm').replace('{name}', batch.name))) return;
          repository.remove(batch.id);
          ensureActive();
          break;
      }
      rerender();
    } catch (error) { onError(error); }
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  return {render: () => rerender({recalculate: false}), open: () => {renderTable(); dialog.showModal();}};
}
