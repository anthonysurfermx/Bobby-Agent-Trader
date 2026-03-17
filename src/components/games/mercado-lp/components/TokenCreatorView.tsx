import { useState } from 'react';
import { useGame } from '@/components/games/mercado-lp/contexts/GameContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ConfettiBurst } from './ConfettiBurst';
import { GrowingPlant } from './GrowingPlant';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMercadoSound } from '@/hooks/useMercadoSound';
import {
  GraduationCapIcon,
  LightbulbIcon,
  FarmerIcon,
  SproutIcon,
  DropIcon,
  QuestionIcon,
  TokenIcon,
  PixelMoney,
} from './icons/GameIcons';
import { MissionsCard } from './MissionsCard';
import { useTranslation } from 'react-i18next';

const FRUIT_EMOJIS = ['🍎', '🍊', '🍇', '🥥', '🍓', '🥝', '🍑', '🍍', '🫐', '🍒', '🥭', '🍌', '🍉', '🍋'];

export const TokenCreatorView = () => {
  const { tokens, createToken, createPool, player } = useGame();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [emoji, setEmoji] = useState(FRUIT_EMOJIS[0]);
  const [color, setColor] = useState('#f59e0b');
  const [pairToken, setPairToken] = useState('');
  const [amountNew, setAmountNew] = useState('');
  const [amountPair, setAmountPair] = useState('');
  const [confettiKey, setConfettiKey] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [plantStage, setPlantStage] = useState<'seed' | 'sprout' | 'growing' | 'mature'>('seed');
  const [showPlantAnimation, setShowPlantAnimation] = useState(false);
  const { t } = useTranslation();

  // Sound effects
  const { play: playCreateTokenSound } = useMercadoSound('create-token');

  // Calcular progreso del formulario
  const getPlantStage = (): typeof plantStage => {
    if (name && symbol && emoji) {
      if (pairToken && amountNew && amountPair) {
        return 'mature';
      }
      if (pairToken) {
        return 'growing';
      }
      return 'sprout';
    }
    return 'seed';
  };

  const currentStage = showPlantAnimation ? plantStage : getPlantStage();

  const handleCreateToken = () => {
    if (!name || !symbol || !pairToken || !amountNew || !amountPair) {
      toast.error(t('mercadoLP.token.errors.missing'));
      return;
    }

    const newTokenAmount = parseFloat(amountNew);
    const pairTokenAmount = parseFloat(amountPair);

    if (isNaN(newTokenAmount) || isNaN(pairTokenAmount) || newTokenAmount <= 0 || pairTokenAmount <= 0) {
      toast.error(t('mercadoLP.token.errors.amount'));
      return;
    }

    const pairedToken = tokens.find(t => t.id === pairToken);
    if (!pairedToken) return;

    if ((player.inventory[pairToken] || 0) < pairTokenAmount) {
      toast.error(t('mercadoLP.token.errors.balance', { symbol: pairedToken.symbol }));
      return;
    }

    // Crear el token
    const newToken = createToken({
      name,
      symbol: symbol.toUpperCase(),
      emoji,
      color,
      isBaseToken: false,
    });

    // Crear el pool inicial
    const wasFirstToken = isFirstToken;
    createPool(newToken, pairedToken, newTokenAmount, pairTokenAmount);

    // Play sound
    playCreateTokenSound();

    // Feedback educativo mejorado
    if (wasFirstToken) {
      toast.success(t('mercadoLP.token.toasts.first', { price: estimatedPrice, symbol: pairedToken.symbol }), { duration: 4500 });
    } else {
      toast.success(t('mercadoLP.token.toasts.created', { name }));
    }

    setConfettiKey(prev => prev + 1);

    // Animación de crecimiento
    setShowPlantAnimation(true);
    setPlantStage('mature');

    setTimeout(() => {
      setShowPlantAnimation(false);
      // Reset form
      setName('');
      setSymbol('');
      setAmountNew('');
      setAmountPair('');
      setPlantStage('seed');
    }, 3000);
  };

  const estimatedPrice = amountNew && amountPair
    ? (parseFloat(amountPair) / parseFloat(amountNew)).toFixed(6)
    : '0';

  const canPlant = name && symbol && pairToken && amountNew && amountPair;

  const userCreatedTokens = tokens.filter(t => !t.isBaseToken && t.id !== 'mango' && t.id !== 'limon' && t.id !== 'sandia' && t.id !== 'platano');
  const isFirstToken = userCreatedTokens.length === 0;

  return (
    <div className="space-y-4">
      <ConfettiBurst trigger={confettiKey} />

      {/* Banner educativo del nivel */}
      {isFirstToken && (
        <Card className="pixel-card p-4 bg-gradient-to-r from-primary/10 to-emerald-500/5 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <GraduationCapIcon size={24} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-base">{t('mercadoLP.token.banner.title')}</h3>
              <p className="text-sm text-foreground/90 leading-relaxed">
                {t('mercadoLP.token.banner.body')}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card/60 px-3 py-2 rounded">
                <LightbulbIcon size={14} className="text-amber-500 shrink-0" />
                <span>{t('mercadoLP.token.banner.concept')}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <MissionsCard />

      <div className="pixel-card p-3 sm:p-4 md:p-5 bg-card border rounded-lg shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide">{t('mercadoLP.token.labels.title')}</p>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2 truncate">
              <FarmerIcon size={18} className="text-primary shrink-0" />
              <span className="truncate">{t('mercadoLP.token.labels.subtitle')}</span>
            </h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="pixel-button h-8 w-8 shrink-0 hidden sm:inline-flex"
            title={t('mercadoLP.token.labels.modal.title')}
            onClick={() => setShowHelpModal(true)}
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Visual de la planta creciendo */}
          <GrowingPlant
            emoji={emoji}
            stage={currentStage}
            name={name || 'Tu cultivo'}
            symbol={symbol || 'SYM'}
            showAnimation={showPlantAnimation}
          />

          <div className="grid md:grid-cols-2 gap-4">
            {/* Paso 1: Información básica */}
            <Card className="pixel-card p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <SproutIcon size={18} className="text-emerald-500" />
                {t('mercadoLP.token.labels.step1')}
              </h3>

              <div>
                <Label className="text-xs text-muted-foreground">{t('mercadoLP.token.labels.name')}</Label>
                <Input
                  placeholder={t('mercadoLP.token.labels.namePh')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pixel-border"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">{t('mercadoLP.token.labels.symbol')}</Label>
                <Input
                  placeholder={t('mercadoLP.token.labels.symbolPh')}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="pixel-border"
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">{t('mercadoLP.token.labels.emoji')}</Label>
                <Select value={emoji} onValueChange={setEmoji}>
                  <SelectTrigger className="pixel-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRUIT_EMOJIS.map(e => (
                      <SelectItem key={e} value={e}>
                        <span className="text-2xl">{e}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Paso 2: Precio inicial */}
            <Card className="pixel-card p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <DropIcon size={18} className="text-blue-500" />
                {t('mercadoLP.token.labels.step2')}
              </h3>

              <div>
                <Label className="text-xs text-muted-foreground">{t('mercadoLP.token.labels.pair')}</Label>
                <Select value={pairToken} onValueChange={setPairToken}>
                  <SelectTrigger className="pixel-border">
                    <SelectValue placeholder={t('mercadoLP.token.labels.pairPh')} />
                  </SelectTrigger>
                  <SelectContent>
                    {tokens.filter(t => t.isBaseToken).map(token => (
                      <SelectItem key={token.id} value={token.id}>
                        <span className="flex items-center gap-1">
                          <TokenIcon tokenId={token.id} size={16} /> {token.symbol}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('mercadoLP.token.labels.amountNew', { emoji, symbol: symbol || 'token' })}
                </Label>
                <Input
                  type="number"
                  placeholder="100"
                  value={amountNew}
                  onChange={(e) => setAmountNew(e.target.value)}
                  className="pixel-border"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('mercadoLP.token.labels.mintHint', { symbol: symbol || 'tokens' })}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  {t('mercadoLP.token.labels.amountPair', {
                    emoji: pairToken ? tokens.find(t => t.id === pairToken)?.emoji : '💵',
                  })}
                </Label>
                <Input
                  type="number"
                  placeholder="100"
                  value={amountPair}
                  onChange={(e) => setAmountPair(e.target.value)}
                  className="pixel-border"
                />
                {pairToken && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('mercadoLP.token.labels.have', { amount: (player.inventory[pairToken] || 0).toFixed(2) })}
                  </p>
                )}
              </div>

              {amountNew && amountPair && pairToken && (
                <div className="pixel-card bg-muted p-2 text-xs">
                  <p className="font-semibold">{t('mercadoLP.token.labels.price')}</p>
                  <p>
                    1 {symbol} = {estimatedPrice} {tokens.find(t => t.id === pairToken)?.symbol}
                  </p>
                </div>
              )}
            </Card>
          </div>

          <Button
            onClick={handleCreateToken}
            className="w-full pixel-button text-sm sm:text-lg"
            size="lg"
            disabled={!canPlant}
          >
            {canPlant ? t('mercadoLP.token.labels.action.go') : t('mercadoLP.token.labels.action.fill')}
          </Button>
        </div>
      </div>

      <Card className="pixel-card p-4 bg-card">
        <h3 className="font-bold mb-2 flex items-center gap-2">
          <LightbulbIcon size={18} className="text-amber-500" />
          {t('mercadoLP.token.labels.tipTitle')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('mercadoLP.token.labels.tipBody')}
        </p>
      </Card>

      {/* Galería de tus cultivos */}
      {tokens.filter(t => !t.isBaseToken).length > 0 && (
        <Card className="p-4 sm:p-5 bg-transparent border-none shadow-none">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <FarmerIcon size={18} className="text-emerald-600" />
            {t('mercadoLP.token.labels.gallery')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {tokens.filter(t => !t.isBaseToken).map(token => (
              <div key={token.id} className="pixel-card bg-card/70 p-3 text-center">
                <div className="flex justify-center mb-2">
                  <TokenIcon tokenId={token.id} size={40} />
                </div>
                <p className="text-xs font-bold">{token.name}</p>
                <p className="text-xs text-muted-foreground">{token.symbol}</p>
                <div className="mt-2 text-xs">
                  <span className="pixel-card bg-card/60 px-2 py-1">
                    {(player.inventory[token.id] || 0).toFixed(0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="pixel-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QuestionIcon size={20} className="text-blue-500" />
              {t('mercadoLP.token.labels.modal.title')}
            </DialogTitle>
            <DialogDescription className="text-sm space-y-2">
              <p>{t('mercadoLP.token.labels.modal.body1')}</p>
              <ul className="list-disc list-inside space-y-1">
                {(t('mercadoLP.token.labels.modal.list', { returnObjects: true }) as string[]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                {t('mercadoLP.token.labels.modal.note')}
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button className="pixel-button" onClick={() => setShowHelpModal(false)}>
              {t('mercadoLP.token.labels.modal.ok')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
