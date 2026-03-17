// src/pages/TikTokFeedPage.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, TrendingUp, Sparkles, Hash, Instagram } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Componente para renderizar embeds de TikTok e Instagram
function VideoEmbed({ video }: { video: SocialVideo }) {
  if (video.platform === 'tiktok') {
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full"
      >
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover"
        />
      </a>
    );
  }

  if (video.platform === 'instagram') {
    return (
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full h-full"
      >
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover"
        />
      </a>
    );
  }

  return null;
}

interface SocialVideo {
  id: string;
  platform: 'tiktok' | 'instagram';
  url: string; // URL completa del video
  thumbnail: string;
  title: string;
  creator: string;
  category: string;
  views: string;
  tag?: string;
}

const categories = [
  { id: 'all', label: 'Para Ti', icon: Sparkles },
  { id: 'basics', label: 'Básicos DeFi', icon: TrendingUp },
  { id: 'protocols', label: 'Protocolos', icon: Hash },
  { id: 'education', label: 'Educación', icon: TrendingUp },
  { id: 'advanced', label: 'Avanzado', icon: Sparkles },
];

const trendingTopics = [
  { tag: 'DeFi', posts: '2.5M' },
  { tag: 'Blockchain', posts: '1.8M' },
  { tag: 'SmartContracts', posts: '980K' },
  { tag: 'YieldFarming', posts: '654K' },
  { tag: 'Web3México', posts: '432K' },
];

// Ejemplos de videos - Reemplaza con tus URLs reales
const videos: SocialVideo[] = [
  {
    id: '1',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@defimexico/video/7123456789', // URL real de tu TikTok
    thumbnail: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=700&fit=crop',
    title: '¿Qué es DeFi? Explicado en 60 segundos',
    creator: '@defimexico',
    category: 'basics',
    views: '125K',
    tag: 'DeFi'
  },
  {
    id: '2',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/ABC123/', // URL real de tu Instagram Reel
    thumbnail: 'https://images.unsplash.com/photo-1639762681057-408e52192e55?w=400&h=700&fit=crop',
    title: 'Cómo funcionan los Smart Contracts',
    creator: '@defimexico',
    category: 'education',
    views: '98K',
    tag: 'SmartContracts'
  },
  {
    id: '3',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@defimexico/video/7345678901',
    thumbnail: 'https://images.unsplash.com/photo-1640340434855-6084b1f4901c?w=400&h=700&fit=crop',
    title: 'Top 5 Protocolos DeFi en México',
    creator: '@defimexico',
    category: 'protocols',
    views: '156K',
    tag: 'Protocolos'
  },
  {
    id: '4',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/DEF456/',
    thumbnail: 'https://images.unsplash.com/photo-1644088379091-d574269d422f?w=400&h=700&fit=crop',
    title: 'Yield Farming explicado fácil',
    creator: '@defimexico',
    category: 'advanced',
    views: '87K',
    tag: 'YieldFarming'
  },
  {
    id: '5',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@defimexico/video/7567890123',
    thumbnail: 'https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=400&h=700&fit=crop',
    title: 'Seguridad en DeFi: Lo que debes saber',
    creator: '@defimexico',
    category: 'education',
    views: '142K',
    tag: 'Seguridad'
  },
  {
    id: '6',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/GHI789/',
    thumbnail: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=700&fit=crop',
    title: 'Uniswap vs SushiSwap: Comparativa',
    creator: '@defimexico',
    category: 'protocols',
    views: '113K',
    tag: 'DeFi'
  },
  {
    id: '7',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@defimexico/video/7789012345',
    thumbnail: 'https://images.unsplash.com/photo-1640340434855-6084b1f4901c?w=400&h=700&fit=crop',
    title: 'NFTs y su uso en DeFi',
    creator: '@defimexico',
    category: 'advanced',
    views: '203K',
    tag: 'NFT'
  },
  {
    id: '8',
    platform: 'instagram',
    url: 'https://www.instagram.com/reel/JKL012/',
    thumbnail: 'https://images.unsplash.com/photo-1644088379091-d574269d422f?w=400&h=700&fit=crop',
    title: 'Staking: Gana mientras duermes',
    creator: '@defimexico',
    category: 'basics',
    views: '189K',
    tag: 'Staking'
  },
  {
    id: '9',
    platform: 'tiktok',
    url: 'https://www.tiktok.com/@defimexico/video/7901234567',
    thumbnail: 'https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=400&h=700&fit=crop',
    title: 'DeFi en América Latina',
    creator: '@defimexico',
    category: 'education',
    views: '167K',
    tag: 'Web3México'
  },
];

export default function TikTokFeedPage() {
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredVideos = selectedCategory === 'all'
    ? videos
    : videos.filter(v => v.category === selectedCategory);

  return (
    <div className="min-h-screen bg-background">
      {/* Header - TikTok Style */}
      <div className="sticky top-20 z-40 bg-background border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Categories Tabs */}
          <div className="flex items-center gap-8 overflow-x-auto scrollbar-hide">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex items-center gap-2 py-4 px-2 border-b-2 transition-all whitespace-nowrap ${
                    selectedCategory === category.id
                      ? 'border-foreground text-foreground font-semibold'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Main Content - Video Grid */}
          <div className="flex-1">
            {/* Masonry Grid */}
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
              {filteredVideos.map((video, index) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="break-inside-avoid mb-4"
                >
                  <div className="group relative bg-card rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-all">
                    {/* Thumbnail */}
                    <div className="relative aspect-[9/16] bg-gradient-to-br from-purple-500/20 to-pink-500/20 overflow-hidden">
                      <VideoEmbed video={video} />
                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-white/90 rounded-full p-4">
                          {video.platform === 'instagram' ? (
                            <Instagram className="w-8 h-8 text-black" />
                          ) : (
                            <Play className="w-8 h-8 text-black fill-black" />
                          )}
                        </div>
                      </div>
                      {/* Platform Badge */}
                      <div className="absolute top-3 left-3">
                        <Badge variant="secondary" className="bg-black/70 text-white font-semibold">
                          {video.platform === 'instagram' ? (
                            <><Instagram className="w-3 h-3 inline mr-1" /> Reel</>
                          ) : (
                            <>TikTok</>
                          )}
                        </Badge>
                      </div>
                      {/* Views Badge */}
                      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded">
                        <Play className="w-3 h-3 fill-white" />
                        {video.views}
                      </div>
                      {/* Tag Badge */}
                      {video.tag && (
                        <div className="absolute top-3 right-3">
                          <Badge variant="secondary" className="bg-white/90 text-black font-semibold">
                            #{video.tag}
                          </Badge>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1">
                        {video.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {video.creator}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Load More */}
            <div className="text-center mt-8">
              <Button variant="outline" size="lg">
                Ver más videos
              </Button>
            </div>
          </div>

          {/* Sidebar - Trending Topics */}
          <div className="hidden xl:block w-80">
            <div className="sticky top-36">
              {/* Trending Section */}
              <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-foreground">Tendencias</h2>
                </div>
                <div className="space-y-3">
                  {trendingTopics.map((topic, index) => (
                    <motion.div
                      key={topic.tag}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            #{topic.tag}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {topic.posts} posts
                          </div>
                        </div>
                      </div>
                      <Hash className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA Card */}
              <div className="bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 rounded-lg p-6 text-white">
                <h3 className="font-bold text-lg mb-2">
                  Síguenos en TikTok
                </h3>
                <p className="text-white/90 text-sm mb-4">
                  Contenido diario sobre DeFi, Web3 y blockchain
                </p>
                <Button
                  size="sm"
                  className="w-full bg-white text-purple-600 hover:bg-white/90 font-semibold"
                  asChild
                >
                  <a
                    href="https://www.tiktok.com/@defimexico"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Seguir @defimexico
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
