import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

interface NFTImageProps {
  tokenId?: number;
  imageUrl?: string | null;
  className?: string;
  showFallback?: boolean;
  isHovered?: boolean;
}

export function NFTImage({
  tokenId,
  imageUrl,
  className = '',
  showFallback = true,
  isHovered = false,
}: NFTImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(imageUrl || null);

  useEffect(() => {
    if (imageUrl) {
      setCurrentUrl(imageUrl);
      setLoaded(false);
      setError(false);
    }
  }, [imageUrl]);

  const handleLoad = () => {
    setLoaded(true);
    setError(false);
  };

  const handleError = () => {
    setError(true);
    setLoaded(false);
  };

  // Show fallback if no URL, error, or explicitly requested
  if (!currentUrl || error || (!loaded && showFallback)) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400" />

        {/* Animated background pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSIjZmZmIi8+PC9zdmc+')] bg-repeat" />
        </div>

        {/* Trophy Icon or loading */}
        <div className="absolute inset-0 flex items-center justify-center">
          {!currentUrl || error ? (
            <motion.div
              animate={{
                scale: isHovered ? 1.1 : 1,
                rotate: isHovered ? [0, -5, 5, 0] : 0,
              }}
              transition={{ duration: 0.3 }}
              className="text-8xl filter drop-shadow-2xl"
            >
              <Trophy className="w-20 h-20 text-white/90" />
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white/90 rounded-full animate-spin" />
              <span className="text-xs text-white/70">Cargando NFT...</span>
            </div>
          )}
        </div>

        {/* Shine effect on hover */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
          animate={{
            translateX: isHovered ? '200%' : '-100%',
          }}
          transition={{ duration: 0.6 }}
        />

        {/* Hidden image for preloading */}
        {currentUrl && !error && (
          <img
            src={currentUrl}
            alt={`NFT #${tokenId || ''}`}
            onLoad={handleLoad}
            onError={handleError}
            className="hidden"
          />
        )}
      </div>
    );
  }

  // Show actual image
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <motion.img
        src={currentUrl}
        alt={`NFT #${tokenId || ''}`}
        onLoad={handleLoad}
        onError={handleError}
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full h-full object-cover"
      />

      {/* Shine effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
        animate={{
          translateX: isHovered ? '200%' : '-100%',
        }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}

export default NFTImage;
