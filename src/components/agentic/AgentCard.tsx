// src/components/agentic/AgentCard.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Github, Twitter, Globe, ExternalLink, Bot, Shield, Zap, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AgenticProject } from '@/data/agentic-projects';

interface AgentCardProps {
  project: AgenticProject;
}

const categoryColors: Record<string, string> = {
  trading: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  prediction: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  yield: 'bg-green-500/10 text-green-500 border-green-500/20',
  infrastructure: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  privacy: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  analytics: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-500/10 text-green-500 border-green-500/20',
  beta: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  development: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const riskColors: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function AgentCard({ project }: AgentCardProps) {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categoryColor = categoryColors[project.category] || categoryColors.analytics;
  const statusColor = statusColors[project.status] || statusColors.development;

  return (
    <>
      <Card className="group hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden border-2 hover:border-cyan-500/20">
        {/* Gradient Header */}
        <div className="h-20 bg-gradient-to-br from-cyan-500/10 via-teal-500/10 to-emerald-500/10 relative">
          <div className="absolute inset-0 bg-grid-white/5" />
          {project.is_featured && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-gradient-to-r from-cyan-500 to-teal-500 text-white border-0 text-[10px]">
                <Sparkles className="w-3 h-3 mr-1" />
                Featured
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-6 -mt-10 relative">
          {/* Icon + Name */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center ring-4 ring-background shadow-lg shrink-0">
              <Bot className="w-7 h-7 text-cyan-500" />
            </div>
            <div className="flex-1 min-w-0 pt-2">
              <h3 className="font-bold text-lg truncate">{project.name}</h3>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge variant="outline" className={`text-[10px] ${categoryColor}`}>
                  {t(`agenticWorld.categories.${project.category}`)}
                </Badge>
                <Badge variant="outline" className={`text-[10px] ${statusColor}`}>
                  {t(`agenticWorld.status.${project.status}`)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
            {project.description}
          </p>

          {/* Tags */}
          {project.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {project.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {project.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{project.tags.length - 3}
                </Badge>
              )}
            </div>
          )}

          {/* Risk Level */}
          {project.risk_level && (
            <div className="mb-4">
              <Badge variant="outline" className={`text-[10px] ${riskColors[project.risk_level]}`}>
                <Shield className="w-3 h-3 mr-1" />
                {t('agenticWorld.riskLevel.label')}: {t(`agenticWorld.riskLevel.${project.risk_level}`)}
              </Badge>
            </div>
          )}

          {/* Social Links + View More */}
          <div className="space-y-3 pt-4 border-t border-dashed">
            <div className="flex gap-2 justify-center">
              {project.github_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-gray-500/10 hover:text-gray-900 dark:hover:text-white transition-colors"
                  asChild
                >
                  <a href={project.github_url} target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                    <Github className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {project.twitter_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                  asChild
                >
                  <a href={project.twitter_url} target="_blank" rel="noopener noreferrer" aria-label="Twitter">
                    <Twitter className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {project.website && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors"
                  asChild
                >
                  <a href={project.website} target="_blank" rel="noopener noreferrer" aria-label="Website">
                    <Globe className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setIsModalOpen(true)}
            >
              {t('agenticWorld.card.viewMore')}
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center ring-4 ring-cyan-500/20 shrink-0">
                <Bot className="w-8 h-8 text-cyan-500" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-2xl mb-2">{project.name}</DialogTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={categoryColor}>
                    {t(`agenticWorld.categories.${project.category}`)}
                  </Badge>
                  <Badge variant="outline" className={statusColor}>
                    {t(`agenticWorld.status.${project.status}`)}
                  </Badge>
                  {project.risk_level && (
                    <Badge variant="outline" className={riskColors[project.risk_level]}>
                      <Shield className="w-3 h-3 mr-1" />
                      {t('agenticWorld.riskLevel.label')}: {t(`agenticWorld.riskLevel.${project.risk_level}`)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <DialogDescription asChild>
            <div className="space-y-6">
              {/* Full Description */}
              <div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {project.longDescription || project.description}
                </p>
              </div>

              {/* Highlights */}
              {project.highlights && project.highlights.length > 0 && (
                <div>
                  <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyan-500" />
                    {t('agenticWorld.card.highlights')}
                  </h3>
                  <ul className="space-y-2">
                    {project.highlights.map((highlight, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-cyan-500 mt-1">•</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tags */}
              {project.tags.length > 0 && (
                <div>
                  <h3 className="font-semibold text-foreground mb-3">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Links */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">{t('agenticWorld.card.links')}</h3>
                <div className="flex flex-wrap gap-2">
                  {project.github_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.github_url} target="_blank" rel="noopener noreferrer">
                        <Github className="h-4 w-4 mr-2" />
                        GitHub
                      </a>
                    </Button>
                  )}
                  {project.twitter_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.twitter_url} target="_blank" rel="noopener noreferrer">
                        <Twitter className="h-4 w-4 mr-2" />
                        Twitter
                      </a>
                    </Button>
                  )}
                  {project.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={project.website} target="_blank" rel="noopener noreferrer">
                        <Globe className="h-4 w-4 mr-2" />
                        {t('agenticWorld.card.website')}
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
