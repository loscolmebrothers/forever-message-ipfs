import * as Client from "@storacha/client";
import {
  BottleContent,
  CommentContent,
  IPFSContent,
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
  uploadBottle(content: string, userId: string): Promise<UploadResult>;
  uploadComment(
    content: string,
    bottleId: number,
    userId: string,
  ): Promise<UploadResult>;
  getContent<T extends IPFSContent>(cid: string): Promise<T>;
  isInitialized(): boolean;
  clearCache(): void;
}

const DEFAULT_CONFIG = {
  gatewayUrl: "https://storacha.link/ipfs",
  cacheExpirationMs: 5 * 60 * 1000,
};

export class IPFSService implements IIPFSService {
  private client: Client.Client | null = null;
  private gatewayUrl: string;
  private cache: Map<string, CacheEntry<IPFSContent>> = new Map();
  private cacheExpirationMs: number;
  private initialized: boolean = false;

  constructor(config: StorachaConfig = {}) {
    this.gatewayUrl = config.gatewayUrl || DEFAULT_CONFIG.gatewayUrl;
    this.cacheExpirationMs = DEFAULT_CONFIG.cacheExpirationMs;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.client = await Client.create();
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
    this.ensureInitialized();

    try {
      if (!this.client) {
        throw new Error("Client not initialized");
      }
      await this.client.login(email as `${string}@${string}`);
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
    if (!this.client) {
      return null;
    }
    return this.client.did();
  }

  async uploadBottle(content: string, userId: string): Promise<UploadResult> {
    this.ensureInitialized();

    const timestamp = Math.floor(Date.now() / 1000);
    const bottleData: BottleContent = {
      content,
      type: "bottle",
      userId,
      timestamp,
      createdAt: new Date().toISOString(),
    };

    return this.uploadJSON(bottleData);
  }

  async uploadComment(
    content: string,
    bottleId: number,
    userId: string,
  ): Promise<UploadResult> {
    this.ensureInitialized();

    const timestamp = Math.floor(Date.now() / 1000);
    const commentData: CommentContent = {
      content,
      type: "comment",
      bottleId,
      userId,
      timestamp,
      createdAt: new Date().toISOString(),
    };

    return this.uploadJSON(commentData);
  }

  private async uploadJSON(data: IPFSContent): Promise<UploadResult> {
    if (!this.client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "Client not initialized",
      );
    }

    try {
      const jsonString = JSON.stringify(data);
      const blob = new Blob([jsonString], { type: "application/json" });
      const file = new File([blob], "data.json", { type: "application/json" });

      const cid = await this.client.uploadFile(file);
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
        "Failed to upload content to IPFS",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getContent<T extends IPFSContent = IPFSContent>(
    cid: string,
  ): Promise<T> {
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

      this.validateContent(data);
      this.storeInCache(cid, data);

      return data;
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.FETCH_FAILED,
        `Failed to fetch content from IPFS: ${cid}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  private validateContent(data: unknown): asserts data is IPFSContent {
    if (!data || typeof data !== "object") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        "Invalid content: not an object",
      );
    }

    const content = data as Record<string, unknown>;

    if (typeof content.content !== "string") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid content: missing or invalid "content" field',
      );
    }

    if (content.type !== "bottle" && content.type !== "comment") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid content: type must be "bottle" or "comment"',
      );
    }

    if (typeof content.userId !== "string") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid content: missing or invalid "userId" field',
      );
    }

    if (typeof content.timestamp !== "number") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid content: missing or invalid "timestamp" field',
      );
    }

    if (content.type === "comment" && typeof content.bottleId !== "number") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid content: comment missing "bottleId" field',
      );
    }
  }

  private getFromCache<T extends IPFSContent>(cid: string): T | null {
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

  private storeInCache(cid: string, data: IPFSContent): void {
    const now = Date.now();
    const entry: CacheEntry<IPFSContent> = {
      data,
      timestamp: now,
      expiresAt: now + this.cacheExpirationMs,
    };
    this.cache.set(cid, entry);
  }

  clearCache(): void {
    this.cache.clear();
  }

  setCacheExpiration(ms: number): void {
    this.cacheExpirationMs = ms;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "IPFS Service not initialized. Call initialize() first.",
      );
    }
  }

  getCacheStats(): { size: number; entries: number } {
    let totalSize = 0;
    this.cache.forEach((entry) => {
      totalSize += JSON.stringify(entry.data).length;
    });

    return {
      size: totalSize,
      entries: this.cache.size,
    };
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
