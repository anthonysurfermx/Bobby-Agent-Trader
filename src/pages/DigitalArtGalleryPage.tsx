import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Search, Filter, Heart, Eye, Share2, Grid3X3, Grid2X2, Users, Calendar, TrendingUp, Volume2, Star, Verified } from 'lucide-react';
import { Link } from 'react-router-dom';

const DigitalArtGalleryPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStyle, setFilterStyle] = useState('all');
  const [filterLayer, setFilterLayer] = useState('all');
  const [sortBy, setSortBy] = useState('popular');
  const [viewMode, setViewMode] = useState(4); // columns

  // Mock gallery data
  const artworks = [
    {
      id: 1,
      title: "Degen Genesis",
      artist: "CryptoArtist",
      style: "DEGEN",
      layer: "L1",
      likes: 456,
      views: 2340,
      price: "0.15 ETH",
      createdAt: "2024-01-15",
      imageUrl: "/api/placeholder/400/500",
      description: "Una representación caótica del nacimiento del ecosistema DeFi",
      forSale: true
    },
    {
      id: 2,
      title: "Fintech Flow",
      artist: "MinimalMaker",
      style: "FINTECH",
      layer: "L2",
      likes: 423,
      views: 2156,
      price: "0.12 ETH",
      createdAt: "2024-01-14",
      imageUrl: "/api/placeholder/400/600",
      description: "Elegancia minimalista en el mundo de las finanzas digitales",
      forSale: true
    },
    {
      id: 3,
      title: "Stable Dreams",
      artist: "AbstractAlpha",
      style: "STABLECOIN MAXI",
      layer: "L1",
      likes: 398,
      views: 1987,
      price: "0.08 ETH",
      createdAt: "2024-01-13",
      imageUrl: "/api/placeholder/400/450",
      description: "La serenidad de un ecosistema equilibrado",
      forSale: false
    },
    {
      id: 4,
      title: "Yield Symphony",
      artist: "FractalFarmer",
      style: "YIELD MAXI",
      layer: "L2",
      likes: 567,
      views: 3421,
      price: "0.25 ETH",
      createdAt: "2024-01-12",
      imageUrl: "/api/placeholder/400/520",
      description: "Patrones fractales que representan el crecimiento exponencial",
      forSale: true
    },
    {
      id: 5,
      title: "Layer Infinity",
      artist: "BlockBuilder",
      style: "DEGEN",
      layer: "L2",
      likes: 234,
      views: 1543,
      price: "0.09 ETH",
      createdAt: "2024-01-11",
      imageUrl: "/api/placeholder/400/470",
      description: "Explorando las posibilidades infinitas de las capas blockchain",
      forSale: true
    },
    {
      id: 6,
      title: "Protocol Poetry",
      artist: "CodeCanvas",
      style: "FINTECH",
      layer: "L1",
      likes: 345,
      views: 1876,
      price: "0.11 ETH",
      createdAt: "2024-01-10",
      imageUrl: "/api/placeholder/400/550",
      description: "Donde el código se encuentra con el arte",
      forSale: false
    }
  ];

  const filteredArtworks = artworks.filter(artwork => {
    const matchesSearch = artwork.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         artwork.artist.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStyle = filterStyle === 'all' || artwork.style === filterStyle;
    const matchesLayer = filterLayer === 'all' || artwork.layer === filterLayer;
    
    return matchesSearch && matchesStyle && matchesLayer;
  });

  const sortedArtworks = [...filteredArtworks].sort((a, b) => {
    switch (sortBy) {
      case 'popular':
        return b.likes - a.likes;
      case 'recent':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'price-high':
        return parseFloat(b.price) - parseFloat(a.price);
      case 'price-low':
        return parseFloat(a.price) - parseFloat(b.price);
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section - Collection Banner */}
      <div className="relative h-80 bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col justify-end pb-8">
          <Link to="/digital-art-defi" className="flex items-center gap-2 text-white/80 hover:text-white mb-6">
            <ArrowLeft className="w-5 h-5" />
            Volver a Inicio
          </Link>
          <div className="flex items-end gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Star className="w-10 h-10 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-4xl font-bold text-white">DeFi Art Collection</h1>
                <Verified className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-white/80 mb-4">Colección exclusiva de arte digital inspirado en DeFi y blockchain</p>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Por <span className="text-white">DeFi Academy</span></span>
                <span>•</span>
                <span>Creado hace 3 meses</span>
              </div>
            </div>
            <Link to="/digital-art-defi/studio">
              <Button size="lg" className="bg-white text-black hover:bg-white/90">
                Crear Arte
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Collection Stats */}
      <div className="border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold">0.15 ETH</div>
              <div className="text-sm text-muted-foreground">Precio suelo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">0.12 ETH</div>
              <div className="text-sm text-muted-foreground">Mejor oferta</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">45.2 ETH</div>
              <div className="text-sm text-muted-foreground">Volumen total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">+12.5%</div>
              <div className="text-sm text-muted-foreground">Cambio 24h</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{artworks.length}</div>
              <div className="text-sm text-muted-foreground">Artículos únicos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Tabs defaultValue="items" className="w-full">
            <TabsList className="h-auto p-0 bg-transparent">
              <TabsTrigger value="items" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                Artículos
              </TabsTrigger>
              <TabsTrigger value="activity" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                Actividad
              </TabsTrigger>
              <TabsTrigger value="analytics" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                Analíticas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-8">
          {/* Sidebar Filters */}
          <div className="hidden lg:block w-72 space-y-6">
            <div>
              <h3 className="font-semibold mb-3">Estado</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">Comprar ahora</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">En subasta</span>
                </label>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Precio</h3>
              <div className="flex gap-2">
                <Input placeholder="Min" className="text-sm" />
                <span className="flex items-center">a</span>
                <Input placeholder="Max" className="text-sm" />
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Estilo</h3>
              <Select value={filterStyle} onValueChange={setFilterStyle}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estilos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estilos</SelectItem>
                  <SelectItem value="DEGEN">DEGEN</SelectItem>
                  <SelectItem value="FINTECH">FINTECH</SelectItem>
                  <SelectItem value="STABLECOIN MAXI">STABLECOIN MAXI</SelectItem>
                  <SelectItem value="YIELD MAXI">YIELD MAXI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-3">Layer</h3>
              <Select value={filterLayer} onValueChange={setFilterLayer}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="L1">Layer 1</SelectItem>
                  <SelectItem value="L2">Layer 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Search and Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por artículo o rasgo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Precio de menor a mayor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popular">Más populares</SelectItem>
                    <SelectItem value="recent">Más recientes</SelectItem>
                    <SelectItem value="price-high">Precio: alto a bajo</SelectItem>
                    <SelectItem value="price-low">Precio: bajo a alto</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex gap-1 border rounded-lg p-1">
                  <Button
                    variant={viewMode === 2 ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(2)}
                  >
                    <Grid2X2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 4 ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(4)}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Results Count */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">{sortedArtworks.length} resultados</span>
              <Button variant="ghost" size="sm" className="lg:hidden">
                <Filter className="w-4 h-4 mr-2" />
                Filtros
              </Button>
            </div>

            {/* Gallery Grid */}
            <div className={`grid ${viewMode === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'} gap-4`}>
              {sortedArtworks.map((artwork) => (
                <Dialog key={artwork.id}>
                  <DialogTrigger asChild>
                    <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 border-border/50">
                      <div className="relative aspect-square overflow-hidden rounded-t-lg">
                        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-purple-500/20" />
                        
                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300" />
                        
                        {/* Quick actions */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="secondary" className="h-8 w-8 p-0">
                            <Heart className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Price badge */}
                        {artwork.forSale && (
                          <div className="absolute bottom-2 left-2">
                            <Badge variant="secondary" className="bg-background/90 text-foreground">
                              {artwork.price}
                            </Badge>
                          </div>
                        )}
                      </div>
                      
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium truncate text-sm">{artwork.title}</h3>
                            <p className="text-xs text-muted-foreground truncate">{artwork.artist}</p>
                          </div>
                          <Badge variant="outline" className="text-xs ml-2 flex-shrink-0">
                            {artwork.style}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Heart className="w-3 h-3" />
                              <span>{artwork.likes}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              <span>{artwork.views}</span>
                            </div>
                          </div>
                          {artwork.forSale && (
                            <span className="text-primary font-medium">{artwork.price}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </DialogTrigger>

                  {/* Full Screen Modal */}
                  <DialogContent className="max-w-4xl w-full h-[80vh]">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                      {/* Image */}
                      <div className="bg-gradient-to-br from-primary/10 to-purple-500/10 rounded-lg flex items-center justify-center">
                        <div className="aspect-square w-full max-w-sm bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-lg" />
                      </div>

                      {/* Details */}
                      <div className="flex flex-col">
                        <div className="flex-1">
                          <div className="flex gap-2 mb-4">
                            <Badge variant="secondary">{artwork.style}</Badge>
                            <Badge variant="outline">{artwork.layer}</Badge>
                            {artwork.forSale && <Badge className="bg-green-500/20 text-green-400">En venta</Badge>}
                          </div>

                          <h2 className="text-2xl font-bold mb-2">{artwork.title}</h2>
                          <p className="text-lg text-muted-foreground mb-4">por {artwork.artist}</p>
                          
                          <p className="text-muted-foreground mb-6">{artwork.description}</p>

                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="text-center p-4 bg-card rounded-lg border">
                              <div className="text-2xl font-bold text-red-500">{artwork.likes}</div>
                              <div className="text-sm text-muted-foreground">Likes</div>
                            </div>
                            <div className="text-center p-4 bg-card rounded-lg border">
                              <div className="text-2xl font-bold text-blue-500">{artwork.views}</div>
                              <div className="text-sm text-muted-foreground">Vistas</div>
                            </div>
                          </div>

                          {artwork.forSale && (
                            <div className="text-center p-6 bg-primary/10 rounded-lg mb-6 border border-primary/20">
                              <div className="text-3xl font-bold text-primary mb-2">{artwork.price}</div>
                              <Button size="lg" className="w-full">
                                Comprar Ahora
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1">
                            <Heart className="w-4 h-4 mr-2" />
                            Me gusta
                          </Button>
                          <Button variant="outline" className="flex-1">
                            <Share2 className="w-4 h-4 mr-2" />
                            Compartir
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>

            {/* Empty state */}
            {sortedArtworks.length === 0 && (
              <div className="text-center py-16">
                <div className="text-muted-foreground mb-4">No se encontraron obras con los filtros seleccionados</div>
                <Button variant="outline" onClick={() => {
                  setSearchTerm('');
                  setFilterStyle('all');
                  setFilterLayer('all');
                }}>
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalArtGalleryPage;