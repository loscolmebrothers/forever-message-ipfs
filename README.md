# Forever Message IPFS Storage

Production-ready IPFS storage service for Forever Message platform using Storacha. This library handles storing and retrieving bottle messages and comments on IPFS/Filecoin via Storacha (formerly web3.storage).

## Features

- **Type-safe**: Full TypeScript support with comprehensive type definitions
- **Production-ready**: Error handling, caching, and validation built-in
- **Simple API**: Easy-to-use methods for uploading and retrieving content
- **Caching**: Built-in content caching to reduce network requests
- **Storacha Integration**: Uses Storacha for reliable IPFS/Filecoin storage

## Installation

```bash
yarn install
```

## Building

```bash
# Build once
yarn build

# Build and watch for changes
yarn build:watch

# Type check without building
yarn typecheck
```

## Usage

### Basic Usage

```typescript
import { createIPFSService } from 'forever-message-ipfs';

// Initialize the service
const ipfs = await createIPFSService({
  gatewayUrl: 'https://storacha.link/ipfs' // optional, this is the default
});

// Upload a bottle message
const result = await ipfs.uploadBottle(
  'This is my message in a bottle!',
  'user-123' // Supabase user ID
);

console.log('CID:', result.cid);
console.log('URL:', result.url);
console.log('Size:', result.size);

// Upload a comment
const commentResult = await ipfs.uploadComment(
  'Great message!',
  42, // bottle ID from smart contract
  'user-456' // Supabase user ID
);

// Retrieve content by CID
const content = await ipfs.getContent(result.cid);
console.log('Content:', content.content);
console.log('Type:', content.type); // 'bottle' or 'comment'
```

### Integration with Smart Contract

```typescript
import { createIPFSService } from 'forever-message-ipfs';
import { ethers } from 'ethers';

// Initialize IPFS service
const ipfs = await createIPFSService();

// Upload message to IPFS first
const uploadResult = await ipfs.uploadBottle(messageText, userId);

// Then store the CID in your smart contract
const contract = new ethers.Contract(contractAddress, abi, signer);
const tx = await contract.postMessage(uploadResult.cid);
await tx.wait();

console.log('Message posted! CID:', uploadResult.cid);
```

### Using the Singleton Pattern

```typescript
import { getIPFSService } from 'forever-message-ipfs';

// Get or create the default instance
const ipfs = await getIPFSService();

// Use it anywhere in your app
const result = await ipfs.uploadBottle('Hello IPFS!', 'user-123');
```

### Error Handling

```typescript
import { IPFSError, IPFSErrorCode } from 'forever-message-ipfs';

try {
  const result = await ipfs.uploadBottle(message, userId);
} catch (error) {
  if (error instanceof IPFSError) {
    switch (error.code) {
      case IPFSErrorCode.NOT_INITIALIZED:
        console.error('Service not initialized');
        break;
      case IPFSErrorCode.UPLOAD_FAILED:
        console.error('Upload failed:', error.message);
        break;
      case IPFSErrorCode.FETCH_FAILED:
        console.error('Failed to fetch:', error.message);
        break;
      default:
        console.error('IPFS error:', error.message);
    }
  }
}
```

### Cache Management

```typescript
// Clear the cache
ipfs.clearCache();

// Set custom cache expiration (in milliseconds)
ipfs.setCacheExpiration(10 * 60 * 1000); // 10 minutes

// Get cache statistics
const stats = ipfs.getCacheStats();
console.log('Cached entries:', stats.entries);
console.log('Cache size (bytes):', stats.size);
```

### Advanced: Space Management

For uploading content, you need to set up a Storacha space:

```typescript
// Login with email (first time setup)
await ipfs.login('your-email@example.com');
// Follow the email verification flow in your inbox

// Get the client DID
const did = ipfs.getDID();
console.log('Client DID:', did);
```

## Data Structures

### Bottle Content

```typescript
{
  content: string;        // The message text
  type: 'bottle';         // Content type
  userId: string;         // Supabase user ID
  timestamp: number;      // Unix timestamp (seconds)
  createdAt: string;      // ISO 8601 timestamp
}
```

### Comment Content

```typescript
{
  content: string;        // The comment text
  type: 'comment';        // Content type
  bottleId: number;       // Reference to bottle ID from smart contract
  userId: string;         // Supabase user ID
  timestamp: number;      // Unix timestamp (seconds)
  createdAt: string;      // ISO 8601 timestamp
}
```

## API Reference

### `IPFSService`

#### `initialize(): Promise<void>`
Initialize the Storacha client. Must be called before any operations.

#### `uploadBottle(content: string, userId: string): Promise<UploadResult>`
Upload a bottle message to IPFS.

**Returns:**
```typescript
{
  cid: string;    // IPFS Content Identifier
  size: number;   // Size in bytes
  url: string;    // Gateway URL
}
```

#### `uploadComment(content: string, bottleId: number, userId: string): Promise<UploadResult>`
Upload a comment to IPFS.

#### `getContent<T extends IPFSContent>(cid: string): Promise<T>`
Retrieve content from IPFS by CID. Uses caching automatically.

#### `clearCache(): void`
Clear all cached content.

#### `isInitialized(): boolean`
Check if the service is initialized.

#### `getDID(): string | null`
Get the client's DID (Decentralized Identifier).

#### `getCacheStats(): { size: number; entries: number }`
Get cache statistics.

### Helper Functions

#### `createIPFSService(config?: StorachaConfig): Promise<IPFSService>`
Create and initialize a new IPFS service instance.

#### `getIPFSService(config?: StorachaConfig): Promise<IPFSService>`
Get or create the default singleton instance.

#### `resetIPFSService(): void`
Reset the singleton instance (useful for testing).

## Configuration

### StorachaConfig

```typescript
{
  gatewayUrl?: string;  // Custom IPFS gateway URL (default: https://storacha.link/ipfs)
}
```

## Error Codes

- `INIT_FAILED` - Client initialization failed
- `UPLOAD_FAILED` - Upload operation failed
- `FETCH_FAILED` - Content retrieval failed
- `INVALID_CID` - Invalid content identifier
- `PARSE_FAILED` - Content parsing/validation failed
- `NOT_INITIALIZED` - Service not initialized
- `SPACE_REGISTRATION_FAILED` - Space registration failed

## Environment Setup

For production use, you'll need to set up a Storacha account:

1. Visit [storacha.network](https://storacha.network)
2. Sign up with your email
3. Create a space for your application
4. Use the `login()` method in your app to authenticate

## Integration with React (Separate Project)

This library can be easily integrated into your React app:

```typescript
// In your React app
import { getIPFSService } from 'forever-message-ipfs';
import { useState, useEffect } from 'react';

function MessageForm() {
  const [ipfs, setIpfs] = useState(null);

  useEffect(() => {
    getIPFSService().then(setIpfs);
  }, []);

  const handleSubmit = async (message) => {
    if (!ipfs) return;
    
    const result = await ipfs.uploadBottle(message, userId);
    // Pass result.cid to your smart contract
    await contract.postMessage(result.cid);
  };

  // ... rest of component
}
```

## Development

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Type check
yarn typecheck

# Clean build artifacts
yarn clean
```

## Architecture

```
┌─────────────────┐
│  React App      │
│  (Separate)     │
└────────┬────────┘
         │
         │ imports
         ▼
┌─────────────────┐
│ IPFS Service    │
│ (This Library)  │
└────────┬────────┘
         │
         │ uses
         ▼
┌─────────────────┐
│ Storacha Client │
│ (@storacha)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ IPFS/Filecoin   │
│ Network         │
└─────────────────┘
```

## License

ISC

## Contributing

This is a production library for the Forever Message platform. Ensure all changes:
- Include TypeScript types
- Have proper error handling
- Are backwards compatible
- Include appropriate documentation
