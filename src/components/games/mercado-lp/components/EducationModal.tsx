import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import {
  PixelGraduationCap,
  PixelScale,
  PixelMango,
  PixelLemon,
  PixelTrendingUp,
  PixelStore,
  PixelSparkles,
  TargetIcon,
  PixelCheck,
} from './icons/GameIcons';

interface EducationModalProps {
  open: boolean;
  onClose: () => void;
}

export const EducationModal = ({ open, onClose }: EducationModalProps) => {
  const { t } = useTranslation();
  const [dragMangos, setDragMangos] = useState(2);
  const [buySize, setBuySize] = useState(5);

  const basculaLesson = useMemo(() => {
    const initialA = 10;
    const initialB = 100;
    const newA = Math.max(0.5, initialA - dragMangos);
    const k = initialA * initialB;
    const newB = k / newA;
    const priceBefore = initialB / initialA;
    const priceAfter = newB / newA;
    return { initialA, initialB, newA, newB, priceBefore, priceAfter, k };
  }, [dragMangos]);

  const impactLesson = useMemo(() => {
    const reserveA = 100;
    const reserveB = 1000;
    const amountIn = buySize;
    const amountInWithFee = amountIn * (1 - 0.003);
    const amountOut = (reserveB * amountInWithFee) / (reserveA + amountInWithFee);
    const priceBefore = reserveB / reserveA;
    const priceAfter = (reserveB - amountOut) / (reserveA + amountInWithFee);
    const impact = ((priceAfter - priceBefore) / priceBefore) * 100 * -1;
    return { amountOut, priceBefore, priceAfter, impact };
  }, [buySize]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <PixelGraduationCap size={28} className="text-primary" /> {t('mercadoLP.education.title', { defaultValue: 'La Escuelita del Tianguis' })}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
                <PixelScale size={20} className="text-primary" /> {t('mercadoLP.education.magicPot.title', { defaultValue: 'La olla mágica (x·y=k)' })}
              </h3>
              <div className="bg-muted p-3 space-y-2 rounded-lg border">
                <p>{t('mercadoLP.education.magicPot.description', { defaultValue: 'Mueve el deslizador: quita mangos de la olla y mira cómo sube el precio.' })}</p>
                <div className="flex items-center gap-3">
                  <PixelMango size={24} />
                  <Slider
                    value={[dragMangos]}
                    min={0}
                    max={8}
                    step={1}
                    onValueChange={(v) => setDragMangos(v[0])}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">{dragMangos} {t('mercadoLP.education.units.mangos', { defaultValue: 'mangos' })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Card className="bg-card/80 p-2">
                    <p className="font-semibold">{t('mercadoLP.education.labels.before', { defaultValue: 'Antes' })}</p>
                    <p className="flex items-center gap-1"><PixelMango size={14} /> {basculaLesson.initialA} · <PixelLemon size={14} /> {basculaLesson.initialB}</p>
                    <p>k = {basculaLesson.k}</p>
                    <p className="flex items-center gap-1">{t('mercadoLP.education.labels.price', { defaultValue: 'Precio' })}: 1 <PixelMango size={12} /> = {basculaLesson.priceBefore.toFixed(2)} <PixelLemon size={12} /></p>
                  </Card>
                  <Card className="bg-card p-2">
                    <p className="font-semibold">{t('mercadoLP.education.labels.after', { defaultValue: 'Después' })}</p>
                    <p className="flex items-center gap-1"><PixelMango size={14} /> {basculaLesson.newA.toFixed(1)} · <PixelLemon size={14} /> {basculaLesson.newB.toFixed(1)}</p>
                    <p>k = {basculaLesson.k.toFixed(1)} ({t('mercadoLP.education.labels.same', { defaultValue: 'igual' })})</p>
                    <p className="flex items-center gap-1">{t('mercadoLP.education.labels.price', { defaultValue: 'Precio' })}: 1 <PixelMango size={12} /> = {basculaLesson.priceAfter.toFixed(2)} <PixelLemon size={12} /></p>
                  </Card>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('mercadoLP.education.magicPot.explanation', { defaultValue: 'Al haber menos mangos, cada mango "vale" más limones. Esa es la fórmula x·y=k en acción.' })}
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold text-secondary mb-2 flex items-center gap-2">
                <PixelTrendingUp size={20} className="text-secondary" /> {t('mercadoLP.education.slippage.title', { defaultValue: 'Impacto de precio (slippage)' })}
              </h3>
              <div className="bg-muted p-3 space-y-2 rounded-lg border">
                <p>{t('mercadoLP.education.slippage.description', { defaultValue: 'Si compras mucho de golpe, tú mismo subes el precio. Ajusta el tamaño de compra de mangos:' })}</p>
                <div className="flex items-center gap-3">
                  <PixelMango size={24} />
                  <Slider
                    value={[buySize]}
                    min={1}
                    max={50}
                    step={1}
                    onValueChange={(v) => setBuySize(v[0])}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">{buySize} {t('mercadoLP.education.units.mangos', { defaultValue: 'mangos' })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Card className="bg-card/80 p-2">
                    <p className="font-semibold">{t('mercadoLP.education.slippage.avgPrice', { defaultValue: 'Precio promedio' })}</p>
                    <p className="flex items-center gap-1">{t('mercadoLP.education.labels.before', { defaultValue: 'Antes' })}: {impactLesson.priceBefore.toFixed(2)} <PixelLemon size={12} /></p>
                    <p className="flex items-center gap-1">{t('mercadoLP.education.labels.after', { defaultValue: 'Después' })}: {impactLesson.priceAfter.toFixed(2)} <PixelLemon size={12} /></p>
                  </Card>
                  <Card className="bg-card p-2">
                    <p className="font-semibold">{t('mercadoLP.education.slippage.impact', { defaultValue: 'Impacto' })}</p>
                    <p>{impactLesson.impact.toFixed(1)}% <span className={impactLesson.impact < 6 ? 'text-green-500' : impactLesson.impact < 12 ? 'text-yellow-500' : 'text-red-500'}>●</span></p>
                    <p className="text-[11px] text-muted-foreground">{t('mercadoLP.education.slippage.receive', { amount: impactLesson.amountOut.toFixed(1), defaultValue: `Recibes ~${impactLesson.amountOut.toFixed(1)} limones.` })}</p>
                  </Card>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('mercadoLP.education.slippage.tip', { defaultValue: 'Tip: en el mercado real, los grandes reparten su orden en partes para bajar el impacto.' })}
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold text-primary mb-2 flex items-center gap-2">
                <PixelStore size={20} className="text-primary" /> {t('mercadoLP.education.liquidity.title', { defaultValue: 'Liquidez y propinas' })}
              </h3>
              <p className="leading-relaxed">
                {t('mercadoLP.education.liquidity.description', { defaultValue: 'Pones dos frutas en la olla y ganas una parte de cada propina. Tu porcentaje define cuánta propina recibes.' })}
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>{t('mercadoLP.education.liquidity.point1', { defaultValue: 'Deposita ambas frutas en el ratio actual' })}</li>
                <li>{t('mercadoLP.education.liquidity.point2', { defaultValue: 'Ganas fees de cada swap según tu porcentaje' })}</li>
                <li>{t('mercadoLP.education.liquidity.point3', { defaultValue: 'Si el precio se mueve, cambia tu mezcla (IL)' })}</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-game-purple mb-2 flex items-center gap-2">
                <PixelSparkles size={20} className="text-game-purple" /> {t('mercadoLP.education.createToken.title', { defaultValue: 'Crea tu fruta y su mercado' })}
              </h3>
              <p className="leading-relaxed">
                {t('mercadoLP.education.createToken.description', { defaultValue: 'Inventar fruta no basta: debes abrir su olla con liquidez inicial. El precio de arranque lo pones tú; después manda el mercado.' })}
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>{t('mercadoLP.education.createToken.point1', { defaultValue: 'Define ícono, símbolo y color' })}</li>
                <li>{t('mercadoLP.education.createToken.point2', { defaultValue: 'Empareja con otra fruta y deposita ambas' })}</li>
                <li>{t('mercadoLP.education.createToken.point3', { defaultValue: 'El depósito inicial fija el precio de arranque' })}</li>
              </ul>
            </section>

            <section className="bg-primary/10 p-4 rounded">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2"><TargetIcon size={20} /> {t('mercadoLP.education.quickTips.title', { defaultValue: 'Tips rápidos' })}</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><PixelCheck size={16} className="text-green-500 flex-shrink-0" /> {t('mercadoLP.education.quickTips.tip1', { defaultValue: 'Siempre mira el impacto antes de confirmar' })}</li>
                <li className="flex items-center gap-2"><PixelCheck size={16} className="text-green-500 flex-shrink-0" /> {t('mercadoLP.education.quickTips.tip2', { defaultValue: 'Divide swaps grandes en varios pequeños' })}</li>
                <li className="flex items-center gap-2"><PixelCheck size={16} className="text-green-500 flex-shrink-0" /> {t('mercadoLP.education.quickTips.tip3', { defaultValue: 'LP: elige rangos y hooks pensando en tu riesgo' })}</li>
                <li className="flex items-center gap-2"><PixelCheck size={16} className="text-green-500 flex-shrink-0" /> {t('mercadoLP.education.quickTips.tip4', { defaultValue: 'Crea token + pool; sin olla, nadie puede comprar' })}</li>
                <li className="text-[11px] text-muted-foreground">{t('mercadoLP.education.quickTips.more', { defaultValue: 'Más: v4.uniswap.org · Auditorías v4-core en GitHub' })}</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
