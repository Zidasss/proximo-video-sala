const DATABASE_NAME = "klipapp-editor-recovery";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const ASSET_STORE = "assets";
const CURRENT_PROJECT_ID = "current-editor-project";

export type EditorRecoveryAsset = {
  id: string;
  blob: Blob;
  name?: string;
};

export type EditorRecoveryRecord<T = unknown> = {
  id: string;
  version: number;
  savedAt: number;
  project: T;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openRecoveryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE))
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(ASSET_STORE))
        database.createObjectStore(ASSET_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveEditorRecovery<T>(
  project: T,
  assets: EditorRecoveryAsset[],
) {
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(
      [PROJECT_STORE, ASSET_STORE],
      "readwrite",
    );
    const assetStore = transaction.objectStore(ASSET_STORE);
    assets.forEach((asset) => assetStore.put(asset));
    transaction.objectStore(PROJECT_STORE).put({
      id: CURRENT_PROJECT_ID,
      version: 1,
      savedAt: Date.now(),
      project,
    } satisfies EditorRecoveryRecord<T>);
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
}

export async function loadEditorRecovery<T>() {
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(PROJECT_STORE, "readonly");
    const result = await requestResult(
      transaction.objectStore(PROJECT_STORE).get(CURRENT_PROJECT_ID),
    );
    return (result || null) as EditorRecoveryRecord<T> | null;
  } finally {
    database.close();
  }
}

export async function loadEditorRecoveryAsset(id: string) {
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, "readonly");
    const result = await requestResult(transaction.objectStore(ASSET_STORE).get(id));
    return (result || null) as EditorRecoveryAsset | null;
  } finally {
    database.close();
  }
}

export async function clearEditorRecovery() {
  const database = await openRecoveryDatabase();
  try {
    const transaction = database.transaction(
      [PROJECT_STORE, ASSET_STORE],
      "readwrite",
    );
    transaction.objectStore(PROJECT_STORE).delete(CURRENT_PROJECT_ID);
    transaction.objectStore(ASSET_STORE).clear();
    await transactionFinished(transaction);
  } finally {
    database.close();
  }
}

