/**
 * Type definitions for Forever Message IPFS Storage
 */

/**
 * Base content structure for bottles
 */
export interface BottleContent {
  content: string;
  type: 'bottle';
  userId: string;
  timestamp: number;
  createdAt: string;
}

/**
 * Base content structure for comments
 */
export interface CommentContent {
  content: string;
  type: 'comment';
  bottleId: number;
  userId: string;
  timestamp: number;
  createdAt: string;
}

/**
 * Union type for all IPFS content types
 */
export type IPFSContent = BottleContent | CommentContent;

/**
 * Result from uploading content to IPFS
 */
export interface UploadResult {
  cid: string;
  size: number;
  url: string;
}

/**
 * Configuration for Storacha client
 */
export interface StorachaConfig {
  spaceDID?: string;
  gatewayUrl?: string;
}

/**
 * Custom error type for IPFS operations
 */
export class IPFSError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'IPFSError';
  }
}

/**
 * Error codes for IPFS operations
 */
export enum IPFSErrorCode {
  INIT_FAILED = 'INIT_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  FETCH_FAILED = 'FETCH_FAILED',
  INVALID_CID = 'INVALID_CID',
  PARSE_FAILED = 'PARSE_FAILED',
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  SPACE_REGISTRATION_FAILED = 'SPACE_REGISTRATION_FAILED',
}

/**
 * Cache entry structure
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * IPFS Service interface
 */
export interface IIPFSService {
  initialize(): Promise<void>;
  uploadBottle(content: string, userId: string): Promise<UploadResult>;
  uploadComment(content: string, bottleId: number, userId: string): Promise<UploadResult>;
  getContent<T extends IPFSContent>(cid: string): Promise<T>;
  isInitialized(): boolean;
  clearCache(): void;
}
