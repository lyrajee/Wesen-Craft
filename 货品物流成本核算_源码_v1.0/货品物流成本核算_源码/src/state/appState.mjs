import {createBatchRepository} from '../repositories/batchRepository.mjs';

export function createAppState(repository = createBatchRepository()) {
  return {
    repository,
    get activeBatch() {
      return repository.get(repository.getActiveBatchId());
    },
    get batches() {
      return repository.list();
    }
  };
}

