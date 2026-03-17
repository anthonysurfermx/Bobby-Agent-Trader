import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { GameProvider, useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { SwapView } from '@/components/games/mercado-lp/components/SwapView';
import { LiquidityView } from '@/components/games/mercado-lp/components/LiquidityView';
import { TokenCreatorView } from '@/components/games/mercado-lp/components/TokenCreatorView';
import { CCAView } from '@/components/games/mercado-lp/components/CCAView';
import { TradingLeagueView } from '@/components/games/mercado-lp/components/TradingLeagueView';
import { MarketMakerView } from '@/components/games/mercado-lp/components/MarketMakerView';
import { PlayerStatsPanel } from '@/components/games/mercado-lp/components/PlayerStatsPanel';
import { NPCActivityFeed } from '@/components/games/mercado-lp/components/NPCActivityFeed';
import { DailyChallengesPanel } from '@/components/games/mercado-lp/components/DailyChallengesPanel';
import { StreakRewardsPanel } from '@/components/games/mercado-lp/components/StreakRewardsPanel';
import { MarketEventsBanner } from '@/components/games/mercado-lp/components/MarketEventsBanner';
import { ContextualTip } from '@/components/games/mercado-lp/components/ContextualTip';
import { MarketPlazaMap } from '@/components/games/mercado-lp/components/MarketPlazaMap';
import { BadgeNotification } from '@/components/games/mercado-lp/components/BadgeNotification';
import { LevelUpModal } from '@/components/games/mercado-lp/components/LevelUpModal';
import { NFTClaimModal } from '@/components/games/mercado-lp/components/NFTClaimModal';
import { StartScreen } from '@/components/games/mercado-lp/components/StartScreen';
import { GameHeader } from '@/components/games/mercado-lp/components/GameHeader';
import { OnboardingTutorial } from '@/components/games/mercado-lp/components/OnboardingTutorial';
import { LoginPromptModal } from '@/components/games/mercado-lp/components/LoginPromptModal';
import { AuctionTutorial } from '@/components/games/mercado-lp/components/AuctionTutorial';
import { useGameEnhancements } from '@/components/games/mercado-lp/hooks/useGameEnhancements';
import { GameLevel } from '@/components/games/mercado-lp/types/game';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

type LoginPromptReason = 'level_up' | 'xp_milestone' | 'leaderboard' | 'nft_claim';

const GameContent = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentLevel, activeTip, dismissTip, showMap, showStartScreen, isLoaded, openMap, closeMap, closeStartScreen, setCurrentLevel, newBadge, dismissBadge, levelUpNotification, dismissLevelUp, player, setPlayerAvatar, setPlayerCharacterName, tokens, pools, placeBid, advanceAuctionBlock } = useGame();
  const [showNFTModal, setShowNFTModal] = useState(false);
  const [autoShowMintWidget, setAutoShowMintWidget] = useState(false);
  const [hasShownNFTModal, setHasShownNFTModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loginPromptReason, setLoginPromptReason] = useState<LoginPromptReason | null>(null);
  const [previousLevel, setPreviousLevel] = useState(player.level);
  const [previousXP, setPreviousXP] = useState(player.xp);
  const [isMobile, setIsMobile] = useState(false);

  // Game enhancements hook - provides daily challenges, events, streaks, leagues, etc.
  const enhancements = useGameEnhancements({
    playerLevel: player.level,
    playerXP: player.xp,
    playerName: player.characterName || 'Trader',
    playerAvatar: player.avatar || '/player.png',
    onAddXP: (amount, source) => {
      // XP is handled by GameContext, but we can track it here for enhancements
      console.log(`Enhancement XP: +${amount} from ${source}`);
    },
    onAddTokens: (tokenId, amount) => {
      // Token rewards from challenges/streaks would go through GameContext
      console.log(`Enhancement tokens: +${amount} ${tokenId}`);
    },
  });

  // Check if a login prompt should be shown
  const shouldShowPrompt = useCallback((reason: LoginPromptReason) => {
    if (user) return false; // Already logged in
    const hidden = localStorage.getItem(`mercado_lp_hide_login_prompt_${reason}`);
    return !hidden;
  }, [user]);

  // Detect level up (to level 2+) and prompt login
  useEffect(() => {
    if (!isLoaded || !shouldShowPrompt('level_up')) return;

    if (player.level >= 2 && previousLevel < 2) {
      setTimeout(() => setLoginPromptReason('level_up'), 1500);
    }
    setPreviousLevel(player.level);
  }, [player.level, previousLevel, isLoaded, shouldShowPrompt]);

  // Detect XP milestone (500+) and prompt login
  useEffect(() => {
    if (!isLoaded || !shouldShowPrompt('xp_milestone')) return;

    if (player.xp >= 500 && previousXP < 500) {
      setTimeout(() => setLoginPromptReason('xp_milestone'), 1500);
    }
    setPreviousXP(player.xp);
  }, [player.xp, previousXP, isLoaded, shouldShowPrompt]);

  const handleLoginPromptLogin = () => {
    navigate('/login');
  };

  const handleSelectRole = (level: GameLevel, avatar: string, characterName: string) => {
    setCurrentLevel(level);
    setPlayerAvatar(avatar);
    setPlayerCharacterName(characterName);
    closeStartScreen();

    // Mostrar onboarding en la primera visita, sin importar el personaje/level
    const hasSeenOnboarding = localStorage.getItem('mercado_lp_onboarding_complete');
    if (!hasSeenOnboarding) {
      setTimeout(() => setShowOnboarding(true), 500);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    // Lleva al jugador al mapa después del tutorial
    openMap();
    localStorage.setItem('mercado_lp_onboarding_complete', 'true');
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
    openMap();
    localStorage.setItem('mercado_lp_onboarding_complete', 'true');
  };

  // Detect mobile to disable MarketPlaza background (heavy image) on small screens
  useEffect(() => {
    const detect = () => setIsMobile(window.innerWidth < 768);
    detect();
    window.addEventListener('resize', detect);
    return () => window.removeEventListener('resize', detect);
  }, []);

  // Detectar si el usuario regresa del login con pending NFT claim
  useEffect(() => {
    if (!isLoaded || !user) return;

    const pendingNFTClaim = localStorage.getItem('mercado_lp_pending_nft_claim');
    if (pendingNFTClaim === 'true') {
      // Limpiar el flag
      localStorage.removeItem('mercado_lp_pending_nft_claim');
      localStorage.removeItem('mercado_lp_return_url');

      // Abrir el modal de NFT directamente en modo minting
      setTimeout(() => {
        setAutoShowMintWidget(true);
        setShowNFTModal(true);
      }, 500);
    }
  }, [isLoaded, user]);

  // Detectar cuando el jugador completa el Nivel 4
  useEffect(() => {
    const hasCompletedLevel4 = player.level >= 4 && player.xp >= 1000;
    const modalAlreadyShown = localStorage.getItem('mercado_lp_nft_modal_shown');

    if (hasCompletedLevel4 && !hasShownNFTModal && !modalAlreadyShown) {
      // Mostrar modal después de 2 segundos
      const timer = setTimeout(() => {
        if (user) {
          // User is logged in, show NFT claim modal
          setShowNFTModal(true);
        } else if (shouldShowPrompt('nft_claim')) {
          // User not logged in, show login prompt for NFT claim
          setLoginPromptReason('nft_claim');
        }
        setHasShownNFTModal(true);
        localStorage.setItem('mercado_lp_nft_modal_shown', 'true');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [player.level, player.xp, hasShownNFTModal, user, shouldShowPrompt]);

  // Show loading state while game data is being loaded
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl animate-bounce">🏪</div>
          <h2 className="text-2xl font-bold">Cargando Mercado LP...</h2>
          <div className="flex justify-center gap-2">
            <span className="animate-pulse">🥭</span>
            <span className="animate-pulse" style={{ animationDelay: '0.1s' }}>🍋</span>
            <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>🍉</span>
          </div>
        </div>
      </div>
    );
  }

  // Show start screen for first-time visitors
  if (showStartScreen) {
    return <StartScreen onSelectRole={handleSelectRole} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {showMap && !isMobile && (
        <MarketPlazaMap
          open={showMap}
          onClose={closeMap}
          onEnterLevel={(level: GameLevel) => {
            setCurrentLevel(level);
            closeMap();
          }}
          playerAvatar={player.avatar}
        />
      )}
      <GameHeader
        onOpenMap={openMap}
        onLoginPrompt={!user ? (reason) => setLoginPromptReason(reason) : undefined}
        onOpenNFTModal={() => setShowNFTModal(true)}
      />

      <div className="container mx-auto px-4 pb-8">
        {/* Market Events Banner - shows active events at the top */}
        {enhancements.activeEvents.length > 0 && (
          <MarketEventsBanner
            events={enhancements.activeEvents}
            onDismiss={enhancements.dismissEvent}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main game area */}
          <div className="lg:col-span-2">
            {currentLevel === 1 && <SwapView />}
            {currentLevel === 2 && <LiquidityView />}
            {currentLevel === 3 && <TokenCreatorView />}
            {currentLevel === 4 && <CCAView />}
            {currentLevel === 5 && enhancements.tradingLeague && (
              <TradingLeagueView
                league={enhancements.tradingLeague}
                onNavigateToSwap={() => setCurrentLevel(1)}
                onNavigateToLP={() => setCurrentLevel(2)}
              />
            )}
            {currentLevel === 6 && (
              <MarketMakerView
                playerLevel={player.level}
                tokens={tokens}
                pools={pools}
                marketMakerStats={enhancements.marketMakerStats}
              />
            )}
          </div>

          {/* Side panels */}
          <div className="space-y-4">
            {/* Streak rewards - shows at the top if there are claimable rewards */}
            {enhancements.streakState && (
              <StreakRewardsPanel
                streakState={enhancements.streakState}
                onClaimReward={enhancements.claimStreakReward}
                onClaimDailyBonus={enhancements.claimDailyBonus}
              />
            )}

            {/* Daily challenges */}
            {enhancements.dailyChallenges && (
              <DailyChallengesPanel
                challengesState={enhancements.dailyChallenges}
                onClaimAllBonus={enhancements.claimAllCompletedBonus}
              />
            )}

            <NPCActivityFeed />
            <PlayerStatsPanel />
          </div>
        </div>
      </div>

      {/* Auction Tutorial - Level 4 */}
      {currentLevel === 4 && enhancements.auctionTutorial && enhancements.auctionTutorial.isActive && (
        <AuctionTutorial
          tutorialState={enhancements.auctionTutorial}
          onUpdateState={enhancements.setAuctionTutorial}
          onPlaceBid={(maxPrice, totalSpend) => {
            placeBid(1, {
              id: `tutorial-bid-${Date.now()}`,
              bidderId: 'player',
              bidderName: player.characterName || 'Player',
              maxPrice,
              totalSpend,
            });
          }}
          onAdvanceBlock={advanceAuctionBlock}
          onComplete={() => enhancements.setAuctionTutorial(prev => prev ? { ...prev, completed: true, isActive: false } : prev)}
          onDismiss={() => enhancements.setAuctionTutorial(prev => prev ? { ...prev, isActive: false } : prev)}
        />
      )}

      {/* Badge notifications */}
      <BadgeNotification badge={newBadge} onDismiss={dismissBadge} />

      {/* Level Up Modal */}
      <LevelUpModal newLevel={levelUpNotification} onClose={dismissLevelUp} />

      {/* NFT Claim Modal */}
      <NFTClaimModal
        open={showNFTModal}
        onClose={() => {
          setShowNFTModal(false);
          setAutoShowMintWidget(false);
        }}
        isAuthenticated={!!user}
        playerLevel={player.level}
        playerXP={player.xp}
        autoShowMintWidget={autoShowMintWidget}
      />

      {/* Contextual tutorial tips */}
      {activeTip && (
        <ContextualTip tip={activeTip} onDismiss={dismissTip} />
      )}

      {/* Onboarding Tutorial */}
      {showOnboarding && (
        <OnboardingTutorial
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {/* Login Prompt Modal */}
      <LoginPromptModal
        open={loginPromptReason !== null}
        onClose={() => setLoginPromptReason(null)}
        onLogin={handleLoginPromptLogin}
        reason={loginPromptReason || 'level_up'}
      />

      {/* Decorative elements */}
      <div className="fixed bottom-4 left-4 text-6xl opacity-20 animate-float pointer-events-none">
        🥭
      </div>
      <div className="fixed top-1/4 right-8 text-5xl opacity-20 animate-float pointer-events-none" style={{ animationDelay: '0.5s' }}>
        🍋
      </div>
      <div className="fixed bottom-1/3 right-1/4 text-4xl opacity-20 animate-float pointer-events-none" style={{ animationDelay: '1s' }}>
        🍉
      </div>
    </div>
  );
};

const MercadoLPGamePage = () => {
  const BASE_URL = 'https://defimexico.org';
  const ogImage = `${BASE_URL}/Cover.png`;
  const pageUrl = `${BASE_URL}/academia/juego/mercado-lp`;

  return (
    <>
      <Helmet>
        {/* Primary Meta Tags */}
        <title>Mercado LP - Aprende DeFi Jugando | DeFi México</title>
        <meta name="title" content="Mercado LP - Aprende DeFi Jugando | DeFi México" />
        <meta name="description" content="Aprende sobre liquidez, AMMs y trading DeFi de forma interactiva con Mercado LP. Un minijuego educativo gratuito para entender las finanzas descentralizadas." />

        {/* Open Graph / Facebook / LinkedIn */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content="Mercado LP - Aprende DeFi Jugando" />
        <meta property="og:description" content="Aprende sobre liquidez, AMMs y trading DeFi de forma interactiva con Mercado LP. Un minijuego educativo gratuito para entender las finanzas descentralizadas." />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:secure_url" content={ogImage} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Mercado LP - Minijuego educativo de DeFi" />
        <meta property="og:site_name" content="DeFi México" />
        <meta property="og:locale" content="es_MX" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content={pageUrl} />
        <meta name="twitter:title" content="Mercado LP - Aprende DeFi Jugando" />
        <meta name="twitter:description" content="Aprende sobre liquidez, AMMs y trading DeFi de forma interactiva. Un minijuego educativo gratuito." />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content="Mercado LP - Minijuego educativo de DeFi" />
        <meta name="twitter:site" content="@DeFiMexico" />
        <meta name="twitter:creator" content="@DeFiMexico" />

        {/* Telegram / WhatsApp optimization */}
        <link rel="canonical" href={pageUrl} />
      </Helmet>
      <GameProvider>
        <GameContent />
      </GameProvider>
    </>
  );
};

export default MercadoLPGamePage;
