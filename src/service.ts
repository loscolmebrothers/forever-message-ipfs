import * as Client from "@storacha/client";
import {
  IPFSBottle,
  IPFSComment,
  IPFSItem,
  UploadResult,
  IPFSError,
  IPFSErrorCode,
} from "@loscolmebrothers/forever-message-types";

export interface StorachaConfig {
  spaceDID?: string;
  gatewayUrl?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface IIPFSService {
  initialize(): Promise<void>;
  uploadBottle(message: string, userId: string): Promise<UploadResult>;
  uploadComment(
    message: string,
    bottleId: number,
    userId: string,
  ): Promise<UploadResult>;
  updateBottleCounts(
    originalCid: string,
    likeCount: number,
    commentCount: number,
  ): Promise<UploadResult>;
  getItem<T extends IPFSItem>(cid: string): Promise<T>;
  isInitialized(): boolean;
  clearCache(): void;
}

export class IPFSService implements IIPFSService {
  private client: Client.Client | null = null;
  private gatewayUrl: string;
  private cache: Map<string, CacheEntry<IPFSItem>> = new Map();
  private cacheExpirationMs: number;
  private initialized: boolean = false;
  private spaceDID?: string;

  constructor(config: StorachaConfig = {}) {
    this.gatewayUrl = config.gatewayUrl || "https://storacha.link/ipfs";
    this.cacheExpirationMs = 5 * 60 * 1000;
    this.spaceDID = config.spaceDID;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.client = await Client.create();

      if (this.spaceDID) {
        await this.client.setCurrentSpace(this.spaceDID as `did:key:${string}`);
      }

      this.initialized = true;
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.INIT_FAILED,
        "Failed to initialize Storacha client",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async login(email: string): Promise<void> {
    try {
      this.ensureInitialized();
      await this.client!.login(email as `${string}@${string}`);
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.SPACE_REGISTRATION_FAILED,
        `Failed to login with email: ${email}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getDID(): string | null {
    this.ensureInitialized();

    return this.client!.did();
  }

  async uploadBottle(message: string, userId: string): Promise<UploadResult> {
    this.ensureInitialized();

    const timestamp = Math.floor(Date.now() / 1000);
    const bottleData: IPFSBottle = {
      message,
      type: "bottle",
      userId,
      timestamp,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      commentCount: 0,
    };

    return this.uploadJSON(bottleData);
  }

  async updateBottleCounts(
    originalCid: string,
    likeCount: number,
    commentCount: number,
  ): Promise<UploadResult> {
    this.ensureInitialized();

    const originalBottle = await this.getItem<IPFSBottle>(originalCid);

    if (originalBottle.type !== "bottle") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        "CID does not point to a bottle",
      );
    }

    const updatedBottle: IPFSBottle = {
      ...originalBottle,
      likeCount,
      commentCount,
    };

    this.cache.delete(originalCid);
    return this.uploadJSON(updatedBottle);
  }

  async uploadComment(
    message: string,
    bottleId: number,
    userId: string,
  ): Promise<UploadResult> {
    this.ensureInitialized();

    const timestamp = Math.floor(Date.now() / 1000);
    const commentData: IPFSComment = {
      message,
      type: "comment",
      bottleId,
      userId,
      timestamp,
      createdAt: new Date().toISOString(),
    };

    return this.uploadJSON(commentData);
  }

  private async uploadJSON(data: IPFSItem): Promise<UploadResult> {
    this.ensureInitialized();

    try {
      const jsonString = JSON.stringify(data);
      const blob = new Blob([jsonString], { type: "application/json" });
      const file = new File([blob], "data.json", { type: "application/json" });

      const cid = await this.client!.uploadFile(file);
      const size = new TextEncoder().encode(jsonString).length;
      const url = `${this.gatewayUrl}/${cid}`;

      return {
        cid: cid.toString(),
        size,
        url,
      };
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.UPLOAD_FAILED,
        "Failed to upload data to IPFS",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getItem<T extends IPFSItem = IPFSItem>(cid: string): Promise<T> {
    this.ensureInitialized();

    const cached = this.getFromCache<T>(cid);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.gatewayUrl}/${cid}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T;

      this.validateItem(data);
      this.storeInCache(cid, data);

      return data;
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.FETCH_FAILED,
        `Failed to fetch data from IPFS: ${cid}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  private validateItem(data: unknown): asserts data is IPFSItem {
    if (!data || typeof data !== "object") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        "Invalid data: not an object",
      );
    }

    const record = data as Record<string, unknown>;

    if (typeof record.message !== "string") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: missing or invalid "message" field',
      );
    }

    if (record.type !== "bottle" && record.type !== "comment") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: type must be "bottle" or "comment"',
      );
    }

    if (typeof record.userId !== "string") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: missing or invalid "userId" field',
      );
    }

    if (typeof record.timestamp !== "number") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: missing or invalid "timestamp" field',
      );
    }

    if (record.type === "comment" && typeof record.bottleId !== "number") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: comment missing "bottleId" field',
      );
    }
  }

  private getFromCache<T extends IPFSItem>(cid: string): T | null {
    const entry = this.cache.get(cid);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(cid);
      return null;
    }

    return entry.data as T;
  }

  private storeInCache(cid: string, data: IPFSItem): void {
    const now = Date.now();
    const entry: CacheEntry<IPFSItem> = {
      data,
      timestamp: now,
      expiresAt: now + this.cacheExpirationMs,
    };
    this.cache.set(cid, entry);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "IPFS Service not initialized. Call initialize() first.",
      );
    }
  }
}

export async function createIPFSService(
  config: StorachaConfig = {},
): Promise<IPFSService> {
  const service = new IPFSService(config);
  await service.initialize();
  return service;
}

let defaultInstance: IPFSService | null = null;

export async function getIPFSService(
  config: StorachaConfig = {},
): Promise<IPFSService> {
  if (!defaultInstance) {
    defaultInstance = await createIPFSService(config);
  }
  return defaultInstance;
}

export function resetIPFSService(): void {
  defaultInstance = null;
}
