// src/components/advocates/AdvocateCard.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MapPin, Github, Twitter, Linkedin, Globe, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DeFiAdvocate } from '@/services/advocates.service';

interface AdvocateCardProps {
  advocate: DeFiAdvocate;
}

const trackColors: Record<string, string> = {
  developer: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  lawyer: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  financial: 'bg-green-500/10 text-green-500 border-green-500/20',
  designer: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  marketer: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  other: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
};

export default function AdvocateCard({ advocate }: AdvocateCardProps) {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const trackKey = advocate.track || 'other';
  const trackLabel = t(`advocates.tracks.${trackKey}`, { defaultValue: advocate.track || t('advocates.tracks.other') });
  const trackColor = trackColors[trackKey] || 'bg-gray-500/10 text-gray-500';

  return (
    <>
    <Card className="group hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden border-2 hover:border-primary/20">
      {/* Gradient Header Background */}
      <div className="h-24 bg-gradient-to-br from-primary/10 via-purple-500/10 to-pink-500/10 relative">
        <div className="absolute inset-0 bg-grid-white/5" />
      </div>

      <CardContent className="p-6 -mt-16 relative">
        {/* Header con Avatar y Track */}
        <div className="flex flex-col items-center text-center mb-4">
          <Avatar className="w-28 h-28 mb-4 ring-4 ring-background group-hover:ring-8 group-hover:ring-primary/20 transition-all shadow-xl">
            <AvatarImage src={advocate.avatar_url || undefined} alt={advocate.name} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary via-purple-500 to-pink-500 text-5xl">
              😊
            </AvatarFallback>
          </Avatar>

          {advocate.track && (
            <Badge variant="outline" className={`mb-3 ${trackColor}`}>
              {trackLabel}
            </Badge>
          )}

          <h3 className="font-bold text-xl mb-1">{advocate.name}</h3>

          {advocate.location && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
              <MapPin className="w-4 h-4" />
              <span>{advocate.location}</span>
            </div>
          )}

          {advocate.expertise && (
            <p className="text-sm text-primary font-medium">{advocate.expertise}</p>
          )}
        </div>

        {/* Bio */}
        {advocate.bio && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {advocate.bio}
          </p>
        )}

        {/* Specializations */}
        {advocate.specializations && advocate.specializations.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {advocate.specializations.slice(0, 4).map((spec, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {spec}
              </Badge>
            ))}
            {advocate.specializations.length > 4 && (
              <Badge variant="secondary" className="text-xs">
                +{advocate.specializations.length - 4}
              </Badge>
            )}
          </div>
        )}

        {/* Social Links y Ver más */}
        <div className="space-y-3 pt-4 border-t border-dashed">
          <div className="flex gap-2 justify-center">
            {advocate.twitter_url && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                asChild
              >
                <a
                  href={advocate.twitter_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter"
                >
                  <Twitter className="h-4 w-4" />
                </a>
              </Button>
            )}

            {advocate.github_url && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-gray-500/10 hover:text-gray-900 dark:hover:text-white transition-colors"
                asChild
              >
                <a
                  href={advocate.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub"
                >
                  <Github className="h-4 w-4" />
                </a>
              </Button>
            )}

            {advocate.linkedin_url && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-blue-600/10 hover:text-blue-600 transition-colors"
                asChild
              >
                <a
                  href={advocate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              </Button>
            )}

            {advocate.website && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 hover:bg-primary/10 hover:text-primary transition-colors"
                asChild
              >
                <a
                  href={advocate.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                >
                  <Globe className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>

          {/* Botón Ver más */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setIsModalOpen(true)}
          >
            {t('advocates.card.viewMore')}
            <ExternalLink className="h-3 w-3 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>

    {/* Modal de Perfil Completo */}
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4 mb-4">
            <Avatar className="w-20 h-20 ring-4 ring-primary/20">
              <AvatarImage src={advocate.avatar_url || undefined} alt={advocate.name} className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary via-purple-500 to-pink-500 text-4xl">
                😊
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-2xl mb-2">{advocate.name}</DialogTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={trackColor}>
                  {trackLabel}
                </Badge>
                {advocate.location && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {advocate.location}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogDescription asChild>
          <div className="space-y-6">
            {/* Expertise */}
            {advocate.expertise && (
              <div>
                <h3 className="font-semibold text-foreground mb-2">{t('advocates.card.specialty')}</h3>
                <p className="text-sm text-primary font-medium">{advocate.expertise}</p>
              </div>
            )}

            {/* Bio */}
            {advocate.bio && (
              <div>
                <h3 className="font-semibold text-foreground mb-2">{t('advocates.card.biography')}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{advocate.bio}</p>
              </div>
            )}

            {/* Specializations */}
            {advocate.specializations && advocate.specializations.length > 0 && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">{t('advocates.card.specializations')}</h3>
                <div className="flex flex-wrap gap-2">
                  {advocate.specializations.map((spec, index) => (
                    <Badge key={index} variant="secondary">
                      {spec}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Achievements */}
            {advocate.achievements && advocate.achievements.length > 0 && (
              <div>
                <h3 className="font-semibold text-foreground mb-3">{t('advocates.card.achievements')}</h3>
                <ul className="space-y-2">
                  {advocate.achievements.map((achievement, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>{achievement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Social Links */}
            <div>
              <h3 className="font-semibold text-foreground mb-3">{t('advocates.card.links')}</h3>
              <div className="flex flex-wrap gap-2">
                {advocate.twitter_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={advocate.twitter_url} target="_blank" rel="noopener noreferrer">
                      <Twitter className="h-4 w-4 mr-2" />
                      Twitter
                    </a>
                  </Button>
                )}
                {advocate.github_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={advocate.github_url} target="_blank" rel="noopener noreferrer">
                      <Github className="h-4 w-4 mr-2" />
                      GitHub
                    </a>
                  </Button>
                )}
                {advocate.linkedin_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={advocate.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4 mr-2" />
                      LinkedIn
                    </a>
                  </Button>
                )}
                {advocate.website && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={advocate.website} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-4 w-4 mr-2" />
                      {t('advocates.card.website')}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
    </>
  );
}
