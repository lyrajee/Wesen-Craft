import {createBatch, createEmptyBatch, createInitialBatch, duplicateBatch, BATCH_SCHEMA_VERSION} from '../models/batch.mjs';
import {isoNow} from '../models/product.mjs';

export const STORAGE_KEY = 'wesenCraft.importBatches';

export function createMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

export function migrateStoredData(stored, seed = {}) {
  if (stored == null) {
    const batch = createInitialBatch(seed);
    return {schemaVersion: BATCH_SCHEMA_VERSION, batches: [batch], activeBatchId: batch.id};
  }
  if (Array.isArray(stored)) stored = {items: stored};
  if (!stored || typeof stored !== 'object') throw new Error('Stored batch data is not an object');
  const version = Number(stored.schemaVersion || 0);
  if (version > BATCH_SCHEMA_VERSION) throw new Error(`Unsupported storage schema version: ${version}`);

  let batches;
  if (Array.isArray(stored.batches)) {
    batches = stored.batches.map(batch => createBatch(batch));
  } else {
    // v0 migration: the earlier app had no storage; accept legacy snapshots
    // if a user or a future pre-release build left one behind.
    const legacy = createInitialBatch({
      ...seed,
      ...stored,
      items: Array.isArray(stored.items) ? stored.items : seed.items,
      exchangeRates: stored.exchangeRates || seed.exchangeRates,
      declarationSettings: stored.declarationSettings || seed.declarationSettings,
      selectedRoute: stored.selectedRoute || seed.selectedRoute
    });
    batches = [legacy];
  }

  if (!batches.length) batches.push(createEmptyBatch());
  const ids = new Set();
  for (const batch of batches) {
    if (ids.has(batch.id)) batch.id = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    ids.add(batch.id);
  }
  const selected = batches.find(batch => batch.id === stored.activeBatchId && !batch.archivedAt)
    || batches.find(batch => !batch.archivedAt)
    || batches[0];
  return {schemaVersion: BATCH_SCHEMA_VERSION, batches, activeBatchId: selected.id};
}

export function createBatchRepository(storage = {
  getItem: key => globalThis.localStorage.getItem(key),
  setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  removeItem: key => globalThis.localStorage.removeItem(key)
}) {
  let data = null;
  const persist = () => storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const requireInitialized = () => {
    if (!data) throw new Error('BatchRepository has not been initialized');
  };

  return {
    initialize(seed = {}) {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed = raw == null ? null : JSON.parse(raw);
      data = migrateStoredData(parsed, seed);
      if (raw == null || Number(parsed?.schemaVersion || 0) !== BATCH_SCHEMA_VERSION) persist();
      return data;
    },
    list({includeArchived = true} = {}) {
      requireInitialized();
      return includeArchived ? [...data.batches] : data.batches.filter(batch => !batch.archivedAt);
    },
    get(id) {
      requireInitialized();
      return data.batches.find(batch => batch.id === id) || null;
    },
    create(batch) {
      requireInitialized();
      const created = createBatch(batch);
      data.batches.push(created);
      persist();
      return created;
    },
    update(batch) {
      requireInitialized();
      const index = data.batches.findIndex(current => current.id === batch.id);
      if (index < 0) throw new Error('Batch not found');
      batch.updatedAt = isoNow();
      data.batches[index] = createBatch(batch);
      if (data.activeBatchId === batch.id) data.activeBatchId = data.batches[index].id;
      persist();
      return data.batches[index];
    },
    remove(id) {
      requireInitialized();
      const removed = data.batches.find(batch => batch.id === id);
      if (!removed) return null;
      data.batches = data.batches.filter(batch => batch.id !== id);
      if (!data.batches.length) data.batches.push(createEmptyBatch());
      if (data.activeBatchId === id) {
        data.activeBatchId = (data.batches.find(batch => !batch.archivedAt) || data.batches[0]).id;
      }
      persist();
      return removed;
    },
    duplicate(id, name) {
      requireInitialized();
      const source = this.get(id);
      if (!source) throw new Error('Batch not found');
      const copy = duplicateBatch(source, name);
      data.batches.push(copy);
      persist();
      return copy;
    },
    getActiveBatchId() {
      requireInitialized();
      return data.activeBatchId;
    },
    setActiveBatchId(id) {
      requireInitialized();
      if (!data.batches.some(batch => batch.id === id && !batch.archivedAt)) throw new Error('Active batch not found');
      data.activeBatchId = id;
      persist();
      return id;
    },
    get data() { requireInitialized(); return data; }
  };
}

