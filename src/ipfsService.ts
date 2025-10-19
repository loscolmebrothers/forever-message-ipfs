/**
 * Forever Message IPFS Storage Service
 * Production-ready service for storing and retrieving bottle and comment data using Storacha
 */

import * as Client from "@storacha/client";
import {
  BottleContent,
  CommentContent,
  IPFSContent,
  UploadResult,
  StorachaConfig,
  IPFSError,
  IPFSErrorCode,
  CacheEntry,
  IIPFSService,
} from "./types.js";

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  gatewayUrl: "https://storacha.link/ipfs",
  cacheExpirationMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * IPFS Service using Storacha for decentralized storage
 */
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

  /**
   * Initialize the Storacha client
   * Must be called before any upload/download operations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create a new client - Storacha will handle principal generation internally
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

  /**
   * Login to Storacha with email (for space management)
   * This is typically done once to set up the space
   * @param email - Email address to login with
   */
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

  /**
   * Check if the service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the client's DID
   */
  getDID(): string | null {
    if (!this.client) {
      return null;
    }
    return this.client.did();
  }

  /**
   * Upload a bottle message to IPFS
   * @param content - The message text
   * @param userId - The Supabase user ID
   * @returns Upload result with CID and metadata
   */
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

  /**
   * Upload a comment to IPFS
   * @param content - The comment text
   * @param bottleId - The bottle ID from the smart contract
   * @param userId - The Supabase user ID
   * @returns Upload result with CID and metadata
   */
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

  /**
   * Upload JSON data to IPFS using Storacha
   * @param data - The data to upload
   * @returns Upload result with CID and metadata
   */
  private async uploadJSON(data: IPFSContent): Promise<UploadResult> {
    if (!this.client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "Client not initialized",
      );
    }

    try {
      // Convert data to JSON blob
      const jsonString = JSON.stringify(data);
      const blob = new Blob([jsonString], { type: "application/json" });
      const file = new File([blob], "data.json", { type: "application/json" });

      // Upload to Storacha
      const cid = await this.client.uploadFile(file);

      // Calculate size
      const size = new TextEncoder().encode(jsonString).length;

      // Generate gateway URL
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

  /**
   * Retrieve content from IPFS by CID
   * Uses caching to reduce network requests
   * @param cid - The IPFS content identifier
   * @returns The content data
   */
  async getContent<T extends IPFSContent = IPFSContent>(
    cid: string,
  ): Promise<T> {
    this.ensureInitialized();

    // Check cache first
    const cached = this.getFromCache<T>(cid);
    if (cached) {
      return cached;
    }

    try {
      // Fetch from gateway
      const url = `${this.gatewayUrl}/${cid}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T;

      // Validate the data structure
      this.validateContent(data);

      // Store in cache
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

  /**
   * Validate content structure
   * @param data - The data to validate
   */
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

  /**
   * Get content from cache if available and not expired
   * @param cid - The content identifier
   * @returns Cached data or null
   */
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

  /**
   * Store content in cache
   * @param cid - The content identifier
   * @param data - The data to cache
   */
  private storeInCache(cid: string, data: IPFSContent): void {
    const now = Date.now();
    const entry: CacheEntry<IPFSContent> = {
      data,
      timestamp: now,
      expiresAt: now + this.cacheExpirationMs,
    };
    this.cache.set(cid, entry);
  }

  /**
   * Clear all cached content
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Set cache expiration time
   * @param ms - Expiration time in milliseconds
   */
  setCacheExpiration(ms: number): void {
    this.cacheExpirationMs = ms;
  }

  /**
   * Ensure the service is initialized before operations
   * @throws IPFSError if not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "IPFS Service not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Get cache statistics
   */
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

/**
 * Create and initialize an IPFS service instance
 * @param config - Configuration options
 * @returns Initialized IPFS service
 */
export async function createIPFSService(
  config: StorachaConfig = {},
): Promise<IPFSService> {
  const service = new IPFSService(config);
  await service.initialize();
  return service;
}

/**
 * Singleton instance for convenient usage
 */
let defaultInstance: IPFSService | null = null;

/**
 * Get or create the default IPFS service instance
 * @param config - Configuration options (only used on first call)
 * @returns The default IPFS service instance
 */
export async function getIPFSService(
  config: StorachaConfig = {},
): Promise<IPFSService> {
  if (!defaultInstance) {
    defaultInstance = await createIPFSService(config);
  }
  return defaultInstance;
}

/**
 * Reset the default instance (useful for testing)
 */
export function resetIPFSService(): void {
  defaultInstance = null;
}
