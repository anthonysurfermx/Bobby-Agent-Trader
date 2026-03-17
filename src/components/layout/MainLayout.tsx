// src/components/layout/MainLayout.tsx
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  PixelMenu,
  PixelX,
  PixelHome,
  PixelGithub,
  PixelMail,
  PixelSettings,
  PixelBook,
  PixelChevronDown,
  PixelSparkles,
  PixelCoins,
  PixelCalendar,
  PixelNetwork,
  PixelLayers,
  PixelSearch,
  PixelGamepad,
  PixelYoutube,
  PixelBarChart,
  PixelTrophy,
  PixelLogo,
  PixelBriefcase,
  PixelFileText,
  PixelZap,
  PixelLobster,
  PixelTarget
} from '@/components/ui/pixel-icons';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalSearch } from '@/components/GlobalSearch';

export default function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  // Navegación principal simplificada
  const mainNavigation = [
    { name: t('nav.home'), href: '/', Icon: PixelHome },
  ];

  // Navegación "Aprende" (dropdown)
  const aprendeNavigation = [
    { name: 'Blog', href: '/blog', Icon: PixelFileText, description: 'Growth insights & DeFi analysis' },
    { name: 'Video Tutoriales', href: '/academia/videos', Icon: PixelYoutube, description: 'Videos educativos de DeFi' },
    { name: 'Mercado LP', href: '/academia/juego/mercado-lp', Icon: PixelGamepad, description: 'Mini game educativo DeFi' },
  ];

  // Navegación del ecosistema (dropdown)
  const ecosistemaNavigation = [
    { name: t('nav.startups'), href: '/startups', Icon: PixelLayers, description: 'DeFi projects in Mexico' },
    { name: 'MVPs Hackathon', href: '/hackathon-projects', Icon: PixelTrophy, description: 'Hackathon winning projects' },
    { name: t('nav.communities'), href: '/comunidades', Icon: PixelNetwork, description: 'Groups and communities' },
    { name: t('nav.events'), href: '/eventos', Icon: PixelCalendar, description: 'Events and conferences' },
    { name: 'Trabajos Web3', href: '/ecosistema/trabajos', Icon: PixelBriefcase, description: 'Web3 jobs in Mexico' },
  ];

  // Navegación "Agentic World" (dropdown) - Polymarket Agent Radar first (star feature)
  const agenticNavigation = [
    { name: t('agenticWorld.navPolymarket'), href: '/agentic-world/polymarket', Icon: PixelLobster, description: t('agenticWorld.navPolymarketDesc') },
    { name: t('agenticWorld.navLeaderboard'), href: '/agentic-world/leaderboard', Icon: PixelTrophy, description: t('agenticWorld.navLeaderboardDesc') },
    { name: 'Bobby Agent Trader', href: '/agentic-world/bobby', Icon: PixelTarget, description: 'AI-powered autonomous trading — Bobby Axelrod mode' },
    { name: 'Agent Trading Forum', href: '/agentic-world/forum', Icon: PixelTarget, description: '24/7 autonomous debates — Alpha Hunter vs Red Team vs Bobby CIO' },
  ];

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isEcosistemaActive = () => {
    return ecosistemaNavigation.some(item => location.pathname.startsWith(item.href));
  };

  const isAprendeActive = () => {
    return aprendeNavigation.some(item => location.pathname.startsWith(item.href));
  };

  const isAgenticActive = () => {
    return agenticNavigation.some(item => location.pathname.startsWith(item.href));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Skip to content - Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Saltar al contenido principal
      </a>

      {/* Global Search */}
      <GlobalSearch />

      {/* Navbar */}
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2">
              <PixelCoins size={24} className="text-primary" />
              <PixelLogo size="md" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex md:items-center md:space-x-1">
              {mainNavigation.map((item) => {
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isActive(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <Icon size={16} />
                    {item.name}
                  </Link>
                );
              })}

              {/* Dropdown Agentic World - FIRST */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isAgenticActive()
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <PixelZap size={16} />
                    {t('nav.agenticWorld')}
                    <PixelChevronDown size={12} className="opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {agenticNavigation.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link
                          to={item.href}
                          className="flex items-start gap-3 cursor-pointer"
                        >
                          <Icon size={16} className="mt-0.5 text-cyan-500" />
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Dropdown Aprende */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isAprendeActive()
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <PixelBook size={16} />
                    {t('nav.learn')}
                    <PixelChevronDown size={12} className="opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {aprendeNavigation.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link
                          to={item.href}
                          className="flex items-start gap-3 cursor-pointer"
                        >
                          <Icon size={16} className="mt-0.5 text-primary" />
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Dropdown Ecosistema */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`
                      flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isEcosistemaActive()
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <PixelNetwork size={16} />
                    {t('nav.ecosystem')}
                    <PixelChevronDown size={12} className="opacity-50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {ecosistemaNavigation.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <DropdownMenuItem key={item.name} asChild>
                        <Link
                          to={item.href}
                          className="flex items-start gap-3 cursor-pointer"
                        >
                          <Icon size={16} className="mt-0.5 text-primary" />
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* NFT Collection Link */}
              <Link
                to="/nft-gallery"
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                  transition-colors hover:bg-accent hover:text-accent-foreground
                  ${isActive('/nft-gallery')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                  }
                `}
              >
                <PixelTrophy size={16} />
                {t('nav.nftCollection')}
              </Link>

              {/* Métricas Link */}
              <Link
                to="/metricas"
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
                  transition-colors hover:bg-accent hover:text-accent-foreground
                  ${isActive('/metricas')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                  }
                `}
              >
                <PixelBarChart size={16} />
                {t('nav.metrics')}
              </Link>
            </div>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => {
                  const event = new KeyboardEvent('keydown', {
                    key: 'k',
                    metaKey: true,
                    ctrlKey: true,
                  });
                  document.dispatchEvent(event);
                }}
              >
                <PixelSearch size={16} />
                <span className="hidden lg:inline">{t('search.search')}</span>
                <kbd className="hidden lg:inline pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </Button>
              <ThemeToggle />
              <LanguageSwitcher />
              <Button size="sm" asChild className="bg-gradient-to-r from-primary to-purple-600 hover:opacity-90">
                <Link to="/user">
                  <PixelSparkles size={16} className="mr-2" />
                  {t('nav.contribute')}
                </Link>
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center gap-1 md:hidden">
              <ThemeToggle />
              <LanguageSwitcher />
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg hover:bg-accent"
                aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <PixelX size={24} />
                ) : (
                  <PixelMenu size={24} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t max-h-[80vh] overflow-y-auto">
            <div className="container mx-auto px-4 py-3 space-y-0.5">
              {/* Main Navigation */}
              {mainNavigation.map((item) => {
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isActive(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <Icon size={18} />
                    {item.name}
                  </Link>
                );
              })}

              {/* Agentic World Section - FIRST */}
              <div className="pt-2 pb-0.5 px-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('nav.agenticWorld')}
                </p>
              </div>
              {agenticNavigation.map((item) => {
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isActive(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <Icon size={18} />
                    {item.name}
                  </Link>
                );
              })}

              {/* Aprende Section */}
              <div className="pt-2 pb-0.5 px-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('nav.learn')}
                </p>
              </div>
              {aprendeNavigation.map((item) => {
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isActive(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <Icon size={18} />
                    {item.name}
                  </Link>
                );
              })}

              {/* Ecosistema Section */}
              <div className="pt-2 pb-0.5 px-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('nav.ecosystem')}
                </p>
              </div>
              {ecosistemaNavigation.map((item) => {
                const Icon = item.Icon;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                      transition-colors hover:bg-accent hover:text-accent-foreground
                      ${isActive(item.href)
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    <Icon size={18} />
                    {item.name}
                  </Link>
                );
              })}

              {/* Mas */}
              <div className="pt-2 pb-0.5 px-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('nav.more')}
                </p>
              </div>
              <Link
                to="/nft-gallery"
                className={`
                  flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                  transition-colors hover:bg-accent hover:text-accent-foreground
                  ${isActive('/nft-gallery')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                  }
                `}
              >
                <PixelTrophy size={18} />
                {t('nav.nftCollection')}
              </Link>
              <Link
                to="/metricas"
                className={`
                  flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg
                  transition-colors hover:bg-accent hover:text-accent-foreground
                  ${isActive('/metricas')
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                  }
                `}
              >
                <PixelBarChart size={18} />
                {t('nav.metrics')}
              </Link>

              {/* Mobile Actions */}
              <div className="pt-3 pb-1">
                <Button size="sm" className="w-full justify-start bg-gradient-to-r from-primary to-purple-600" asChild>
                  <Link to="/user">
                    <PixelSparkles size={16} className="mr-2" />
                    {t('nav.contribute')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <PixelCoins size={24} className="text-primary" />
                <PixelLogo size="sm" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('footer.tagline')}
              </p>
              <div className="flex space-x-3">
                <a
                  href="https://github.com/anthonysurfermx/defi-mexico-hub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors"
                  aria-label="GitHub del proyecto"
                >
                  <PixelGithub size={20} />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold mb-4">{t('footer.quickLinks')}</h3>
              <ul className="space-y-2">
                <li>
                  <Link to="/startups" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Startups
                  </Link>
                </li>
                <li>
                  <Link to="/comunidades" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Comunidades
                  </Link>
                </li>
                <li>
                  <Link to="/eventos" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Eventos
                  </Link>
                </li>
                <li>
                  <Link to="/digital-art-defi" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    NFT Studio
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/academia/videos" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Video Tutoriales
                  </Link>
                </li>
                <li>
                  <Link to="/academia/juego/mercado-lp" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    Mercado LP Game
                  </Link>
                </li>
                <li>
                  <Link to="/nft-gallery" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {t('nav.nftCollection')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className="font-semibold mb-4">{t('footer.newsletter')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('footer.newsletterDesc')}
              </p>
              <form className="space-y-2" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="email"
                  placeholder="tu@email.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button type="submit" className="w-full">
                  {t('footer.subscribe')}
                </Button>
              </form>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="mt-8 pt-8 border-t">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-muted-foreground">
                {t('footer.copyright', { year: new Date().getFullYear() })}
              </p>
              <div className="flex items-center space-x-6">
                <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t('footer.terms')}
                </a>
                <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                  {t('footer.privacy')}
                </a>
                <a href="mailto:hola@defimexico.com" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                  <PixelMail size={12} />
                  {t('footer.contact')}
                </a>
                
                {/* Botón Admin movido aquí - discreto */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  asChild
                  className="text-muted-foreground hover:text-primary opacity-60 hover:opacity-100 transition-opacity"
                >
                  <Link to="/admin" className="inline-flex items-center gap-1">
                    <PixelSettings size={12} />
                    <span className="text-xs">Admin</span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}