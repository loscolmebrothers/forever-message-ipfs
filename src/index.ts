export {
  IPFSService,
  createIPFSService,
  getIPFSService,
  resetIPFSService,
  StorachaConfig,
  IIPFSService,
  CacheEntry,
} from "./ipfsService";

// Re-export types from shared package
export {
  BottleContent,
  CommentContent,
  IPFSContent,
  UploadResult,
  IPFSError,
  IPFSErrorCode,
} from "@loscolmebrothers/forever-message-types";
