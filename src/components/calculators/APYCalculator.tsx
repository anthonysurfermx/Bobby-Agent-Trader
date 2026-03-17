import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Calculator, 
  TrendingUp, 
  DollarSign, 
  Calendar,
  Info
} from 'lucide-react';

interface APYCalculatorProps {
  defaultAPY?: number;
  defaultCurrency?: string;
  onCalculate?: (result: CalculationResult) => void;
}

export interface CalculationResult {
  initialAmount: number;
  finalAmount: number;
  earnings: number;
  apy: number;
  period: number;
  currency: string;
  dailyEarnings: number;
  monthlyEarnings: number;
  yearlyEarnings: number;
}

const APYCalculator: React.FC<APYCalculatorProps> = ({ 
  defaultAPY = 10, 
  defaultCurrency = 'MXN',
  onCalculate 
}) => {
  const [amount, setAmount] = useState<string>('10000');
  const [apy, setApy] = useState<number[]>([defaultAPY]);
  const [period, setPeriod] = useState<string>('12'); // meses
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  const [compoundFrequency, setCompoundFrequency] = useState<string>('daily');

  // Tasas de cambio aproximadas (en producción usar API real)
  const exchangeRates: Record<string, number> = {
    MXN: 1,
    USD: 17.50,
    USDC: 17.50,
    USDT: 17.50,
    DAI: 17.50,
    ETH: 45000,
    BTC: 900000
  };

  // Calcular rendimientos
  const calculation = useMemo<CalculationResult>(() => {
    const principal = parseFloat(amount) || 0;
    const rate = apy[0] / 100;
    const months = parseInt(period) || 12;
    const days = months * 30;
    
    // Frecuencia de capitalización
    let n = 365; // daily por defecto
    switch (compoundFrequency) {
      case 'monthly': n = 12; break;
      case 'quarterly': n = 4; break;
      case 'yearly': n = 1; break;
    }
    
    // Fórmula de interés compuesto: A = P(1 + r/n)^(nt)
    const timeInYears = months / 12;
    const finalAmount = principal * Math.pow(1 + rate / n, n * timeInYears);
    const earnings = finalAmount - principal;
    
    // Cálculos adicionales
    const dailyEarnings = earnings / days;
    const monthlyEarnings = earnings / months;
    const yearlyEarnings = principal * rate; // Simplificado
    
    const result = {
      initialAmount: principal,
      finalAmount,
      earnings,
      apy: apy[0],
      period: months,
      currency,
      dailyEarnings,
      monthlyEarnings,
      yearlyEarnings
    };
    
    if (onCalculate) {
      onCalculate(result);
    }
    
    return result;
  }, [amount, apy, period, currency, compoundFrequency, onCalculate]);

  // Formatear moneda
  const formatCurrency = (value: number, curr: string = currency): string => {
    if (curr === 'MXN') {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
      }).format(value);
    } else if (['USD', 'USDC', 'USDT', 'DAI'].includes(curr)) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
      }).format(value);
    } else {
      return `${value.toFixed(4)} ${curr}`;
    }
  };

  // Convertir a MXN para referencia
  const valueInMXN = calculation.finalAmount * (exchangeRates[currency] || 1);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Calculadora de Rendimientos APY
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Monto a Invertir
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10,000"
                className="flex-1"
              />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MXN">MXN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="USDC">USDC</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="DAI">DAI</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">
              Período (meses)
            </label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mes</SelectItem>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">1 año</SelectItem>
                <SelectItem value="24">2 años</SelectItem>
                <SelectItem value="36">3 años</SelectItem>
                <SelectItem value="60">5 años</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 flex items-center gap-2">
            APY Anual: {apy[0].toFixed(2)}%
            <Info className="w-4 h-4 text-muted-foreground" />
          </label>
          <Slider
            value={apy}
            onValueChange={setApy}
            max={50}
            min={0}
            step={0.1}
            className="mb-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">
            Frecuencia de Capitalización
          </label>
          <Select value={compoundFrequency} onValueChange={setCompoundFrequency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diaria</SelectItem>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="quarterly">Trimestral</SelectItem>
              <SelectItem value="yearly">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Resultados */}
        <div className="border-t pt-6 space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Proyección de Rendimientos
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Inversión Inicial</div>
              <div className="text-xl font-bold">{formatCurrency(calculation.initialAmount)}</div>
            </div>

            <div className="bg-primary/10 rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-1">Valor Final</div>
              <div className="text-xl font-bold text-primary">
                {formatCurrency(calculation.finalAmount)}
              </div>
              {currency !== 'MXN' && (
                <div className="text-xs text-muted-foreground mt-1">
                  ≈ {formatCurrency(valueInMXN, 'MXN')}
                </div>
              )}
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
            <div className="text-sm text-green-700 dark:text-green-400 mb-1">
              Ganancias Totales
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">
              +{formatCurrency(calculation.earnings)}
            </div>
            <div className="text-sm text-green-600 dark:text-green-500 mt-1">
              {((calculation.earnings / calculation.initialAmount) * 100).toFixed(2)}% de retorno
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Diario</div>
              <div className="font-semibold">
                {formatCurrency(calculation.dailyEarnings)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Mensual</div>
              <div className="font-semibold">
                {formatCurrency(calculation.monthlyEarnings)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Anual</div>
              <div className="font-semibold">
                {formatCurrency(calculation.yearlyEarnings)}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded">
            <Info className="w-3 h-3 inline mr-1" />
            Cálculo estimado basado en capitalización {
              compoundFrequency === 'daily' ? 'diaria' :
              compoundFrequency === 'monthly' ? 'mensual' :
              compoundFrequency === 'quarterly' ? 'trimestral' : 'anual'
            }. Los rendimientos reales pueden variar.
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default APYCalculator;