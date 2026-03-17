import { Link } from "react-router-dom";
import { PixelExternalLink, PixelCalendar, PixelUsers } from "@/components/ui/pixel-icons";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

interface StartupCardProps {
  id: string;
  name: string;
  description: string;
  foundedYear: number;
  founders: string[];
  website?: string;
  logo?: string;
  tvl?: string;
  users?: string;
  tags?: string[];
}

const StartupCard = ({ 
  id, 
  name, 
  description, 
  foundedYear, 
  founders, 
  website, 
  logo, 
  tvl, 
  users,
  tags 
}: StartupCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card className="h-full bg-card hover:shadow-elegant card-hover border-border hover:border-primary/30">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-lg">
                {logo ? (
                  <img src={logo} alt={`Logo de ${name} - startup DeFi mexicana`} className="w-full h-full object-cover rounded-xl" />
                ) : (
                  name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">{name}</h3>
                <div className="flex items-center text-muted-foreground text-sm">
                  <PixelCalendar size={16} className="mr-1" />
                  {foundedYear}
                </div>
              </div>
            </div>
            {website && (
              <Button variant="ghost" size="icon" asChild>
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <PixelExternalLink size={16} />
                </a>
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm line-clamp-3">
            {description}
          </p>

          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="default" className="text-xs bg-primary/10 text-primary hover:bg-primary/20">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {founders.slice(0, 2).map((founder) => (
              <Badge key={founder} variant="secondary" className="text-xs">
                <PixelUsers size={12} className="mr-1" />
                {founder}
              </Badge>
            ))}
            {founders.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{founders.length - 2} más
              </Badge>
            )}
          </div>

          {(tvl || users) && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              {tvl && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-primary">{tvl}</div>
                  <div className="text-xs text-muted-foreground">TVL</div>
                </div>
              )}
              {users && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-secondary">{users}</div>
                  <div className="text-xs text-muted-foreground">Usuarios</div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter>
          <Button variant="outline" asChild className="w-full hover:bg-primary hover:text-primary-foreground">
            <Link to={`/startups/${id}`}>
              Ver más detalles
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
};

export default StartupCard;