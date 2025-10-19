/**
 * Example usage of Forever Message IPFS Storage
 *
 * This file demonstrates how to use the IPFS service
 * Run with: npx tsx example.ts
 */

import { createIPFSService, IPFSError, IPFSErrorCode } from './src/index.js';

async function main() {
  console.log('🚀 Forever Message IPFS Example\n');

  try {
    // 1. Create and initialize the IPFS service
    console.log('📦 Initializing IPFS service...');
    const ipfs = await createIPFSService();
    console.log('✅ Service initialized');
    console.log('🆔 Client DID:', ipfs.getDID());
    console.log('');

    // Note: For uploads to work, you need to login first
    // Uncomment the following line and check your email
    // await ipfs.login('your-email@example.com');

    // 2. Upload a bottle message
    console.log('📝 Uploading a bottle message...');
    const bottleResult = await ipfs.uploadBottle(
      'Hello from the Forever Message platform! 🌊',
      'user-example-123'
    );
    console.log('✅ Bottle uploaded successfully!');
    console.log('   CID:', bottleResult.cid);
    console.log('   URL:', bottleResult.url);
    console.log('   Size:', bottleResult.size, 'bytes');
    console.log('');

    // 3. Upload a comment
    console.log('💬 Uploading a comment...');
    const commentResult = await ipfs.uploadComment(
      'This is an awesome message!',
      42, // bottle ID from smart contract
      'user-example-456'
    );
    console.log('✅ Comment uploaded successfully!');
    console.log('   CID:', commentResult.cid);
    console.log('   URL:', commentResult.url);
    console.log('');

    // 4. Retrieve content by CID
    console.log('📥 Retrieving bottle content...');
    const bottleContent = await ipfs.getContent(bottleResult.cid);
    console.log('✅ Content retrieved:');
    console.log('   Type:', bottleContent.type);
    console.log('   Content:', bottleContent.content);
    console.log('   User ID:', bottleContent.userId);
    console.log('   Timestamp:', new Date(bottleContent.timestamp * 1000).toISOString());
    console.log('');

    // 5. Check cache stats
    const stats = ipfs.getCacheStats();
    console.log('📊 Cache stats:');
    console.log('   Entries:', stats.entries);
    console.log('   Size:', stats.size, 'bytes');
    console.log('');

    // 6. Demonstrate error handling
    console.log('❌ Testing error handling...');
    try {
      await ipfs.getContent('invalid-cid-12345');
    } catch (error) {
      if (error instanceof IPFSError) {
        console.log('   Caught expected error:');
        console.log('   Code:', error.code);
        console.log('   Message:', error.message);
      }
    }
    console.log('');

    console.log('✨ Example completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Call ipfs.login(email) to set up your Storacha space');
    console.log('2. Integrate with your smart contract using the CIDs');
    console.log('3. Use in your React app for the Forever Message platform');

  } catch (error) {
    console.error('❌ Error:', error);

    if (error instanceof IPFSError) {
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      if (error.code === IPFSErrorCode.UPLOAD_FAILED) {
        console.log('\n💡 Tip: Make sure to run ipfs.login(email) before uploading');
      }
    }

    process.exit(1);
  }
}

// Run the example
main();
