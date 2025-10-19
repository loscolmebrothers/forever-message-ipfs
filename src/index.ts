/**
 * Forever Message IPFS Storage
 * Main entry point for the IPFS storage service
 */

export {
  IPFSService,
  createIPFSService,
  getIPFSService,
  resetIPFSService,
} from "./ipfsService.js";

export {
  BottleContent,
  CommentContent,
  IPFSContent,
  UploadResult,
  StorachaConfig,
  IPFSError,
  IPFSErrorCode,
  IIPFSService,
  CacheEntry,
} from "./types.js";
