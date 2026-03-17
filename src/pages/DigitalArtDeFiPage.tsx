import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { Palette, Users, TrendingUp, Award, Eye, Heart, Share2, Camera, Music, Image, Gamepad2, Sparkles, ArrowUpRight, Code, ArrowLeftRight } from 'lucide-react';

const DigitalArtDeFiPage: React.FC = () => {
  // Mock data for example artworks
  const exampleArtworks = [
    {
      id: 1,
      title: "Degen Dreams",
      artist: "CryptoArtist",
      style: "DEGEN",
      likes: 234,
      price: "0.08 ETH",
      imageUrl: "/api/placeholder/300/400",
      tags: ["cyberpunk", "neon", "glitch"]
    },
    {
      id: 2,
      title: "Fintech Flow",
      artist: "MinimalMaker",
      style: "FINTECH",
      likes: 189,
      price: "0.12 ETH",
      imageUrl: "/api/placeholder/300/350",
      tags: ["minimal", "geometric", "clean"]
    },
    {
      id: 3,
      title: "Stable Serenity",
      artist: "AbstractAlpha",
      style: "STABLECOIN MAXI",
      likes: 156,
      price: "0.06 ETH",
      imageUrl: "/api/placeholder/300/450",
      tags: ["abstract", "fluid", "pastel"]
    },
    {
      id: 4,
      title: "Yield Harmony",
      artist: "FractalFarmer",
      style: "YIELD MAXI",
      likes: 278,
      price: "0.15 ETH",
      imageUrl: "/api/placeholder/300/380",
      tags: ["fractal", "golden", "generative"]
    },
    {
      id: 5,
      title: "Layer Infinity",
      artist: "BlockBuilder",
      style: "DEGEN",
      likes: 201,
      price: "0.09 ETH",
      imageUrl: "/api/placeholder/300/420",
      tags: ["cyber", "matrix", "digital"]
    },
    {
      id: 6,
      title: "Protocol Poetry",
      artist: "CodeCanvas",
      style: "FINTECH",
      likes: 167,
      price: "0.11 ETH",
      imageUrl: "/api/placeholder/300/360",
      tags: ["code", "elegant", "structured"]
    }
  ];

  const topArtworks = [
    {
      id: 7,
      title: "DeFi Genesis",
      artist: "PioneerPixel",
      likes: 456,
      views: 2340,
      rank: 1
    },
    {
      id: 8,
      title: "Liquidity Legends",
      artist: "PoolPainter",
      likes: 423,
      views: 2156,
      rank: 2
    },
    {
      id: 9,
      title: "Smart Contract Symphony",
      artist: "EthereumEasel",
      likes: 398,
      views: 1987,
      rank: 3
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Content */}
            <div className="text-left">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">DG.Mint</span>
              </div>
              
              <h1 className="text-5xl lg:text-7xl font-bold mb-6 leading-tight">
                DeFi no es<br />
                <span className="text-primary">Aburrido</span><br />
            
              </h1>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Crea y mintea tus NFTs
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link to="/digital-art-defi/studio">
                  <Button size="lg" className="text-base px-8 py-4 rounded-full">
                    <Palette className="w-5 h-5 mr-2" />
                    Lo quiero
                  </Button>
                </Link>
                <Button variant="outline" size="lg" className="text-base px-8 py-4 rounded-full">
                  ¿Cómo funciona?
                </Button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <div className="text-3xl font-bold mb-1">1,234</div>
                  <div className="text-sm text-muted-foreground">Obras Creadas</div>
                </div>
                <div>
                  <div className="text-3xl font-bold mb-1">456</div>
                  <div className="text-sm text-muted-foreground">Artistas</div>
                </div>
                <div>
                  <div className="text-3xl font-bold mb-1">12.4 ETH</div>
                  <div className="text-sm text-muted-foreground">Valor Total</div>
                </div>
              </div>
            </div>

            {/* Right Content - Mobile App Preview */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="relative">
                {/* Phone mockup */}
                <div className="w-80 h-[600px] bg-card rounded-3xl border-8 border-muted shadow-2xl overflow-hidden">
                  <div className="p-8 h-full bg-gradient-to-b from-card to-muted/20">
                    {/* Minting Progress */}
                    <div className="text-center mb-8">
                      <div className="relative w-48 h-48 mx-auto mb-6">
                        {/* Progress ring */}
                        <div className="absolute inset-0 rounded-full border-8 border-muted"></div>
                        <div className="absolute inset-0 rounded-full border-8 border-primary border-t-transparent animate-pulse"></div>
                        <div className="absolute inset-4 rounded-full border-4 border-muted/50"></div>
                        <div className="absolute inset-8 rounded-full bg-muted/30 flex items-center justify-center">
                          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-primary"></div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground mb-2 tracking-wide uppercase">Minting...</div>
                      <div className="text-4xl font-bold mb-2">100%</div>
                      <div className="text-xs text-muted-foreground">DeFi Degen</div>
                    </div>
                    
                    {/* NFT Info */}
                    <div className="bg-background/50 rounded-2xl p-4 mb-6">
                      <div className="text-sm font-medium mb-1">DeFi degen #001</div>
                      <div className="text-xs text-muted-foreground mb-2">Defi mexico Collection</div>
                      <div className="text-xs text-muted-foreground">Sé parte de la evolución</div>
                    </div>
                  </div>
                </div>
                
                {/* Floating elements */}
                <div className="absolute -top-4 -right-4 w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Palette className="w-8 h-8 text-primary" />
                </div>
                <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Award className="w-8 h-8 text-secondary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">Mint art in any category</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-6">Categorías</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Las finanzas no son solo números, también es arte encuentra tu mejor estilo
          </p>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {[
            { icon: TrendingUp, name: "Yield Maxi" },
            { icon: ArrowLeftRight, name: "Stablecoin Maxi" },
            { icon: Code, name: "Degen" },
            { icon: Sparkles, name: "Fintech" },
          ].map((category, index) => (
            <Card key={index} className="p-6 text-center hover:shadow-lg transition-shadow cursor-pointer group">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
                <category.icon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">{category.name}</h3>
            </Card>
          ))}
        </div>

        {/* Featured NFTs */}
        <div className="text-center mb-12">
          <h3 className="text-2xl font-bold mb-8">NFTs Destacados</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {exampleArtworks.slice(0, 3).map((artwork) => (
            <Card key={artwork.id} className="overflow-hidden group hover:shadow-xl transition-shadow">
              <div className="aspect-square bg-gradient-to-br from-primary/20 to-secondary/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-4 left-4 right-4 transform translate-y-4 group-hover:translate-y-0 transition-transform opacity-0 group-hover:opacity-100">
                  <Badge variant="secondary" className="mb-2">
                    {artwork.style}
                  </Badge>
                </div>
              </div>
              
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg mb-2">{artwork.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">por {artwork.artist}</p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Heart className="w-4 h-4" />
                    <span>{artwork.likes}</span>
                  </div>
                  <div className="font-bold text-lg text-primary">
                    {artwork.price}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link to="/digital-art-defi/gallery">
            <Button variant="outline" size="lg" className="rounded-full">
              Ver Toda la Colección
            </Button>
          </Link>
        </div>
      </div>

      {/* About Section */}
      <div className="bg-muted/30 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Award className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground tracking-wide uppercase">About</span>
              </div>
              
              <h2 className="text-4xl font-bold mb-6">
                Encuentra tu nuevo estilo financiero<br />
                
              </h2>
              
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Nuestra plataforma te permite crear arte digital único, explorar colecciones increíbles 
                y construir tu propia galería de NFTs. Únete a una comunidad de artistas y coleccionistas 
                que están redefiniendo el arte digital.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Palette className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Herramientas Creativas</h3>
                    <p className="text-sm text-muted-foreground">Editor avanzado para crear arte único</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Comunidad Activa</h3>
                    <p className="text-sm text-muted-foreground">Conecta con artistas y coleccionistas</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Mercado Dinámico</h3>
                    <p className="text-sm text-muted-foreground">Compra y vende con facilidad</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                {exampleArtworks.slice(0, 4).map((artwork, index) => (
                  <div key={artwork.id} className={`aspect-square bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl ${index % 2 === 1 ? 'mt-8' : ''}`}>
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center bg-primary/5 rounded-3xl p-16 border border-primary/10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6">
              ¿Listo para crear tu<br />
              obra maestra?
            </h2>
            <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
              Únete a la revolución del arte digital DeFi y crea tu identidad visual única 
              en el ecosistema descentralizado. Comienza tu journey como artista NFT hoy.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/digital-art-defi/studio">
                <Button size="lg" className="text-base px-8 py-4 rounded-full">
                  <Palette className="w-5 h-5 mr-2" />
                  Comenzar a Crear
                </Button>
              </Link>
              <Link to="/digital-art-defi/gallery">
                <Button variant="outline" size="lg" className="text-base px-8 py-4 rounded-full">
                  Explorar Galería
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalArtDeFiPage;