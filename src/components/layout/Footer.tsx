import { Link } from "react-router-dom";
import { Github, Mail, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LogoDeFiMx from "@/components/ui/LogoDeFiMx";

const Footer = () => {
  const quickLinks = [
    { name: "Inicio", path: "/" },
    { name: "Startups", path: "/startups" },
    { name: "Academia", path: "/academia" },
    { name: "Mercado LP", path: "/academia/juego/mercado-lp" },
    { name: "NFT Studio", path: "/digital-art-defi" },
    { name: "Oportunidades", path: "/oportunidades" },
    { name: "Comunidades", path: "/comunidades" },
    { name: "Blog", path: "/blog" },
    { name: "Eventos", path: "/eventos" },
  ];

  const resources = [
    { name: "FAQ", path: "/faq" },
    { name: "Administración", path: "/admin" },
  ];

  return (
    <footer className="bg-darker-surface border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <LogoDeFiMx size="sm" />
              <span className="text-xl font-bold text-gradient">DeFi México</span>
            </div>
            <p className="text-muted-foreground mb-6 max-w-md">
              Construyendo el futuro de las finanzas descentralizadas en México. 
              Conectamos startups, desarrolladores y entusiastas para crear un 
              ecosistema DeFi próspero.
            </p>
            
            {/* Newsletter */}
            <div className="space-y-3">
              <h4 className="font-semibold text-foreground">Newsletter</h4>
              <div className="flex space-x-2">
                <Input 
                  placeholder="Tu email" 
                  className="max-w-xs"
                />
                <Button variant="default" size="sm">
                  Suscribirse
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Enlaces Rápidos</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Recursos</h4>
            <ul className="space-y-2">
              {resources.map((resource) => (
                <li key={resource.path}>
                  <Link
                    to={resource.path}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {resource.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row justify-between items-center">
          <p className="text-muted-foreground text-sm">
            © 2024 DeFi México. Todos los derechos reservados.
          </p>
          
          {/* Social Links */}
          <div className="flex space-x-4 mt-4 sm:mt-0">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-primary"
              asChild
            >
              <a href="https://t.me/defimexico" target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-5 h-5" />
              </a>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-primary"
              asChild
            >
              <a href="https://github.com/anthonysurfermx/defi-mexico-hub" target="_blank" rel="noopener noreferrer">
                <Github className="w-5 h-5" />
              </a>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-primary"
              asChild
            >
              <a href="https://lu.ma/defimexico" target="_blank" rel="noopener noreferrer">
                <Send className="w-5 h-5" />
              </a>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-primary"
              asChild
            >
              <a href="mailto:hola@defimexico.org" target="_blank" rel="noopener noreferrer">
                <Mail className="w-5 h-5" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;