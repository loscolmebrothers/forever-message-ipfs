# Forever Message - IPFS Storage & Contract Integration

IPFS storage service and smart contract integration for Forever Message platform. Provides modular components for managing bottle state, IPFS synchronization, and contract interactions using Storacha.

## Overview

This package provides the bridge between decentralized storage (IPFS) and blockchain (smart contract):
- **IPFSService**: Upload/retrieve content from IPFS via Storacha
- **StateTracker**: Manage in-memory bottle state (likes, comments, IPFS hash)
- **BottleContract**: Type-safe wrapper for all smart contract interactions
- **IPFSCountSync**: Synchronize engagement counts between state, IPFS, and contract

## Architecture

### Why IPFS + Smart Contract?

**Gas Optimization Strategy:**
- Store expensive data (messages, metadata) in IPFS → cheap
- Store only critical references (hashes, timestamps) on-chain → expensive
- Result: ~10x cheaper than storing everything on-chain

**Forever Promotion Flow:**
1. User likes/comments → update IPFS counts
2. Backend calls `checkIsForever(bottleId, likeCount, commentCount)`
3. Contract checks thresholds (100 likes + 4 comments)
4. Contract promotes to forever if eligible
5. Backend is ignorant of thresholds (contract = source of truth)

## Installation

```bash
yarn install
```

## Building

```bash
# Build once
yarn build

# Build and watch for changes
yarn dev

# Run tests
yarn test

# Clean build artifacts
yarn clean
```

## Usage

### 1. IPFS Service - Upload & Retrieve Content

```typescript
import { createIPFSService } from '@loscolmebrothers/forever-message-ipfs';

const ipfs = await createIPFSService({
  spaceDID: process.env.STORACHA_SPACE_DID,
  gatewayUrl: 'https://storacha.link/ipfs'
});

const result = await ipfs.uploadBottle('Hello World!', 'user123');
console.log('CID:', result.cid);

const bottle = await ipfs.getItem(result.cid);
console.log('Message:', bottle.message);
```

### 2. State Tracker - Manage Bottle State

```typescript
import { StateTracker } from '@loscolmebrothers/forever-message-ipfs';

const state = new StateTracker();

state.load(1, 'QmHash123', 10, 5);

state.incrementLikes(1);
state.incrementComments(1);

const { likeCount, commentCount } = state.get(1);
console.log(`Bottle 1: ${likeCount} likes, ${commentCount} comments`);
```

### 3. Contract Wrapper - Interact with Blockchain

```typescript
import { BottleContract } from '@loscolmebrothers/forever-message-ipfs';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const contract = new BottleContract({
  contractAddress: process.env.CONTRACT_ADDRESS,
  contractABI: YOUR_ABI,
  signer: wallet
});

const bottleId = await contract.createBottle('QmHash123', userAddress);
await contract.likeBottle(bottleId, likerAddress);
await contract.addComment(bottleId, 'QmCommentHash', commenterAddress);

await contract.checkIsForever(bottleId, 100, 4);
```

### 4. IPFS Count Sync - Keep Everything in Sync

```typescript
import { IPFSCountSync } from '@loscolmebrothers/forever-message-ipfs';

const sync = new IPFSCountSync(ipfsService, state, contract);

state.incrementLikes(bottleId);

await sync.syncBottleCounts(bottleId);
```

### Complete Example: Full Flow

```typescript
import {
  createIPFSService,
  StateTracker,
  BottleContract,
  IPFSCountSync
} from '@loscolmebrothers/forever-message-ipfs';
import { ethers } from 'ethers';

const ipfs = await createIPFSService({ 
  spaceDID: process.env.STORACHA_SPACE_DID 
});
const state = new StateTracker();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const contract = new BottleContract({
  contractAddress: process.env.CONTRACT_ADDRESS,
  contractABI: YOUR_ABI,
  signer: wallet
});

const ipfsSync = new IPFSCountSync(ipfs, state, contract);

const userAddress = '0x1234...';

const uploadResult = await ipfs.uploadBottle('Hello World!', 'user123');
const bottleId = await contract.createBottle(uploadResult.cid, userAddress);

state.load(bottleId, uploadResult.cid, 0, 0);

state.incrementLikes(bottleId);
await ipfsSync.syncBottleCounts(bottleId);

await contract.checkIsForever(
  bottleId, 
  state.get(bottleId).likeCount,
  state.get(bottleId).commentCount
);
```

## API Reference

### IPFSService

#### Methods

```typescript
await ipfs.initialize()
// Initialize Storacha client

await ipfs.uploadBottle(message: string, userId: string): Promise<UploadResult>
// Upload bottle content to IPFS

await ipfs.uploadComment(message: string, bottleId: number, userId: string): Promise<UploadResult>
// Upload comment content to IPFS

await ipfs.updateBottleCounts(originalCid: string, likeCount: number, commentCount: number): Promise<UploadResult>
// Update bottle with new engagement counts (creates new CID)

await ipfs.getItem<T>(cid: string): Promise<T>
// Retrieve and validate content from IPFS

ipfs.clearCache()
// Clear in-memory cache

ipfs.isInitialized(): boolean
// Check if service is ready
```

### StateTracker

#### Methods

```typescript
state.load(bottleId: number, ipfsHash: string, likeCount: number, commentCount: number): void
// Load bottle state into memory

state.get(bottleId: number): BottleState
// Get current bottle state (throws if not loaded)

state.incrementLikes(bottleId: number): void
// Increment like count

state.decrementLikes(bottleId: number): void
// Decrement like count (min 0)

state.incrementComments(bottleId: number): void
// Increment comment count

state.updateIPFSHash(bottleId: number, newHash: string): void
// Update IPFS hash after sync
```

### BottleContract

#### Methods

```typescript
await contract.createBottle(ipfsHash: string, creator: string): Promise<number>
// Create bottle on-chain with user as creator

await contract.likeBottle(bottleId: number, liker: string): Promise<void>
// Record like from user

await contract.unlikeBottle(bottleId: number, unliker: string): Promise<void>
// Remove like from user

await contract.addComment(bottleId: number, ipfsHash: string, commenter: string): Promise<number>
// Add comment from user

await contract.updateBottleIPFS(bottleId: number, newHash: string): Promise<void>
// Update bottle IPFS hash (for count sync)

await contract.checkIsForever(bottleId: number, likeCount: number, commentCount: number): Promise<void>
// Check if bottle meets forever thresholds

await contract.getBottle(bottleId: number): Promise<ContractBottle>
// Retrieve bottle data from chain

await contract.getComment(commentId: number): Promise<ContractComment>
// Retrieve comment data from chain

await contract.getBottleComments(bottleId: number): Promise<number[]>
// Get all comment IDs for a bottle

await contract.isBottleExpired(bottleId: number): Promise<boolean>
// Check if bottle has expired

await contract.hasUserLikedBottle(bottleId: number, user: string): Promise<boolean>
// Check if user has liked bottle
```

### IPFSCountSync

#### Methods

```typescript
await ipfsSync.syncBottleCounts(bottleId: number): Promise<void>
// Sync state counts to IPFS and update contract hash
```

**What it does:**
1. Gets current counts from StateTracker
2. Gets original IPFS hash from StateTracker
3. Creates new IPFS entry with updated counts
4. Updates contract with new IPFS hash
5. Updates StateTracker with new hash

## Data Structures

### IPFSBottle

```typescript
{
  message: string;
  type: 'bottle';
  userId: string;
  timestamp: number;
  createdAt: string;
  likeCount: number;
  commentCount: number;
}
```

### IPFSComment

```typescript
{
  message: string;
  type: 'comment';
  bottleId: number;
  userId: string;
  timestamp: number;
  createdAt: string;
}
```

### BottleState

```typescript
{
  likeCount: number;
  commentCount: number;
  currentIpfsHash: string;
}
```

### UploadResult

```typescript
{
  cid: string;    // IPFS content identifier
  size: number;   // Size in bytes
  url: string;    // Gateway URL
}
```

## Testing

```bash
yarn test
```

### Test Coverage

**19 tests total:**

#### Integration Tests (8)
- Full bottle creation workflow
- Like → sync → check forever workflow
- Comment → sync → check forever workflow
- CheckIsForever called even when thresholds not met
- Multiple users creating bottles
- Multiple users commenting on same bottle
- Full forever promotion flow with multiple users
- Creator/commenter address verification

#### StateTracker Tests (11)
- Load bottle state
- Get bottle state
- Throw when bottle not loaded
- Increment likes
- Decrement likes
- Don't go below zero
- Increment comments
- Update IPFS hash
- Complete isolation between bottles
- No cross-contamination when loading same bottle twice

## Error Handling

```typescript
import { IPFSError, IPFSErrorCode } from '@loscolmebrothers/forever-message-ipfs';

try {
  await ipfs.uploadBottle(message, userId);
} catch (error) {
  if (error instanceof IPFSError) {
    console.error(`IPFS Error (${error.code}):`, error.message);
    
    switch (error.code) {
      case IPFSErrorCode.INIT_FAILED:
        // Handle initialization failure
        break;
      case IPFSErrorCode.UPLOAD_FAILED:
        // Handle upload failure
        break;
      case IPFSErrorCode.FETCH_FAILED:
        // Handle fetch failure
        break;
    }
  }
}
```

### Error Codes

- `INIT_FAILED` - Client initialization failed
- `UPLOAD_FAILED` - Upload operation failed
- `FETCH_FAILED` - Content retrieval failed
- `PARSE_FAILED` - Content parsing/validation failed
- `NOT_INITIALIZED` - Service not initialized
- `SPACE_REGISTRATION_FAILED` - Space registration failed

## Architecture Patterns

### Separation of Concerns

Each module has a single responsibility:

| Module | Responsibility | State |
|--------|---------------|-------|
| IPFSService | IPFS operations | Stateless (cache only) |
| StateTracker | In-memory state | Stateful |
| BottleContract | Blockchain ops | Stateless |
| IPFSCountSync | Coordination | Stateless |

### Composition over Inheritance

Modules are designed to be composed:

```typescript
const ipfs = createIPFSService(config);
const state = new StateTracker();
const contract = new BottleContract(config);

const sync = new IPFSCountSync(ipfs, state, contract);
```

### Immutability in IPFS

IPFS content is immutable. To "update" counts:
1. Create new IPFS entry with updated data → new CID
2. Update contract with new CID
3. Old CID remains accessible (versioning)

## Development

```bash
yarn install
yarn build
yarn test
yarn clean
```

## File Structure

```
forever-message-ipfs/
├── src/
│   ├── ipfs-service.ts       # IPFS upload/retrieval
│   ├── state-tracker.ts      # In-memory state management
│   ├── bottle-contract.ts    # Smart contract wrapper
│   ├── ipfs-count-sync.ts    # Sync coordinator
│   └── index.ts              # Package exports
├── test/
│   ├── integration.test.ts   # Integration & multi-user tests
│   └── state-tracker.test.ts # State tracker unit tests
├── dist/                     # Compiled output (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

- `@loscolmebrothers/forever-message-types` - Shared type definitions
- `@storacha/client` - IPFS/Filecoin storage via Storacha
- `ethers` - Ethereum interaction library

## License

MIT
