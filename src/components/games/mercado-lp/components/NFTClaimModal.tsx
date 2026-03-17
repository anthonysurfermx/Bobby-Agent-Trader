import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNavigate } from 'react-router-dom';
import { ConfettiBurst } from './ConfettiBurst';
import { Award, Lock, Wallet, User, Twitter, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Bueno Art Widget ID
const BUENO_WIDGET_ID = 'qrKviaP2N56V0lqJZH2l4';

// NFT Contract on Base
const NFT_CONTRACT_ADDRESS = '0xA03DA0BAab286043aD01f22a1F69b1D46b0E2EF7';

interface NFTClaimModalProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  playerLevel: number;
  playerXP: number;
  autoShowMintWidget?: boolean;
}

type ModalStep = 'info' | 'profile' | 'mint';

export const NFTClaimModal = ({
  open,
  onClose,
  isAuthenticated,
  playerLevel,
  playerXP,
  autoShowMintWidget = false
}: NFTClaimModalProps) => {
  const navigate = useNavigate();
  const [confettiKey, setConfettiKey] = useState(0);
  const [currentStep, setCurrentStep] = useState<ModalStep>('info');
  const [widgetReady, setWidgetReady] = useState(false);
  const widgetContainerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Profile form state
  const [nickname, setNickname] = useState('');
  const [twitterHandle, setTwitterHandle] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Requisitos para claim NFT
  const hasCompletedLevel4 = playerLevel >= 4;
  const hasMinimumXP = playerXP >= 1000;
  const canClaimNFT = hasCompletedLevel4 && hasMinimumXP;

  // Load existing profile on open
  useEffect(() => {
    if (open && isAuthenticated) {
      loadExistingProfile();
    }
  }, [open, isAuthenticated]);

  // Auto-show mint widget when returning from login
  useEffect(() => {
    if (open && autoShowMintWidget && isAuthenticated && canClaimNFT && profileSaved) {
      setCurrentStep('mint');
    }
  }, [open, autoShowMintWidget, isAuthenticated, canClaimNFT, profileSaved]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCurrentStep('info');
      setWidgetReady(false);
    }
  }, [open]);

  // Initialize widget using iframe approach when showing mint view
  useEffect(() => {
    if (currentStep === 'mint' && widgetContainerRef.current) {
      widgetContainerRef.current.innerHTML = '';
      setWidgetReady(false);

      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '600px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '12px';
      iframe.style.background = 'transparent';
      iframe.allow = 'clipboard-write; web-share';

      iframe.srcdoc = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://app.bueno.art/widget/v3/styles.css">
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 8px;
              background: #f8f9fa;
              font-family: system-ui, -apple-system, sans-serif;
              min-height: 100%;
              border-radius: 12px;
            }
            [data-bueno-mint] {
              width: 100%;
              min-height: 550px;
              background: #ffffff;
              border-radius: 12px;
              padding: 16px;
            }
            [data-bueno-mint] * {
              color: #1a1a1a !important;
            }
            [data-bueno-mint] button {
              color: #ffffff !important;
            }
          </style>
        </head>
        <body>
          <div data-bueno-mint="${BUENO_WIDGET_ID}"></div>
          <script type="module" crossorigin src="https://app.bueno.art/widget/v3/index.js"></script>
        </body>
        </html>
      `;

      iframe.onload = () => {
        setWidgetReady(true);
      };

      iframeRef.current = iframe;
      widgetContainerRef.current.appendChild(iframe);
      setConfettiKey(prev => prev + 1);
    }
  }, [currentStep]);

  // Cleanup iframe when modal closes or widget hides
  useEffect(() => {
    if (currentStep !== 'mint' && iframeRef.current) {
      iframeRef.current = null;
    }
  }, [currentStep]);

  const loadExistingProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('nft_gallery_profiles')
        .select('nickname, twitter_handle')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setNickname(data.nickname || '');
        setTwitterHandle(data.twitter_handle || '');
        setProfileSaved(true);
      }
    } catch (error) {
      // No profile yet, that's fine
      console.log('No existing profile found');
    }
  };

  const handleSaveProfile = async () => {
    if (!nickname.trim()) {
      toast.error('Por favor ingresa un nickname');
      return;
    }

    if (nickname.length < 2 || nickname.length > 20) {
      toast.error('El nickname debe tener entre 2 y 20 caracteres');
      return;
    }

    setIsSavingProfile(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Debes iniciar sesión');
        return;
      }

      // Clean twitter handle
      const cleanTwitter = twitterHandle.replace('@', '').trim();

      const { error } = await supabase
        .from('nft_gallery_profiles')
        .upsert({
          user_id: user.id,
          nickname: nickname.trim(),
          twitter_handle: cleanTwitter || null,
          player_level: playerLevel,
          player_xp: playerXP,
          contract_address: NFT_CONTRACT_ADDRESS,
          chain: 'base',
          minted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,contract_address'
        });

      if (error) throw error;

      setProfileSaved(true);
      toast.success('¡Perfil guardado! Ahora puedes mintear tu NFT');
      setCurrentStep('mint');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Error al guardar perfil');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleLogin = () => {
    localStorage.setItem('mercado_lp_pending_nft_claim', 'true');
    localStorage.setItem('mercado_lp_return_url', window.location.pathname);
    navigate('/login');
  };

  const handleStartClaim = () => {
    if (!isAuthenticated) {
      handleLogin();
      return;
    }

    if (profileSaved) {
      setCurrentStep('mint');
    } else {
      setCurrentStep('profile');
    }
  };

  const handleBack = () => {
    if (currentStep === 'mint') {
      setCurrentStep('profile');
    } else if (currentStep === 'profile') {
      setCurrentStep('info');
    }
  };

  return (
    <>
      <ConfettiBurst trigger={confettiKey} />
      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setCurrentStep('info');
        }
        onClose();
      }}>
        <DialogContent className={currentStep === 'mint' ? 'max-w-xl max-h-[90vh] overflow-y-auto' : 'max-w-md'}>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl mb-4">
              {currentStep === 'mint'
                ? '🎨 Mintea tu NFT'
                : currentStep === 'profile'
                  ? '👤 Tu Perfil de Galería'
                  : canClaimNFT
                    ? '🎉 ¡Reclama tu NFT!'
                    : '🔒 NFT Bloqueado'}
            </DialogTitle>
          </DialogHeader>

          {/* Step: Mint Widget */}
          {currentStep === 'mint' && (
            <div className="space-y-4">
              {/* Show nickname */}
              <div className="bg-muted/50 p-3 rounded-lg border text-center">
                <p className="text-sm text-muted-foreground">Minteando como</p>
                <p className="font-bold text-lg">{nickname}</p>
                {twitterHandle && (
                  <p className="text-xs text-muted-foreground">@{twitterHandle}</p>
                )}
              </div>

              {/* Bueno Art Widget Container */}
              <div className="relative">
                {!widgetReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-xl min-h-[300px]">
                    <div className="text-center space-y-3">
                      <div className="text-4xl animate-bounce">🎨</div>
                      <p className="text-sm text-muted-foreground">Cargando widget de minting...</p>
                    </div>
                  </div>
                )}
                <div ref={widgetContainerRef} className="w-full" />
              </div>

              {/* Instructions */}
              <div className="bg-muted/50 p-3 text-xs text-muted-foreground space-y-2 rounded-lg border">
                <p className="font-semibold text-foreground">📋 Instrucciones:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Conecta tu wallet (MetaMask, WalletConnect, etc.)</li>
                  <li>El NFT es <strong>gratuito</strong> - solo pagas el gas</li>
                  <li>Una vez minteado, aparecerás en la galería</li>
                </ol>
              </div>

              <Button onClick={handleBack} variant="outline" size="sm" className="w-full">
                ← Volver
              </Button>
            </div>
          )}

          {/* Step: Profile Form */}
          {currentStep === 'profile' && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground text-center">
                Tu nombre aparecerá en la galería pública de NFTs de DeFi México
              </p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nickname" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Nickname *
                  </Label>
                  <Input
                    id="nickname"
                    placeholder="Tu nombre o apodo"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={20}
                    className="text-lg"
                  />
                  <p className="text-xs text-muted-foreground">
                    {nickname.length}/20 caracteres
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter" className="flex items-center gap-2">
                    <Twitter className="w-4 h-4" />
                    Twitter/X (opcional)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input
                      id="twitter"
                      placeholder="tu_usuario"
                      value={twitterHandle}
                      onChange={(e) => setTwitterHandle(e.target.value.replace('@', ''))}
                      className="pl-8"
                      maxLength={15}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 p-3 rounded-lg border text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">🎨 Vista previa en galería:</p>
                <div className="flex items-center gap-3 bg-background p-2 rounded">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-2xl">
                    🏆
                  </div>
                  <div>
                    <p className="font-bold">{nickname || 'Tu Nickname'}</p>
                    {twitterHandle && <p className="text-xs">@{twitterHandle}</p>}
                    <p className="text-xs text-green-600">Nivel {playerLevel} · {playerXP} XP</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  onClick={handleSaveProfile}
                  disabled={!nickname.trim() || isSavingProfile}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  size="lg"
                >
                  {isSavingProfile ? (
                    'Guardando...'
                  ) : (
                    <>
                      Continuar al Minting
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                <Button onClick={handleBack} variant="ghost" size="sm" className="w-full">
                  ← Volver
                </Button>
              </div>
            </div>
          )}

          {/* Step: Info View */}
          {currentStep === 'info' && (
            <div className="space-y-6">
              {/* NFT Preview */}
              <div className="relative">
                <div className={`p-6 text-center rounded-lg border ${
                  canClaimNFT
                    ? 'bg-gradient-to-br from-purple-100 via-pink-100 to-yellow-100 dark:from-purple-900/30 dark:via-pink-900/30 dark:to-yellow-900/30'
                    : 'bg-muted opacity-60'
                }`}>
                  <div className="text-8xl mb-4 animate-pulse">
                    {canClaimNFT ? '🏆' : '🔒'}
                  </div>
                  <h3 className="font-bold text-lg mb-2">
                    Mercado LP Maestro
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    NFT Educativo - Nivel 4 Completado
                  </p>
                </div>

                {!canClaimNFT && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-background/90 p-4 text-center rounded-lg border">
                      <Lock className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-bold">Completa el Nivel 4</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Requirements */}
              <div className="bg-muted p-4 space-y-3 rounded-lg border">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Requisitos para el NFT
                </h4>

                <div className="space-y-2 text-sm">
                  <div className={`flex items-center gap-2 ${
                    hasCompletedLevel4 ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {hasCompletedLevel4 ? '✅' : '⭕'}
                    <span>Completar Nivel 4: Subastero</span>
                  </div>

                  <div className={`flex items-center gap-2 ${
                    hasMinimumXP ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {hasMinimumXP ? '✅' : '⭕'}
                    <span>Alcanzar 1000 XP (Tienes: {playerXP})</span>
                  </div>

                  <div className={`flex items-center gap-2 ${
                    isAuthenticated ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {isAuthenticated ? '✅' : '🔐'}
                    <span>
                      {isAuthenticated ? 'Cuenta conectada' : 'Iniciar sesión para reclamar'}
                    </span>
                  </div>
                </div>
              </div>

              {/* NFT Details */}
              {canClaimNFT && (
                <div className="text-center text-xs text-muted-foreground space-y-2">
                  <p>
                    Este NFT certifica que has completado todos los niveles educativos
                    de Mercado LP y dominas los conceptos básicos de DeFi.
                  </p>
                  <div className="flex justify-center gap-3 text-xs">
                    <span className="bg-primary/10 px-2 py-1 rounded border">
                      🎓 Educativo
                    </span>
                    <span className="bg-muted/50 px-2 py-1 rounded border">
                      🏆 Achievement
                    </span>
                    <span className="bg-card px-2 py-1 rounded border">
                      ⛓️ On-chain
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                {canClaimNFT ? (
                  <>
                    <Button
                      onClick={handleStartClaim}
                      className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      size="lg"
                    >
                      {isAuthenticated ? (
                        <>
                          <Wallet className="w-4 h-4 mr-2" />
                          {profileSaved ? 'Continuar al Minting' : 'Crear Perfil y Mintear'}
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" />
                          Iniciar Sesión para Reclamar
                        </>
                      )}
                    </Button>

                    {!isAuthenticated && (
                      <p className="text-xs text-center text-muted-foreground">
                        Necesitas una cuenta para reclamar tu NFT educativo
                      </p>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={onClose}
                    className="w-full"
                    variant="secondary"
                    size="lg"
                  >
                    Continuar Jugando
                  </Button>
                )}
              </div>

              <Button onClick={onClose} variant="ghost" size="sm" className="w-full">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
