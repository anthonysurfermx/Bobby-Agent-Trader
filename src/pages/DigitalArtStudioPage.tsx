import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, ArrowRight, Upload, Download, Share2, Palette, Sparkles, Zap, Layers, Wand2, Eye, Shuffle, Wallet, Clock, CheckCircle2, Loader2, ExternalLink, DollarSign, Brain } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const DigitalArtStudioPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [walletStatus, setWalletStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'minting' | 'completed'>('disconnected');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [mintingProgress, setMintingProgress] = useState(0);
  const [artworkData, setArtworkData] = useState({
    style: '',
    gender: '',
    layer: '',
    title: '',
    statement: '',
    // New mixer properties
    intensity: [50],
    colorTemperature: [50],
    complexity: [50],
    primaryColor: '#8B5CF6',
    accentColor: '#F59E0B',
    pattern: 'geometric',
    texture: 'smooth',
    glowEffect: [30]
  });

  const artStyles = [
    {
      id: 'degen',
      name: 'DEGEN',
      description: 'Arte glitch/cyberpunk con colores neón, distorsiones digitales, estética caótica',
      preview: 'bg-gradient-to-br from-pink-500 via-purple-600 to-cyan-400',
      characteristics: ['Colores neón', 'Efectos glitch', 'Estética cyber', 'Caos digital']
    },
    {
      id: 'fintech',
      name: 'FINTECH',
      description: 'Arte minimalista geométrico, líneas limpias, paleta monocromática elegante',
      preview: 'bg-gradient-to-br from-gray-100 via-blue-100 to-gray-200',
      characteristics: ['Minimalismo', 'Geometría', 'Líneas limpias', 'Elegancia']
    },
    {
      id: 'stablecoin',
      name: 'STABLECOIN MAXI',
      description: 'Arte abstracto fluido, formas orgánicas suaves, colores pastel equilibrados',
      preview: 'bg-gradient-to-br from-green-200 via-blue-200 to-purple-200',
      characteristics: ['Formas fluidas', 'Colores pastel', 'Equilibrio', 'Suavidad']
    },
    {
      id: 'yield',
      name: 'YIELD MAXI',
      description: 'Arte generativo con patrones fractales dorados, visualización de datos, growth art',
      preview: 'bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500',
      characteristics: ['Fractales', 'Dorado', 'Patrones', 'Crecimiento']
    }
  ];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setArtworkData(prev => ({ ...prev, personalImage: file }));
    }
  };

  const nextStep = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return artworkData.style !== '';
      case 1: return artworkData.gender && artworkData.layer && artworkData.title;
      case 2: return true;
      default: return false;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link to="/digital-art-defi" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-5 h-5" />
              Volver a Galería
            </Link>
            <h1 className="text-2xl font-bold">Estudio de Creación Digital</h1>
            <div className="text-sm text-muted-foreground">
              Paso {currentStep + 1} de 3
            </div>
          </div>
          <Progress value={((currentStep + 1) / 3) * 100} className="mt-4" />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Step 0: Art Style Selection */}
        {currentStep === 0 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">Define tu Estilo Artístico</h2>
              <p className="text-lg text-muted-foreground">Elige el estilo que mejor represente tu identidad DeFi</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {artStyles.map((style) => (
                <Card 
                  key={style.id}
                  className={`cursor-pointer card-hover ${artworkData.style === style.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setArtworkData(prev => ({ ...prev, style: style.id }))}
                >
                  <div className={`h-48 rounded-t-lg ${style.preview}`} />
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-2">{style.name}</h3>
                    <p className="text-muted-foreground mb-4">{style.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {style.characteristics.map((char) => (
                        <Badge key={char} variant="outline" className="text-xs">
                          {char}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Creative Art Mixer */}
        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4 flex items-center justify-center gap-3">
                <Wand2 className="w-8 h-8 text-primary" />
                Mixer Creativo NFT
                <Sparkles className="w-8 h-8 text-primary" />
              </h2>
              <p className="text-lg text-muted-foreground">Experimenta y crea tu arte único mezclando elementos</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Controls Panel */}
              <div className="space-y-6">
                {/* Core Identity */}
                <Card className="overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10">
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="w-5 h-5" />
                      Identidad Visual
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="space-y-4">
                      <Label className="text-base font-semibold">Género Artístico</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'AltoRiesgo', label: 'Alto riesgo', icon: <DollarSign className="w-6 h-6" />, desc: 'Máximo rendimiento', color: 'from-blue-500/20 to-cyan-500/20' },
                          { id: 'Conservador', label: 'Conservador', icon: <Brain className="w-6 h-6" />, desc: 'Estabilidad y balance', color: 'from-pink-500/20 to-purple-500/20' }
                        ].map((gender) => (
                          <Card 
                            key={gender.id}
                            className={`cursor-pointer card-hover transition-all duration-300 ${
                              artworkData.gender === gender.id 
                                ? 'ring-2 ring-primary scale-105 shadow-lg' 
                                : 'hover:scale-102'
                            }`}
                            onClick={() => setArtworkData(prev => ({ ...prev, gender: gender.id }))}
                          >
                            <div className={`bg-gradient-to-br ${gender.color} p-4 text-center space-y-2`}>
                              <div className="flex justify-center text-primary">{gender.icon}</div>
                              <div className="font-semibold">{gender.label}</div>
                              <div className="text-xs text-muted-foreground">{gender.desc}</div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-base font-semibold">Impacto</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'Mercados', label: 'Mercados', icon: '📈', desc: 'Inversión directa', color: 'from-yellow-500/20 to-orange-500/20' },
                          { id: 'Servicios', label: 'Servicios', icon: '⚙️', desc: 'Gestión completa', color: 'from-green-500/20 to-emerald-500/20' }
                        ].map((layer) => (
                          <Card 
                            key={layer.id}
                            className={`cursor-pointer card-hover transition-all duration-300 ${
                              artworkData.layer === layer.id 
                                ? 'ring-2 ring-primary scale-105 shadow-lg' 
                                : 'hover:scale-102'
                            }`}
                            onClick={() => setArtworkData(prev => ({ ...prev, layer: layer.id }))}
                          >
                            <div className={`bg-gradient-to-br ${layer.color} p-4 text-center space-y-2`}>
                              <div className="text-2xl">{layer.icon}</div>
                              <div className="font-semibold">{layer.label}</div>
                              <div className="text-xs text-muted-foreground">{layer.desc}</div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>


                {/* Art Details */}
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título de la Obra</Label>
                      <Input
                        id="title"
                        placeholder="Nombre único para tu NFT"
                        maxLength={30}
                        value={artworkData.title}
                        onChange={(e) => setArtworkData(prev => ({ ...prev, title: e.target.value }))}
                        className="text-lg font-semibold"
                      />
                      <div className="text-xs text-muted-foreground text-right">
                        {artworkData.title.length}/30
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="statement">Statement Artístico</Label>
                      <Textarea
                        id="statement"
                        placeholder="Describe la historia detrás de tu arte..."
                        maxLength={100}
                        rows={3}
                        value={artworkData.statement}
                        onChange={(e) => setArtworkData(prev => ({ ...prev, statement: e.target.value }))}
                      />
                      <div className="text-xs text-muted-foreground text-right">
                        {artworkData.statement.length}/100
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Live Preview */}
              <div className="space-y-6">
                <Card className="overflow-hidden">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Vista Previa en Vivo
                      <Badge variant="secondary" className="animate-pulse">Live</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div 
                      className="aspect-square relative overflow-hidden"
                      style={{
                        background: `linear-gradient(135deg, ${artworkData.primaryColor}${Math.round(artworkData.intensity[0] * 0.4 + 20).toString(16)}, ${artworkData.accentColor}${Math.round(artworkData.intensity[0] * 0.3 + 10).toString(16)})`,
                        filter: `hue-rotate(${artworkData.colorTemperature[0] * 3.6}deg)`,
                      }}
                    >
                      {/* Animated layers based on settings */}
                      <div 
                        className="absolute inset-0 opacity-30"
                        style={{
                          background: `repeating-linear-gradient(45deg, transparent, transparent ${10 + artworkData.complexity[0] * 0.5}px, ${artworkData.primaryColor}20 ${10 + artworkData.complexity[0] * 0.5}px, ${artworkData.primaryColor}20 ${20 + artworkData.complexity[0]}px)`,
                        }}
                      />
                      
                      {/* Glow effect */}
                      <div 
                        className="absolute inset-4 rounded-lg"
                        style={{
                          boxShadow: `inset 0 0 ${artworkData.glowEffect[0]}px ${artworkData.primaryColor}80, 0 0 ${artworkData.glowEffect[0] * 0.5}px ${artworkData.accentColor}60`,
                        }}
                      />

                      {/* Central content */}
                      <div className="absolute inset-0 flex flex-col justify-center items-center p-8 text-center">
                        <div className="space-y-4">
                          <div 
                            className="text-6xl"
                            style={{ 
                              filter: `drop-shadow(0 0 ${artworkData.glowEffect[0] * 0.3}px ${artworkData.accentColor})` 
                            }}
                          >
                            {artworkData.gender === 'Hombre' ? '🔷' : artworkData.gender === 'Mujer' ? '🌸' : '✨'}
                          </div>
                          
                          {artworkData.title && (
                            <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                              {artworkData.title}
                            </h3>
                          )}
                          
                          <div className="flex items-center justify-center gap-2">
                            <Badge 
                              variant="secondary" 
                              className="bg-white/20 text-white border-white/30"
                            >
                              {artworkData.layer || 'Layer'}
                            </Badge>
                            <Badge 
                              variant="secondary" 
                              className="bg-white/20 text-white border-white/30"
                            >
                              {artStyles.find(s => s.id === artworkData.style)?.name || 'Style'}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Animated particles */}
                      <div className="absolute inset-0 pointer-events-none">
                        {[...Array(Math.floor(artworkData.intensity[0] / 20))].map((_, i) => (
                          <div
                            key={i}
                            className="absolute w-2 h-2 rounded-full animate-pulse"
                            style={{
                              background: artworkData.accentColor,
                              left: `${20 + (i * 15) % 60}%`,
                              top: `${20 + (i * 23) % 60}%`,
                              animationDelay: `${i * 0.5}s`,
                              opacity: 0.6,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="text-center p-4">
                    <div className="text-2xl font-bold text-primary">
                      {Math.round((artworkData.intensity[0] + artworkData.complexity[0] + artworkData.glowEffect[0]) / 3)}
                    </div>
                    <div className="text-sm text-muted-foreground">Score Artístico</div>
                  </Card>
                  <Card className="text-center p-4">
                    <div className="text-2xl font-bold text-primary">
                      {artworkData.title && artworkData.gender && artworkData.layer ? '100' : '0'}%
                    </div>
                    <div className="text-sm text-muted-foreground">Completitud</div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Wallet Connection & Minting */}
        {currentStep === 2 && (
          <div className="space-y-8">
            {/* Header with Animation */}
            <div className="text-center max-w-4xl mx-auto">
              <div className="mb-12">
                <div className="relative mb-8">
                  <div className="w-32 h-32 mx-auto mb-6 bg-gradient-to-br from-primary via-secondary to-accent rounded-full flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent animate-spin" />
                    <Sparkles className="w-16 h-16 text-white relative z-10" />
                  </div>
                  <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent animate-pulse">
                    We are building your DeFi identity
                  </h1>
                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Tu NFT único está listo para ser minteado. Conecta tu wallet y únete al ecosistema DeFi de México.
                  </p>
                </div>
              </div>

              {/* Progress Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12 relative">
                <div className="hidden md:block absolute top-6 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-primary via-secondary to-accent" />
                
                <div className="flex flex-col items-center p-6 rounded-xl bg-card border-2 border-primary/20 relative z-10">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3 text-lg font-bold">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">Estilo Artístico</h3>
                  <Badge variant="secondary" className="mb-1">
                    {artStyles.find(s => s.id === artworkData.style)?.name}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">Completado</p>
                </div>
                
                <div className="flex flex-col items-center p-6 rounded-xl bg-card border-2 border-primary/20 relative z-10">
                  <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mb-3 text-lg font-bold">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">Obra Creada</h3>
                  <Badge variant="secondary" className="mb-1 max-w-[100px] truncate">
                    {artworkData.title}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">Completado</p>
                </div>
                
                <div className="flex flex-col items-center p-6 rounded-xl bg-card border-2 border-secondary/20 relative z-10">
                  <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center mb-3 text-lg font-bold">
                    {walletStatus === 'connected' ? <CheckCircle2 className="w-6 h-6" /> : 
                     walletStatus === 'connecting' ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                     <Wallet className="w-6 h-6" />}
                  </div>
                  <h3 className="font-semibold mb-2">Conexión Wallet</h3>
                  <Badge variant={walletStatus === 'connected' ? 'default' : 'outline'} className="mb-1">
                    {walletStatus === 'connected' ? 'Conectada' :
                     walletStatus === 'connecting' ? 'Conectando...' : 'Pendiente'}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">
                    {walletStatus === 'connected' ? 'Completado' : 'En proceso'}
                  </p>
                </div>
                
                <div className="flex flex-col items-center p-6 rounded-xl bg-card border-2 border-accent/20 relative z-10">
                  <div className="w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center mb-3 text-lg font-bold">
                    {walletStatus === 'completed' ? <CheckCircle2 className="w-6 h-6" /> : 
                     walletStatus === 'minting' ? <Loader2 className="w-6 h-6 animate-spin" /> : 
                     <Zap className="w-6 h-6" />}
                  </div>
                  <h3 className="font-semibold mb-2">Minteo NFT</h3>
                  <Badge variant={walletStatus === 'completed' ? 'default' : 'outline'} className="mb-1">
                    {walletStatus === 'completed' ? 'Completado' :
                     walletStatus === 'minting' ? 'Minteando...' : 'Pendiente'}
                  </Badge>
                  <p className="text-xs text-muted-foreground text-center">
                    {walletStatus === 'completed' ? 'NFT Creado' : 'Esperando'}
                  </p>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                {/* Wallet Connection Panel */}
                <div className="space-y-6">
                  {walletStatus === 'disconnected' && (
                    <Card className="overflow-hidden border-2 border-primary/20">
                      <CardHeader className="bg-gradient-to-r from-primary/10 to-secondary/10 text-center">
                        <CardTitle className="flex items-center justify-center gap-3 text-2xl">
                          <Wallet className="w-7 h-7" />
                          Conecta tu Wallet Crypto
                        </CardTitle>
                        <p className="text-muted-foreground">Selecciona tu wallet preferida para comenzar el proceso</p>
                      </CardHeader>
                      <CardContent className="p-8 space-y-4">
                        {[
                          {
                            id: 'metamask',
                            name: 'MetaMask',
                            description: 'La wallet más popular para DeFi',
                            icon: '🦊',
                            color: 'from-orange-500 to-yellow-500'
                          },
                          {
                            id: 'walletconnect',
                            name: 'WalletConnect',
                            description: 'Conecta cualquier wallet móvil',
                            icon: '🔗',
                            color: 'from-blue-500 to-cyan-500'
                          },
                          {
                            id: 'coinbase',
                            name: 'Coinbase Wallet',
                            description: 'Wallet segura y fácil de usar',
                            icon: '🔵',
                            color: 'from-blue-600 to-indigo-600'
                          }
                        ].map((wallet) => (
                          <Button
                            key={wallet.id}
                            size="lg"
                            variant="outline"
                            className="w-full h-auto p-6 justify-start space-x-4 group hover:border-primary/50 transition-all duration-300"
                            onClick={() => {
                              setSelectedWallet(wallet.id);
                              setWalletStatus('connecting');
                              // Simulate connection
                              setTimeout(() => {
                                setWalletStatus('connected');
                              }, 2000);
                            }}
                          >
                            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${wallet.color} flex items-center justify-center text-xl group-hover:scale-110 transition-transform`}>
                              {wallet.icon}
                            </div>
                            <div className="text-left flex-1">
                              <h4 className="font-semibold text-lg">{wallet.name}</h4>
                              <p className="text-muted-foreground text-sm">{wallet.description}</p>
                            </div>
                            <ExternalLink className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Button>
                        ))}
                        
                        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-primary" />
                            Información del Gas
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Red:</span>
                              <span className="ml-2 font-semibold">Polygon</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Gas estimado:</span>
                              <span className="ml-2 font-semibold text-green-600">~$0.01</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {walletStatus === 'connecting' && (
                    <Card className="border-2 border-secondary/20">
                      <CardContent className="p-8 text-center space-y-6">
                        <div className="w-16 h-16 mx-auto bg-secondary/20 rounded-full flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-secondary animate-spin" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold mb-2">Conectando wallet...</h3>
                          <p className="text-muted-foreground">
                            Confirma la conexión en tu {selectedWallet} wallet
                          </p>
                        </div>
                        <Progress value={50} className="w-full" />
                      </CardContent>
                    </Card>
                  )}

                  {walletStatus === 'connected' && (
                    <Card className="border-2 border-green-200 dark:border-green-800">
                      <CardContent className="p-8 space-y-6">
                        <div className="text-center">
                          <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                          </div>
                          <h3 className="text-xl font-semibold mb-2">¡Wallet Conectada!</h3>
                          <p className="text-muted-foreground mb-4">0x7a2b...9d4f</p>
                          
                          <Button
                            size="lg"
                            className="w-full"
                            onClick={() => {
                              setWalletStatus('minting');
                              setMintingProgress(0);
                              
                              // Simulate minting progress
                              const interval = setInterval(() => {
                                setMintingProgress(prev => {
                                  const newProgress = prev + Math.random() * 20;
                                  if (newProgress >= 100) {
                                    clearInterval(interval);
                                    setTimeout(() => setWalletStatus('completed'), 500);
                                    return 100;
                                  }
                                  return newProgress;
                                });
                              }, 800);
                            }}
                          >
                            <Sparkles className="w-5 h-5 mr-2" />
                            Mintear NFT Identidad DeFi
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {walletStatus === 'minting' && (
                    <Card className="border-2 border-accent/20">
                      <CardContent className="p-8 space-y-6 text-center">
                        <div className="w-20 h-20 mx-auto bg-accent/20 rounded-full flex items-center justify-center relative">
                          <Loader2 className="w-10 h-10 text-accent animate-spin" />
                          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-accent/20 to-transparent animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold mb-2">Creando tu identidad DeFi...</h3>
                          <p className="text-muted-foreground mb-4">
                            Tu NFT está siendo procesado en la blockchain
                          </p>
                          <div className="space-y-3">
                            <Progress value={mintingProgress} className="w-full h-3" />
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Progreso: {Math.round(mintingProgress)}%</span>
                              <span>ETA: ~2 min</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Minting Steps */}
                        <div className="text-left space-y-3 bg-muted/30 p-4 rounded-lg">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            <span className="text-sm">Validando metadatos</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {mintingProgress > 30 ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground animate-spin" />
                            )}
                            <span className="text-sm">Subiendo imagen a IPFS</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {mintingProgress > 70 ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : (
                              <Clock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <span className="text-sm">Ejecutando transacción</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {walletStatus === 'completed' && (
                    <Card className="border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
                      <CardContent className="p-8 text-center space-y-6">
                        <div className="w-24 h-24 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-12 h-12 text-white" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold mb-2 text-green-700 dark:text-green-300">
                            ¡NFT Creado Exitosamente!
                          </h3>
                          <p className="text-muted-foreground mb-6">
                            Tu identidad DeFi ha sido establecida en la blockchain
                          </p>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm bg-white/50 dark:bg-black/20 p-4 rounded-lg">
                            <div>
                              <span className="text-muted-foreground block">Token ID:</span>
                              <span className="font-mono font-semibold">#1337</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Red:</span>
                              <span className="font-semibold">Polygon</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Gas usado:</span>
                              <span className="font-semibold text-green-600">$0.008</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block">Tiempo:</span>
                              <span className="font-semibold">2.3s</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <Button variant="outline" size="sm" className="flex-1">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver en OpenSea
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver Transacción
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* NFT Preview Panel */}
                <div className="space-y-6">
                  <Card className="overflow-hidden">
                    <CardHeader className="text-center">
                      <CardTitle className="text-xl">Tu NFT Identidad DeFi</CardTitle>
                      <p className="text-muted-foreground">Preview de tu obra maestra digital</p>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="max-w-sm mx-auto">
                        <div 
                          className="aspect-square relative p-8 rounded-xl overflow-hidden"
                          style={{
                            background: `linear-gradient(135deg, ${artworkData.primaryColor}60, ${artworkData.accentColor}60)`,
                          }}
                        >
                          <div className="h-full bg-white/10 backdrop-blur-sm rounded-lg flex flex-col justify-between p-6 border border-white/20 relative overflow-hidden">
                            {/* Background Pattern */}
                            <div className="absolute inset-0 opacity-20">
                              {[...Array(6)].map((_, i) => (
                                <div
                                  key={i}
                                  className="absolute w-8 h-8 rounded-full"
                                  style={{
                                    background: artworkData.accentColor,
                                    left: `${10 + (i * 20) % 80}%`,
                                    top: `${15 + (i * 25) % 70}%`,
                                    transform: `scale(${0.5 + (artworkData.intensity[0] / 200)})`,
                                    filter: `blur(${3 - (artworkData.complexity[0] / 50)}px)`,
                                  }}
                                />
                              ))}
                            </div>
                            
                            <div className="text-right relative z-10">
                              <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
                                {artStyles.find(s => s.id === artworkData.style)?.name}
                              </Badge>
                            </div>
                            
                            <div className="text-center space-y-4 relative z-10">
                              <div 
                                className="text-6xl mx-auto"
                                style={{ 
                                  filter: `drop-shadow(0 0 ${artworkData.glowEffect[0] / 3}px ${artworkData.accentColor})` 
                                }}
                              >
                                {artworkData.gender === 'Hombre' ? '🔷' : artworkData.gender === 'Mujer' ? '🌸' : '✨'}
                              </div>
                              <div>
                                <h4 className="text-xl font-bold text-white mb-2">{artworkData.title}</h4>
                                <p className="text-sm text-white/80 line-clamp-2">{artworkData.statement}</p>
                              </div>
                            </div>
                            
                            <div className="text-center text-xs text-white/60 relative z-10">
                              <div className="font-mono">#{walletStatus === 'completed' ? '1337' : '???'}</div>
                              <div>DeFi México • {new Date().getFullYear()}</div>
                            </div>

                            {/* Animated overlay for completed state */}
                            {walletStatus === 'completed' && (
                              <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-500/20 animate-pulse" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Technical Details */}
                      <div className="mt-6 space-y-4">
                        <h4 className="font-semibold text-center">Especificaciones Técnicas</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Estándar:</span>
                              <span className="font-mono">ERC-721</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Blockchain:</span>
                              <span className="font-semibold">Polygon</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Royalties:</span>
                              <span className="font-semibold">5%</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Resolución:</span>
                              <span className="font-mono">1024x1024</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Formato:</span>
                              <span className="font-mono">SVG + PNG</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Storage:</span>
                              <span className="font-semibold">IPFS</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center pt-8">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>

          <div className="text-center">
            <div className="text-sm text-muted-foreground">
              {currentStep === 2 ? '¡Obra completada!' : `Paso ${currentStep + 1} de 3`}
            </div>
          </div>

          {currentStep < 2 ? (
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
            >
              Siguiente
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => navigate('/digital-art-defi/gallery')}>
              Ver en Galería
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DigitalArtStudioPage;