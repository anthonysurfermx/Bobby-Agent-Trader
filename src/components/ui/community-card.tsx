// src/components/ui/community-card.tsx
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, getTwitterAvatar } from "@/lib/utils";
import { Youtube } from "lucide-react";
import {
  PixelUsers,
  PixelMapPin,
  PixelCalendar,
  PixelShield,
  PixelStar,
  PixelGlobe,
  PixelGithub,
  PixelTwitter,
  PixelDiscord,
  PixelExternalLink
} from "@/components/ui/pixel-icons";

interface CommunityCardProps {
  id: string;
  name: string;
  description: string;
  logo?: string | null;
  members?: string | number;
  category?: string;
  location?: string | null;
  tags?: string[] | null;
  website?: string | null;
  socialLinks?: any;
  isActive?: boolean;
  isFeatured?: boolean;
  isOfficial?: boolean;
  is_official?: boolean;
  foundedDate?: string | null;
  slug?: string;
}

const categoryColors: Record<string, string> = {
  defi: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  blockchain: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  bitcoin: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  ethereum: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  nft: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  dao: "bg-green-500/10 text-green-500 border-green-500/20",
  web3: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  crypto: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  trading: "bg-red-500/10 text-red-500 border-red-500/20",
  development: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  education: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  gaming: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  metaverse: "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20",
  investment: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  other: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  default: "bg-gray-500/10 text-gray-500 border-gray-500/20"
};

export default function CommunityCard({
  id,
  name,
  description,
  logo,
  members = "0",
  category = "",
  location,
  tags = [],
  website,
  socialLinks,
  isActive = true,
  isFeatured = false,
  isOfficial = false,
  is_official = false,
  foundedDate,
  slug
}: CommunityCardProps) {
  const official = isOfficial ?? is_official ?? false;
  // Parsear social links si vienen como JSON
  const parsedSocialLinks = typeof socialLinks === 'string'
    ? JSON.parse(socialLinks)
    : socialLinks || {};

  const categoryColor = categoryColors[category?.toLowerCase()] || categoryColors.default;
  const memberCount = typeof members === 'number' ? members.toLocaleString() : members;
  const categoryBadgeClass = cn(
    "text-xs",
    categoryColor,
    official && "border-slate-300/80 text-slate-100 bg-slate-500/10 shadow-[0_0_0_1px_rgba(148,163,184,0.35)]"
  );

  // Calcular años desde fundación
  const foundedYear = foundedDate ? new Date(foundedDate).getFullYear() : null;

  // Obtener imagen: prioridad logo > twitter avatar > inicial
  const twitterAvatar = parsedSocialLinks?.twitter ? getTwitterAvatar(parsedSocialLinks.twitter) : null;
  const displayImage = logo || twitterAvatar;
  
  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300 hover:shadow-xl",
      "bg-gradient-to-br from-card to-card/80",
      "h-full flex flex-col", // Altura uniforme para todas las cards
      official
        ? [
            "border-[1.5px] border-slate-200/80",
            "ring-2 ring-slate-100/50",
            "shadow-[0_0_0_1px_rgba(226,232,240,0.8),0_16px_40px_rgba(148,163,184,0.25)]",
            "hover:border-slate-50 hover:shadow-[0_0_0_1px_rgba(248,250,252,0.9),0_20px_48px_rgba(148,163,184,0.35)]",
            "backdrop-blur-sm"
          ].join(" ")
        : "border-border/50",
      isFeatured && !official && "ring-2 ring-primary/20",
      !isActive && "opacity-60"
    )}>
      {/* Official & Featured Badges */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 items-end">
        {official && (
          <Badge className="bg-gradient-to-r from-slate-400 to-slate-500 text-white border-0 shadow-md">
            <PixelShield className="mr-1" size={12} />
            Oficial
          </Badge>
        )}
        {isFeatured && !official && (
          <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0">
            <PixelStar className="mr-1" size={12} />
            Destacada
          </Badge>
        )}
      </div>

      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          {/* Logo */}
          <div className="relative">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center overflow-hidden">
              {displayImage ? (
                <>
                  <img
                    src={displayImage}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <span className="hidden text-2xl font-bold text-primary">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold text-primary">
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {isActive && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card" />
            )}
          </div>

          {/* Title and Category */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-foreground truncate group-hover:text-primary transition-colors">
              {name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={categoryBadgeClass}>
                {category}
              </Badge>
              {isActive && (
                <PixelShield className="text-green-500" size={16} />
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 flex flex-col">
        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {description}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <PixelUsers className="text-muted-foreground" size={16} />
            <span className="font-medium">{memberCount}</span>
            <span className="text-muted-foreground">miembros</span>
          </div>
          
          {location && (
            <div className="flex items-center gap-2 text-sm">
              <PixelMapPin className="text-muted-foreground" size={16} />
              <span className="text-muted-foreground truncate">{location}</span>
            </div>
          )}

          {foundedYear && (
            <div className="flex items-center gap-2 text-sm">
              <PixelCalendar className="text-muted-foreground" size={16} />
              <span className="text-muted-foreground">Desde {foundedYear}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="text-xs px-2 py-0.5"
              >
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge 
                variant="outline" 
                className="text-xs px-2 py-0.5 text-muted-foreground"
              >
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Social Links - siempre al final */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-auto">
          <div className="flex gap-1">
            {website && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                asChild
              >
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visitar sitio web de ${name}`}
                >
                  <PixelGlobe size={16} />
                </a>
              </Button>
            )}
            
            {parsedSocialLinks?.github && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                asChild
              >
                <a
                  href={parsedSocialLinks.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`GitHub de ${name}`}
                >
                  <PixelGithub size={16} />
                </a>
              </Button>
            )}
            
            {parsedSocialLinks?.twitter && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                asChild
              >
                <a
                  href={parsedSocialLinks.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Twitter de ${name}`}
                >
                  <PixelTwitter size={16} />
                </a>
              </Button>
            )}
            
            {parsedSocialLinks?.discord && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                asChild
              >
                <a
                  href={parsedSocialLinks.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Discord de ${name}`}
                >
                  <PixelDiscord size={16} />
                </a>
              </Button>
            )}

            {parsedSocialLinks?.youtube && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                asChild
              >
                <a
                  href={parsedSocialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`YouTube de ${name}`}
                >
                  <Youtube className="w-4 h-4" />
                </a>
              </Button>
            )}
          </div>

          {/* View Details Button */}
          <Button 
            variant="default" 
            size="sm"
            className="group/btn"
            asChild
          >
            <Link to={`/comunidades/${slug || id}`}>
              Ver más
              <PixelExternalLink className="ml-1 transition-transform group-hover/btn:translate-x-0.5" size={12} />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
