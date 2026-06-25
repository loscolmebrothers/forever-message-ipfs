import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  IPFSBottle,
  IPFSItem,
  UploadResult,
  IPFSError,
  IPFSErrorCode,
} from "@loscolmebrothers/forever-message-types";

export interface FilebaseConfig {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
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
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucketName: string;
  private gatewayUrl: string;
  private s3Client: S3Client | null = null;
  private cache: Map<string, CacheEntry<IPFSItem>> = new Map();
  private cacheExpirationMs: number;
  private initialized: boolean = false;

  constructor(config: FilebaseConfig) {
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.bucketName = config.bucketName;
    this.gatewayUrl =
      config.gatewayUrl ||
      `https://${config.bucketName}.ipfs.filebase.io`;
    this.cacheExpirationMs = 5 * 60 * 1000;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Validate credentials
      if (
        !this.accessKeyId ||
        !this.secretAccessKey ||
        !this.bucketName
      ) {
        throw new Error(
          "Missing Filebase credentials. Provide accessKeyId, secretAccessKey, and bucketName."
        );
      }

      // Initialize S3 client pointing to Filebase
      this.s3Client = new S3Client({
        endpoint: "https://s3.filebase.io",
        region: "us-east-1",
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
        forcePathStyle: true, // Required for Filebase
      });

      this.initialized = true;
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.INIT_FAILED,
        "Failed to initialize Filebase client. Check your credentials.",
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
    };

    return this.uploadJSON(bottleData);
  }

  private async uploadJSON(data: IPFSItem): Promise<UploadResult> {
    this.ensureInitialized();

    if (!this.s3Client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "Filebase client not initialized"
      );
    }

    try {
      const jsonString = JSON.stringify(data);
      const key = this.generateKey();

      // Upload to Filebase using S3 API
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: jsonString,
        ContentType: "application/json",
        Metadata: {
          type: "forever-message-bottle",
        },
      });

      await this.s3Client.send(command);

      // Filebase returns CID in the response for IPFS buckets
      // For non-IPFS buckets, we'll use the key as the identifier
      // The CID would be in the response if this is an IPFS bucket
      const cid = key; // Will be replaced with actual CID if available
      const size = new TextEncoder().encode(jsonString).length;
      const url = `${this.gatewayUrl}/${cid}`;

      return {
        cid,
        size,
        url,
      };
    } catch (error) {
      throw new IPFSError(
        IPFSErrorCode.UPLOAD_FAILED,
        "Failed to upload data to Filebase",
        error instanceof Error ? error : undefined,
      );
    }
  }

  private generateKey(): string {
    // Generate a unique key using timestamp and random string
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `bottle-${timestamp}-${random}`;
  }

  async getItem<T extends IPFSItem = IPFSItem>(cid: string): Promise<T> {
    this.ensureInitialized();

    const cached = this.getFromCache<T>(cid);
    if (cached) {
      return cached;
    }

    if (!this.s3Client) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "Filebase client not initialized"
      );
    }

    try {
      // Fetch from Filebase gateway
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
        `Failed to fetch data from Filebase: ${cid}`,
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
    if (!this.initialized) {
      throw new IPFSError(
        IPFSErrorCode.NOT_INITIALIZED,
        "IPFS Service not initialized. Call initialize() first.",
      );
    }
  }
}

export async function createIPFSService(
  config: FilebaseConfig,
): Promise<IPFSService> {
  const service = new IPFSService(config);
  await service.initialize();
  return service;
}

let defaultInstance: IPFSService | null = null;

export async function getIPFSService(
  config: FilebaseConfig,
): Promise<IPFSService> {
  if (!defaultInstance) {
    defaultInstance = await createIPFSService(config);
  }
  return defaultInstance;
}

export function resetIPFSService(): void {
  defaultInstance = null;
}