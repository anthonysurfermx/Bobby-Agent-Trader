// src/components/TikTokEmbed.tsx
import { useEffect, useRef } from 'react';

interface TikTokEmbedProps {
  videoId: string;
  className?: string;
}

export const TikTokEmbed: React.FC<TikTokEmbedProps> = ({ videoId, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load TikTok embed script
    const script = document.createElement('script');
    script.src = 'https://www.tiktok.com/embed.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className={`tiktok-embed-container ${className}`}>
      <blockquote
        className="tiktok-embed"
        cite={`https://www.tiktok.com/@defimexico/video/${videoId}`}
        data-video-id={videoId}
        style={{ maxWidth: '605px', minWidth: '325px' }}
      >
        <section>
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.tiktok.com/@defimexico/video/${videoId}`}
          >
            Ver en TikTok
          </a>
        </section>
      </blockquote>
    </div>
  );
};

export default TikTokEmbed;
