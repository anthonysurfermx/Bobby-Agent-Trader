import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import LogoDeFiMx from "@/components/ui/LogoDeFiMx";
import { WalletConnect } from "@/components/WalletConnect";
import { PixelMenu, PixelX, PixelSearch, PixelChevronRight, PixelChevronDown, PixelPlus } from "@/components/ui/pixel-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Briefcase, Rocket, Users, BarChart3, Trophy, BookOpen, Gamepad2, Video, FileText, ScanSearch, Bot, MessageSquare } from "lucide-react";

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  const navItems = [
    { label: "Inicio", href: "/" },
    { label: "Startups", href: "/startups" },
    { label: "Comunidades", href: "/comunidades" },
    { label: "NFT Collection", href: "/nft-gallery" },
    { label: "TikTok", href: "/tiktok" },
    { label: "Eventos", href: "/eventos" },
    { label: "Blog", href: "/blog" },
    { label: "Métricas", href: "/metricas" }
  ];

  const ecosistemaItems = [
    { label: "Startups", href: "/startups", icon: Rocket },
    { label: "MVPs Hackathon", href: "/hackathon-projects", icon: Trophy },
    { label: "Comunidades", href: "/comunidades", icon: Users },
    { label: "Trabajos Web3", href: "/ecosistema/trabajos", icon: Briefcase },
  ];

  const learnItems = [
    { label: "Blog", href: "/blog", icon: FileText },
    { label: "Video Tutorials", href: "/academia/videos", icon: Video },
    { label: "Mercado LP", href: "/academia/juego/mercado-lp", icon: Gamepad2 },
  ];

  const agenticItems = [
    { label: "Polymarket Agent Radar", href: "/agentic-world/polymarket", icon: ScanSearch },
    { label: "Bobby Agent Trader", href: "/agentic-world/bobby", icon: Bot },
    { label: "Agent Trading Forum", href: "/agentic-world/forum", icon: MessageSquare },
    { label: "DefiLlama Leaderboard", href: "/agentic-world/leaderboard", icon: BarChart3 },
  ];

  const isEcosistemaActive = () => {
    return ecosistemaItems.some(item => location.pathname.startsWith(item.href));
  };

  const isLearnActive = () => {
    return learnItems.some(item => location.pathname.startsWith(item.href));
  };

  const isAgenticActive = () => {
    return location.pathname.startsWith("/agentic-world");
  };

  const isActivePage = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };

  // Generate breadcrumbs
  const generateBreadcrumbs = () => {
    const pathSegments = location.pathname.split("/").filter(Boolean);
    
    if (pathSegments.length === 0) return null;

    const breadcrumbs = [
      { label: "Inicio", href: "/" }
    ];

    let currentPath = "";
    pathSegments.forEach((segment) => {
      currentPath += `/${segment}`;
      const navItem = navItems.find(item => item.href === currentPath);
      if (navItem) {
        breadcrumbs.push({ label: navItem.label, href: currentPath });
      } else {
        // Handle dynamic routes like /startups/[id]
        const capitalizedSegment = segment.charAt(0).toUpperCase() + segment.slice(1);
        breadcrumbs.push({ label: capitalizedSegment, href: currentPath });
      }
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <>
      <motion.header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "h-15 bg-background/80 backdrop-blur-md border-b border-border shadow-sm"
            : "h-20 bg-background/95"
        }`}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3 group">
              <LogoDeFiMx 
                size={isScrolled ? "sm" : "md"}
                animated
                className="transition-all duration-300"
              />
              <motion.span
                className={`font-bold text-foreground transition-all duration-300 ${
                  isScrolled ? "text-lg" : "text-xl"
                }`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                DeFi México
              </motion.span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <Link
                to="/"
                className={`relative text-sm font-medium transition-colors group ${
                  isActivePage("/") && location.pathname === "/"
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Inicio
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                    location.pathname === "/" ? "w-full" : ""
                  }`}
                />
              </Link>

              {/* Ecosistema Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`relative text-sm font-medium transition-colors group flex items-center gap-1 ${
                      isEcosistemaActive()
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Ecosistema
                    <PixelChevronDown size={14} />
                    <span
                      className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                        isEcosistemaActive() ? "w-full" : ""
                      }`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {ecosistemaItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        to={item.href}
                        className={`flex items-center gap-2 ${
                          isActivePage(item.href) ? "text-primary" : ""
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Learn Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`relative text-sm font-medium transition-colors group flex items-center gap-1 ${
                      isLearnActive()
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Learn
                    <PixelChevronDown size={14} />
                    <span
                      className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                        isLearnActive() ? "w-full" : ""
                      }`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {learnItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        to={item.href}
                        className={`flex items-center gap-2 ${
                          isActivePage(item.href) ? "text-primary" : ""
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Agentic World Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`relative text-sm font-medium transition-colors group flex items-center gap-1 ${
                      isAgenticActive()
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Agentic World
                    <PixelChevronDown size={14} />
                    <span
                      className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                        isAgenticActive() ? "w-full" : ""
                      }`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {agenticItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        to={item.href}
                        className={`flex items-center gap-2 ${
                          location.pathname === item.href ? "text-primary" : ""
                        }`}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Link
                to="/nft-gallery"
                className={`relative text-sm font-medium transition-colors group ${
                  isActivePage("/nft-gallery")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                NFT Collection
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                    isActivePage("/nft-gallery") ? "w-full" : ""
                  }`}
                />
              </Link>

              <Link
                to="/tiktok"
                className={`relative text-sm font-medium transition-colors group ${
                  isActivePage("/tiktok")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                TikTok
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                    isActivePage("/tiktok") ? "w-full" : ""
                  }`}
                />
              </Link>

              <Link
                to="/eventos"
                className={`relative text-sm font-medium transition-colors group ${
                  isActivePage("/eventos")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Eventos
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                    isActivePage("/eventos") ? "w-full" : ""
                  }`}
                />
              </Link>

              <Link
                to="/metricas"
                className={`relative text-sm font-medium transition-colors group ${
                  isActivePage("/metricas")
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Métricas
                <span
                  className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full ${
                    isActivePage("/metricas") ? "w-full" : ""
                  }`}
                />
              </Link>
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
              >
                <PixelSearch size={16} />
              </Button>
              <WalletConnect />
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground hover:shadow-neon transition-all duration-300"
                asChild
              >
                <Link to="/user">
                  <PixelPlus size={14} className="mr-1.5" />
                  Contribuye
                </Link>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              <motion.div
                animate={isMobileMenuOpen ? "open" : "closed"}
                className="w-6 h-6 relative"
              >
                <motion.span
                  variants={{
                    closed: { rotate: 0, y: 0 },
                    open: { rotate: 45, y: 8 }
                  }}
                  className="absolute w-6 h-0.5 bg-current top-1.5 left-0 origin-center transition-all"
                />
                <motion.span
                  variants={{
                    closed: { opacity: 1 },
                    open: { opacity: 0 }
                  }}
                  className="absolute w-6 h-0.5 bg-current top-3 left-0"
                />
                <motion.span
                  variants={{
                    closed: { rotate: 0, y: 0 },
                    open: { rotate: -45, y: -8 }
                  }}
                  className="absolute w-6 h-0.5 bg-current top-4.5 left-0 origin-center transition-all"
                />
              </motion.div>
            </button>
          </div>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="border-t border-border bg-background/50 backdrop-blur-sm"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <nav className="flex items-center space-x-2 text-sm">
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.href} className="flex items-center">
                    {index > 0 && (
                      <PixelChevronRight className="text-muted-foreground mx-2" size={16} />
                    )}
                    <Link
                      to={crumb.href}
                      className={`transition-colors ${
                        index === breadcrumbs.length - 1
                          ? "text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {crumb.label}
                    </Link>
                  </div>
                ))}
              </nav>
            </div>
          </motion.div>
        )}
      </motion.header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
            />

            {/* Mobile Menu */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 h-full w-80 bg-card border-l border-border z-50 md:hidden"
            >
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <span className="text-lg font-semibold text-foreground">
                    Menú
                  </span>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <PixelX size={20} />
                  </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-6 py-4 overflow-y-auto">
                  <div className="space-y-2">
                    {/* Inicio */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <Link
                        to="/"
                        className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                          location.pathname === "/"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        Inicio
                      </Link>
                    </motion.div>

                    {/* Ecosistema Section */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="pt-2"
                    >
                      <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Ecosistema
                      </p>
                      <div className="space-y-1">
                        {ecosistemaItems.map((item) => (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              isActivePage(item.href)
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>

                    {/* Learn Section */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 }}
                      className="pt-2"
                    >
                      <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Learn
                      </p>
                      <div className="space-y-1">
                        {learnItems.map((item) => (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              isActivePage(item.href)
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>

                    {/* Agentic World Section */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.28 }}
                      className="pt-2"
                    >
                      <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Agentic World
                      </p>
                      <div className="space-y-1">
                        {agenticItems.map((item) => (
                          <Link
                            key={item.href}
                            to={item.href}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              location.pathname === item.href
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>

                    {/* Other Items */}
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 }}
                      className="pt-2"
                    >
                      <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Más
                      </p>
                      <div className="space-y-1">
                        <Link
                          to="/nft-gallery"
                          className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActivePage("/nft-gallery")
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          NFT Collection
                        </Link>
                        <Link
                          to="/tiktok"
                          className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActivePage("/tiktok")
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          TikTok
                        </Link>
                        <Link
                          to="/eventos"
                          className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActivePage("/eventos")
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          Eventos
                        </Link>
                        <Link
                          to="/metricas"
                          className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActivePage("/metricas")
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          Métricas
                        </Link>
                      </div>
                    </motion.div>
                  </div>
                </nav>

                {/* Actions */}
                <div className="p-6 border-t border-border space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <PixelSearch size={16} className="mr-2" />
                    Buscar
                  </Button>
                  <div className="w-full">
                    <WalletConnect />
                  </div>
                  <Button
                    className="w-full bg-gradient-primary text-primary-foreground"
                    asChild
                  >
                    <Link to="/user" onClick={() => setIsMobileMenuOpen(false)}>
                      <PixelPlus size={14} className="mr-1.5" />
                      Contribuye
                    </Link>
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Spacer to prevent content overlap */}
      <div className={isScrolled ? "h-15" : "h-20"} />
    </>
  );
};

export default Navbar;