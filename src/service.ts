import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import {
  IPFSBottle,
  IPFSItem,
  UploadResult,
  IPFSError,
  IPFSErrorCode,
} from "@loscolmebrothers/forever-message-types";

export interface StorachaConfig {
  principalKey: string;
  proof: string;
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
  private principalKey: string;
  private proof: string;

  constructor(config: StorachaConfig) {
    this.principalKey = config.principalKey;
    this.proof = config.proof;
    this.gatewayUrl = config.gatewayUrl || "https://storacha.link/ipfs";
    this.cacheExpirationMs = 5 * 60 * 1000;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const principal = Signer.parse(this.principalKey);
      const store = new StoreMemory();
      this.client = await Client.create({ principal, store });

      const proof = await Proof.parse(this.proof);
      const space = await this.client.addSpace(proof);
      await this.client.setCurrentSpace(space.did());

      this.initialized = true;
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.INIT_FAILED,
        "Failed to initialize Storacha client. Check STORACHA_PRINCIPAL_KEY and STORACHA_PROOF.",
        error instanceof Error ? error : undefined,
      );
    }
  }

  isInitialized(): boolean {
    return this.initialized;
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
      // likeCount removed - Supabase is source of truth for likes
    };

    return this.uploadJSON(bottleData);
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

    if (record.type !== "bottle") {
      throw new IPFSError(
        IPFSErrorCode.PARSE_FAILED,
        'Invalid data: type must be "bottle"',
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
  config: StorachaConfig,
): Promise<IPFSService> {
  const service = new IPFSService(config);
  await service.initialize();
  return service;
}

let defaultInstance: IPFSService | null = null;

export async function getIPFSService(
  config: StorachaConfig,
): Promise<IPFSService> {
  if (!defaultInstance) {
    defaultInstance = await createIPFSService(config);
  }
  return defaultInstance;
}

export function resetIPFSService(): void {
  defaultInstance = null;
}
