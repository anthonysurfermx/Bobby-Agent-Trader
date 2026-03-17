import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getGalleryProfiles,
  getGalleryStats,
  NFT_CONTRACT_ADDRESS,
  type GalleryItem
} from '@/components/games/mercado-lp/lib/nftGallery';
import {
  getCollectionImage,
  getSampleNFTImages
} from '@/components/games/mercado-lp/lib/nftMetadata';
import { NFTImage } from '@/components/games/mercado-lp/components/NFTImage';
import {
  PixelTwitter,
  PixelExternalLink,
  PixelGamepad,
  PixelStar,
  PixelSparkles,
  PixelUsers,
} from '@/components/ui/pixel-icons';
import {
  TrophyIcon,
  BadgeIcon,
  ChartIcon,
  BoltIcon,
  PixelCrown,
  PixelMedal,
  GiftIcon,
} from '@/components/games/mercado-lp/components/icons/GameIcons';

export default function NFTGalleryPage() {
  const { t, i18n } = useTranslation();
  const [profiles, setProfiles] = useState<GalleryItem[]>([]);
  const [stats, setStats] = useState({
    totalMinted: 0,
    totalVerified: 0,
    averageLevel: 0,
    averageXP: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [collectionImage, setCollectionImage] = useState<string | null>(null);
  const [sampleImages, setSampleImages] = useState<string[]>([]);

  useEffect(() => {
    loadGalleryData();
    loadNFTImages();
  }, []);

  const loadGalleryData = async () => {
    setIsLoading(true);
    try {
      const [profilesData, statsData] = await Promise.all([
        getGalleryProfiles(100),
        getGalleryStats(),
      ]);
      setProfiles(profilesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading gallery:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNFTImages = async () => {
    try {
      const [mainImage, samples] = await Promise.all([
        getCollectionImage(),
        getSampleNFTImages(10),
      ]);
      if (mainImage) setCollectionImage(mainImage);
      if (samples.length > 0) setSampleImages(samples);
    } catch (error) {
      console.error('Error loading NFT images:', error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const locale = i18n.language === 'en' ? 'en-US' : 'es-MX';
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const shortenAddress = (address: string | null) => {
    if (!address) return null;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <PixelCrown className="w-5 h-5 text-yellow-400" size={20} />;
      case 1:
        return <PixelMedal className="w-5 h-5 text-gray-300" size={20} />;
      case 2:
        return <PixelMedal className="w-5 h-5 text-amber-600" size={20} />;
      default:
        return null;
    }
  };

  const getRankBadgeClass = (index: number) => {
    switch (index) {
      case 0:
        return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black';
      case 1:
        return 'bg-gradient-to-r from-gray-300 to-gray-400 text-black';
      case 2:
        return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with animated background */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-pink-900/10 to-orange-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent" />

        {/* Floating particles effect */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-purple-500/30 rounded-full"
              initial={{
                x: Math.random() * 100 + '%',
                y: '100%',
                opacity: 0.3,
              }}
              animate={{
                y: '-100%',
                opacity: [0.3, 0.8, 0.3],
              }}
              transition={{
                duration: Math.random() * 10 + 10,
                repeat: Infinity,
                delay: Math.random() * 10,
              }}
            />
          ))}
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            {/* Text Content */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center lg:text-left"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6"
              >
                <PixelSparkles className="w-4 h-4 text-purple-400" size={16} />
                <span className="text-sm text-purple-300">{t('nftGallery.badge')}</span>
              </motion.div>

              {/* Title */}
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6">
                <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
                  {t('nftGallery.title')}
                </span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0">
                {t('nftGallery.description')}
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 flex-wrap">
                <Link to="/academia/juego/mercado-lp">
                  <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 gap-2">
                    <PixelGamepad size={20} />
                    {t('nftGallery.playAndGet')}
                  </Button>
                </Link>
                <a
                  href="https://opensea.io/es/collection/defi-mexico-685678404"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="lg" className="gap-2">
                    {t('nftGallery.viewOnOpenSea')}
                    <PixelExternalLink size={16} />
                  </Button>
                </a>
              </div>
            </motion.div>

            {/* NFT Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20, rotateY: -15 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="relative hidden lg:block"
            >
              {/* Main NFT Card */}
              <div className="relative mx-auto w-72 xl:w-80">
                {/* Glow effect */}
                <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-orange-500/30 rounded-3xl blur-2xl" />

                {/* Card */}
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="relative rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl bg-card"
                >
                  {/* NFT Image */}
                  <NFTImage
                    tokenId={1}
                    imageUrl={collectionImage}
                    className="h-72 xl:h-80"
                    isHovered={false}
                  />

                  {/* Card Footer */}
                  <div className="p-4 bg-gradient-to-t from-background to-background/80 backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-lg">{t('nftGallery.collectionName')}</p>
                        <p className="text-xs text-muted-foreground">{t('nftGallery.collectionSubtitle')}</p>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <BoltIcon className="w-3 h-3 mr-1" size={12} />
                        {t('nftGallery.onBase')}
                      </Badge>
                    </div>
                  </div>
                </motion.div>

                {/* Floating mini cards */}
                <motion.div
                  animate={{ y: [0, -8, 0], rotate: [-3, 3, -3] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  className="absolute -right-8 -top-4 w-24 h-24 rounded-xl overflow-hidden border border-purple-500/30 shadow-xl hidden xl:block"
                >
                  <NFTImage
                    imageUrl={sampleImages[1] || collectionImage}
                    className="h-full"
                    showFallback={true}
                  />
                </motion.div>

                <motion.div
                  animate={{ y: [0, 8, 0], rotate: [3, -3, 3] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -left-6 -bottom-4 w-20 h-20 rounded-xl overflow-hidden border border-pink-500/30 shadow-xl hidden xl:block"
                >
                  <NFTImage
                    imageUrl={sampleImages[2] || collectionImage}
                    className="h-full"
                    showFallback={true}
                  />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y border-border bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-500/10 mb-4">
                <PixelUsers className="w-7 h-7 text-purple-400" size={28} />
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.totalMinted}</p>
              <p className="text-sm text-muted-foreground">{t('nftGallery.stats.minted')}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 mb-4">
                <BadgeIcon className="w-7 h-7 text-green-400" size={28} />
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.totalVerified}</p>
              <p className="text-sm text-muted-foreground">{t('nftGallery.stats.verified')}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-yellow-500/10 mb-4">
                <PixelStar className="w-7 h-7 text-yellow-400" size={28} />
              </div>
              <p className="text-3xl font-bold text-foreground">{stats.averageXP}</p>
              <p className="text-sm text-muted-foreground">{t('nftGallery.stats.avgXP')}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-pink-500/10 mb-4">
                <ChartIcon className="w-7 h-7 text-pink-400" size={28} />
              </div>
              <p className="text-3xl font-bold text-foreground">{t('nftGallery.gallery.level', { level: stats.averageLevel })}</p>
              <p className="text-sm text-muted-foreground">{t('nftGallery.stats.avgLevel')}</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-between mb-12"
          >
            <div>
              <h2 className="text-3xl font-bold flex items-center gap-3">
                <TrophyIcon className="w-8 h-8 text-yellow-500" size={32} />
                {t('nftGallery.gallery.title')}
              </h2>
              <p className="text-muted-foreground mt-2">
                {t('nftGallery.gallery.playersCompleted', { count: profiles.length })}
              </p>
            </div>
          </motion.div>

          {/* Gallery Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-48 w-full" />
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : profiles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              <AnimatePresence>
                {profiles.map((profile, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onMouseEnter={() => setHoveredCard(index)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <Card className="overflow-hidden group relative bg-card/50 backdrop-blur border-border/50 hover:border-purple-500/50 transition-all duration-300">
                      {/* Rank Badge for top 3 */}
                      {index < 3 && (
                        <div className="absolute top-4 left-4 z-20">
                          <Badge className={`${getRankBadgeClass(index)} flex items-center gap-1 px-2 py-1`}>
                            {getRankIcon(index)}
                            <span className="font-bold">#{index + 1}</span>
                          </Badge>
                        </div>
                      )}

                      {/* Verified Badge */}
                      {profile.verifiedOnChain && (
                        <div className="absolute top-4 right-4 z-20">
                          <Badge className="bg-green-500/90 text-white text-xs flex items-center gap-1">
                            <BoltIcon className="w-3 h-3" size={12} />
                            {t('nftGallery.gallery.verified')}
                          </Badge>
                        </div>
                      )}

                      {/* NFT Image/Visual */}
                      <NFTImage
                        tokenId={profile.tokenIds?.[0]}
                        imageUrl={
                          // Use collection image for all cards, or sample images if available
                          sampleImages[index % sampleImages.length] || collectionImage
                        }
                        className="h-48"
                        isHovered={hoveredCard === index}
                      />

                      {/* Profile Info */}
                      <CardContent className="p-5">
                        <h3 className="font-bold text-xl mb-2 truncate group-hover:text-purple-400 transition-colors">
                          {profile.nickname}
                        </h3>

                        {profile.twitterHandle && (
                          <a
                            href={`https://twitter.com/${profile.twitterHandle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-3"
                          >
                            <PixelTwitter size={16} />
                            @{profile.twitterHandle}
                          </a>
                        )}

                        {/* Stats */}
                        <div className="flex items-center gap-4 mt-3 py-3 border-t border-border/50">
                          <div className="flex items-center gap-1.5">
                            <PixelStar className="w-4 h-4 text-yellow-400" size={16} />
                            <span className="text-sm font-medium">{profile.playerXP} XP</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ChartIcon className="w-4 h-4 text-green-400" size={16} />
                            <span className="text-sm font-medium">{t('nftGallery.gallery.level', { level: profile.playerLevel })}</span>
                          </div>
                        </div>

                        {/* Wallet & Date */}
                        <div className="mt-3 space-y-2">
                          {profile.walletAddress && (
                            <a
                              href={`https://basescan.org/address/${profile.walletAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <span className="font-mono">{shortenAddress(profile.walletAddress)}</span>
                              <PixelExternalLink size={12} />
                            </a>
                          )}

                          {profile.mintedAt && (
                            <p className="text-xs text-muted-foreground">
                              {t('nftGallery.gallery.minted', { date: formatDate(profile.mintedAt) })}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="text-center py-16 bg-card/50">
                <CardContent>
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-purple-500/10 mb-6">
                    <GiftIcon className="w-10 h-10 text-purple-400" size={40} />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{t('nftGallery.empty.title')}</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    {t('nftGallery.empty.description')}
                  </p>
                  <Link to="/academia/juego/mercado-lp">
                    <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 gap-2">
                      <PixelGamepad size={20} />
                      {t('nftGallery.empty.cta')}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-purple-900/30 via-pink-900/20 to-purple-900/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-600/10 via-transparent to-transparent" />

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-4xl font-bold mb-6">
              {t('nftGallery.cta.title')}
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              {t('nftGallery.cta.description')}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/academia/juego/mercado-lp">
                <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 gap-2 px-8">
                  <PixelGamepad size={20} />
                  {t('nftGallery.cta.play')}
                </Button>
              </Link>
              <a
                href={`https://basescan.org/address/${NFT_CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="lg" className="gap-2">
                  {t('nftGallery.cta.viewContract')}
                  <PixelExternalLink size={16} />
                </Button>
              </a>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                  <GiftIcon className="w-6 h-6 text-green-400" size={24} />
                </div>
                <p className="font-medium">{t('nftGallery.features.free')}</p>
                <p className="text-sm text-muted-foreground">{t('nftGallery.features.freeDesc')}</p>
              </div>
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3">
                  <BadgeIcon className="w-6 h-6 text-blue-400" size={24} />
                </div>
                <p className="font-medium">{t('nftGallery.features.certification')}</p>
                <p className="text-sm text-muted-foreground">{t('nftGallery.features.certificationDesc')}</p>
              </div>
              <div className="flex flex-col items-center p-4">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                  <PixelSparkles className="w-6 h-6 text-purple-400" size={24} />
                </div>
                <p className="font-medium">{t('nftGallery.features.exclusive')}</p>
                <p className="text-sm text-muted-foreground">{t('nftGallery.features.exclusiveDesc')}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer info */}
      <section className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t('nftGallery.footer')}{' '}
            <a href="https://defi-mexico.org" className="text-primary hover:underline">
              DeFi México
            </a>
            {' '}• {t('nftGallery.deployedOn')}{' '}
            <a
              href="https://base.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Base L2
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
