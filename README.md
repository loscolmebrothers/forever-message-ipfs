# Forever Message IPFS Storage

Production-ready IPFS storage service for Forever Message platform using Storacha. This library provides modular, composable components for managing bottle state, contract interactions, IPFS synchronization, and forever status promotion.

## Features

- **Modular Architecture**: Clean separation of concerns with focused modules
- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Production-ready**: Error handling, caching, and validation built-in
- **Simple API**: Easy-to-use methods for uploading and retrieving content
- **Caching**: Built-in content caching to reduce network requests
- **Storacha Integration**: Uses Storacha for reliable IPFS/Filecoin storage
- **Tested**: Comprehensive test suite with unit and integration tests

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

## Architecture

The library is organized into focused, composable modules:

- **`IPFSService`** - Handles IPFS storage operations (upload, retrieve, cache)
- **`StateTracker`** - Manages in-memory bottle state (likes, comments, IPFS hash)
- **`BottleContract`** - Wraps all smart contract interactions
- **`IPFSCountSync`** - Synchronizes counts between state, IPFS, and contract
- **`ForeverManager`** - Manages promotion to "forever" status based on thresholds

## Usage

### IPFS Storage

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

### State Management

```typescript
import { StateTracker } from '@loscolmebrothers/forever-message-ipfs';

const state = new StateTracker();

state.load(1, 'QmHash123', 10, 5);

state.incrementLikes(1);
state.incrementComments(1);

const { likeCount, commentCount } = state.get(1);
```

### Contract Interactions

```typescript
import { BottleContract } from '@loscolmebrothers/forever-message-ipfs';
import { ethers } from 'ethers';

const contract = new BottleContract({
  contractAddress: process.env.CONTRACT_ADDRESS,
  contractABI: YOUR_ABI,
  signer: wallet
});

const bottleId = await contract.createBottle('QmHash123');
await contract.likeBottle(bottleId, userAddress);
await contract.addComment(bottleId, 'QmCommentHash');
```

### IPFS Synchronization

```typescript
import { IPFSCountSync } from '@loscolmebrothers/forever-message-ipfs';

const sync = new IPFSCountSync(ipfsService, state, contract);

await sync.syncBottleCounts(bottleId);
```

### Forever Status Management

```typescript
import { ForeverManager } from '@loscolmebrothers/forever-message-ipfs';

const foreverManager = new ForeverManager(state, contract, {
  likes: 100,
  comments: 4
});

await foreverManager.promote(bottleId);
```

### Complete Example: Composing Modules

```typescript
import {
  createIPFSService,
  StateTracker,
  BottleContract,
  IPFSCountSync,
  ForeverManager
} from '@loscolmebrothers/forever-message-ipfs';
import { ethers } from 'ethers';

const ipfs = await createIPFSService({ spaceDID: process.env.STORACHA_SPACE_DID });
const state = new StateTracker();
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const contract = new BottleContract({
  contractAddress: process.env.CONTRACT_ADDRESS,
  contractABI: YOUR_ABI,
  signer: wallet
});

const ipfsSync = new IPFSCountSync(ipfs, state, contract);
const foreverManager = new ForeverManager(state, contract, { likes: 100, comments: 4 });

const uploadResult = await ipfs.uploadBottle('Hello World!', 'user123');
const bottleId = await contract.createBottle(uploadResult.cid);
state.load(bottleId, uploadResult.cid, 0, 0);

state.incrementLikes(bottleId);
await ipfsSync.syncBottleCounts(bottleId);
await foreverManager.promote(bottleId);
```

## API Reference

### IPFSService

```typescript
await ipfs.initialize()
await ipfs.uploadBottle(message: string, userId: string)
await ipfs.uploadComment(message: string, bottleId: number, userId: string)
await ipfs.updateBottleCounts(originalCid: string, likeCount: number, commentCount: number)
await ipfs.getItem<T>(cid: string)
ipfs.clearCache()
ipfs.isInitialized()
```

### StateTracker

```typescript
state.load(bottleId: number, ipfsHash: string, likeCount: number, commentCount: number)
state.get(bottleId: number)
state.incrementLikes(bottleId: number)
state.decrementLikes(bottleId: number)
state.incrementComments(bottleId: number)
state.updateIPFSHash(bottleId: number, newHash: string)
```

### BottleContract

```typescript
await contract.createBottle(ipfsHash: string)
await contract.likeBottle(bottleId: number, likerAddress: string)
await contract.unlikeBottle(bottleId: number, unlikerAddress: string)
await contract.addComment(bottleId: number, commentIpfsHash: string)
await contract.updateBottleIPFS(bottleId: number, newIpfsHash: string)
await contract.markBottleAsForever(bottleId: number)
await contract.getBottle(bottleId: number)
```

### IPFSCountSync

```typescript
await ipfsSync.syncBottleCounts(bottleId: number)
```

### ForeverManager

```typescript
await foreverManager.promote(bottleId: number)
```

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

## Testing

```bash
yarn test
```

The test suite includes:
- Unit tests for `StateTracker` and `ForeverManager`
- Integration tests for complete workflows
- State isolation tests to prevent cross-bottle contamination

## Error Handling

```typescript
import { IPFSError, IPFSErrorCode } from '@loscolmebrothers/forever-message-ipfs';

try {
  await ipfs.uploadBottle(message, userId);
} catch (error) {
  if (error instanceof IPFSError) {
    console.error(`IPFS Error (${error.code}):`, error.message);
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

## Development

```bash
yarn install
yarn build
yarn test
yarn clean
```

## License

MIT
