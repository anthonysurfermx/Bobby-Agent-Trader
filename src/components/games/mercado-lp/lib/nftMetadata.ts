import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// NFT Contract on Base
export const NFT_CONTRACT_ADDRESS = '0xA03DA0BAab286043aD01f22a1F69b1D46b0E2EF7';

// Base RPC client
const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// ERC721 ABI for tokenURI function
const erc721Abi = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
}

// Cache for NFT metadata
const metadataCache = new Map<number, NFTMetadata>();
const imageCache = new Map<number, string>();

/**
 * Convert IPFS URL to HTTP gateway URL
 */
function ipfsToHttp(url: string): string {
  if (!url) return '';

  if (url.startsWith('ipfs://')) {
    const cid = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${cid}`;
  }

  if (url.startsWith('ar://')) {
    const txId = url.replace('ar://', '');
    return `https://arweave.net/${txId}`;
  }

  return url;
}

/**
 * Get the tokenURI for a specific token
 */
export async function getTokenURI(tokenId: number): Promise<string | null> {
  try {
    const uri = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS as `0x${string}`,
      abi: erc721Abi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    });

    return uri as string;
  } catch (error) {
    console.error(`Error getting tokenURI for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * Get total supply of NFTs
 */
export async function getTotalSupply(): Promise<number> {
  try {
    const supply = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS as `0x${string}`,
      abi: erc721Abi,
      functionName: 'totalSupply',
    });

    return Number(supply);
  } catch (error) {
    console.error('Error getting total supply:', error);
    return 0;
  }
}

/**
 * Fetch and parse NFT metadata from tokenURI
 */
export async function getNFTMetadata(tokenId: number): Promise<NFTMetadata | null> {
  // Check cache first
  if (metadataCache.has(tokenId)) {
    return metadataCache.get(tokenId)!;
  }

  try {
    const tokenURI = await getTokenURI(tokenId);
    if (!tokenURI) return null;

    const httpUrl = ipfsToHttp(tokenURI);

    const response = await fetch(httpUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const metadata = await response.json() as NFTMetadata;

    // Convert image URL if needed
    if (metadata.image) {
      metadata.image = ipfsToHttp(metadata.image);
    }

    // Cache the result
    metadataCache.set(tokenId, metadata);

    return metadata;
  } catch (error) {
    console.error(`Error fetching metadata for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * Get just the image URL for a token (with caching)
 */
export async function getNFTImageUrl(tokenId: number): Promise<string | null> {
  // Check cache first
  if (imageCache.has(tokenId)) {
    return imageCache.get(tokenId)!;
  }

  const metadata = await getNFTMetadata(tokenId);
  if (metadata?.image) {
    imageCache.set(tokenId, metadata.image);
    return metadata.image;
  }

  return null;
}

/**
 * Get sample NFT images for display (fetches first N tokens)
 */
export async function getSampleNFTImages(count: number = 5): Promise<string[]> {
  const images: string[] = [];

  try {
    const totalSupply = await getTotalSupply();
    const tokensToFetch = Math.min(count, totalSupply);

    // Fetch images for first N tokens
    const promises = Array.from({ length: tokensToFetch }, (_, i) =>
      getNFTImageUrl(i + 1)
    );

    const results = await Promise.all(promises);

    for (const url of results) {
      if (url) {
        images.push(url);
      }
    }
  } catch (error) {
    console.error('Error fetching sample NFT images:', error);
  }

  return images;
}

/**
 * Get collection image (first NFT's image as representative)
 */
let collectionImageCache: string | null = null;

export async function getCollectionImage(): Promise<string | null> {
  if (collectionImageCache) {
    return collectionImageCache;
  }

  const image = await getNFTImageUrl(1);
  if (image) {
    collectionImageCache = image;
  }

  return image;
}
