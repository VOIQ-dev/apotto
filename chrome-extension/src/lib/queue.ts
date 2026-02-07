/// <reference types="chrome" />

import { openDB, DBSchema, IDBPDatabase } from "idb";

export type QueueStatus = "pending" | "processing" | "completed" | "failed";

export interface QueueItem {
  id: string;
  url: string;
  company: string;
  leadId: string;
  formData: {
    name: string;
    email: string;
    phone?: string;
    company: string;
    message: string;
    [key: string]: string | undefined;
  };
  status: QueueStatus;
  createdAt: string;
  completedAt?: string;
  failedAt?: string;
  error?: string;
  finalUrl?: string;
  retryCount: number;
  // デバッグ情報
  debugLogs?: string;
  debugInfo?: string;
}

interface ApottoQueueDB extends DBSchema {
  queue: {
    key: string;
    value: QueueItem;
    indexes: {
      "by-status": QueueStatus;
      "by-createdAt": string;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: unknown;
    };
  };
}

const DB_NAME = "apotto-queue";
const DB_VERSION = 1;

export class QueueManager {
  private db: IDBPDatabase<ApottoQueueDB> | null = null;

  private async getDB(): Promise<IDBPDatabase<ApottoQueueDB>> {
    if (this.db) return this.db;

    this.db = await openDB<ApottoQueueDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // キューストア
        if (!db.objectStoreNames.contains("queue")) {
          const queueStore = db.createObjectStore("queue", { keyPath: "id" });
          queueStore.createIndex("by-status", "status");
          queueStore.createIndex("by-createdAt", "createdAt");
        }
        // 設定ストア
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      },
    });

    return this.db;
  }

  async addItem(
    item: Omit<QueueItem, "id" | "status" | "createdAt" | "retryCount">,
  ): Promise<QueueItem> {
    const db = await this.getDB();
    const newItem: QueueItem = {
      ...item,
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    await db.put("queue", newItem);
    return newItem;
  }

  async getItem(id: string): Promise<QueueItem | undefined> {
    const db = await this.getDB();
    return db.get("queue", id);
  }

  async getAllItems(): Promise<QueueItem[]> {
    const db = await this.getDB();
    return db.getAll("queue");
  }

  async getItemsByStatus(status: QueueStatus): Promise<QueueItem[]> {
    const db = await this.getDB();
    return db.getAllFromIndex("queue", "by-status", status);
  }

  async getNextPendingItem(): Promise<QueueItem | undefined> {
    const db = await this.getDB();
    const pendingItems = await db.getAllFromIndex(
      "queue",
      "by-status",
      "pending",
    );
    // 作成日時順でソートして最初のものを返す
    pendingItems.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return pendingItems[0];
  }

  /**
   * 次のpendingアイテムを取得し、同時にprocessingに更新する（アトミック操作）
   * 並行処理で同じアイテムを複数回処理しないようにするためのロック機構
   */
  async getAndLockNextPendingItem(): Promise<QueueItem | undefined> {
    const db = await this.getDB();
    const tx = db.transaction("queue", "readwrite");
    const store = tx.objectStore("queue");
    const index = store.index("by-status");

    // pendingアイテムを取得
    const pendingItems = await index.getAll("pending");
    if (pendingItems.length === 0) {
      await tx.done;
      return undefined;
    }

    // 作成日時順でソートして最初のものを取得
    pendingItems.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    const item = pendingItems[0];
    // 即座にprocessingに更新（ロック）
    item.status = "processing";
    await store.put(item);
    await tx.done;

    return item;
  }

  async getProcessingItem(): Promise<QueueItem | undefined> {
    const db = await this.getDB();
    const processingItems = await db.getAllFromIndex(
      "queue",
      "by-status",
      "processing",
    );
    return processingItems[0];
  }

  async updateItemStatus(
    id: string,
    status: QueueStatus,
    additionalData?: Partial<QueueItem>,
  ): Promise<void> {
    const db = await this.getDB();
    const item = await db.get("queue", id);
    if (!item) return;

    const updatedItem: QueueItem = {
      ...item,
      status,
      ...additionalData,
    };

    if (status === "failed") {
      updatedItem.retryCount = (item.retryCount || 0) + 1;
    }

    await db.put("queue", updatedItem);
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDB();
    await db.delete("queue", id);
  }

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    await db.clear("queue");
  }

  async clearCompleted(): Promise<void> {
    const db = await this.getDB();
    const completedItems = await db.getAllFromIndex(
      "queue",
      "by-status",
      "completed",
    );
    const tx = db.transaction("queue", "readwrite");
    await Promise.all([
      ...completedItems.map((item) => tx.store.delete(item.id)),
      tx.done,
    ]);
  }

  // 一時停止/再開機能
  async isPaused(): Promise<boolean> {
    const db = await this.getDB();
    const setting = await db.get("settings", "isPaused");
    return setting?.value === true;
  }

  async pauseProcessing(): Promise<void> {
    const db = await this.getDB();
    await db.put("settings", { key: "isPaused", value: true });
  }

  async resumeProcessing(): Promise<void> {
    const db = await this.getDB();
    await db.put("settings", { key: "isPaused", value: false });
  }

  // 統計情報
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const db = await this.getDB();
    const allItems = await db.getAll("queue");

    return {
      pending: allItems.filter((i) => i.status === "pending").length,
      processing: allItems.filter((i) => i.status === "processing").length,
      completed: allItems.filter((i) => i.status === "completed").length,
      failed: allItems.filter((i) => i.status === "failed").length,
      total: allItems.length,
    };
  }
}
