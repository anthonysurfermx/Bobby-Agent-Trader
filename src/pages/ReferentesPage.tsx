// src/pages/ReferentesPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { Users, Sparkles, Filter } from 'lucide-react';
import { advocatesService, type DeFiAdvocate } from '@/services/advocates.service';
import AdvocateCard from '@/components/advocates/AdvocateCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useAuth } from '@/hooks/useAuth';
import { EntityComments } from '@/components/BlogComments';

export default function ReferentesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [advocates, setAdvocates] = useState<DeFiAdvocate[]>([]);
  const [filteredAdvocates, setFilteredAdvocates] = useState<DeFiAdvocate[]>([]);
  const [selectedTrack, setSelectedTrack] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleProposeReferent = () => {
    if (user) {
      navigate('/user/referentes/nuevo');
    } else {
      navigate('/login?redirectTo=/user/referentes/nuevo');
    }
  };

  const trackFilters = [
    { value: 'all', label: t('advocates.tracks.all') },
    { value: 'developer', label: t('advocates.tracks.developer') },
    { value: 'financial', label: t('advocates.tracks.financial') },
    { value: 'lawyer', label: t('advocates.tracks.lawyer') },
    { value: 'designer', label: t('advocates.tracks.designer') },
    { value: 'marketer', label: t('advocates.tracks.marketer') },
    { value: 'other', label: t('advocates.tracks.other') },
  ];

  useEffect(() => {
    loadAdvocates();
  }, []);

  useEffect(() => {
    if (selectedTrack === 'all') {
      setFilteredAdvocates(advocates);
    } else {
      setFilteredAdvocates(advocates.filter((adv) => adv.track === selectedTrack));
    }
  }, [selectedTrack, advocates]);

  const loadAdvocates = async () => {
    try {
      setLoading(true);
      const data = await advocatesService.getActiveAdvocates();
      setAdvocates(data || []);
      setFilteredAdvocates(data || []);
    } catch (err) {
      console.error('Error loading advocates:', err);
      setError(t('advocates.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const featuredAdvocates = advocates.filter((adv) => adv.is_featured);

  return (
    <>
      <Helmet>
        <title>{t('advocates.title')} | DeFi Hub México</title>
        <meta
          name="description"
          content={t('advocates.description')}
        />
      </Helmet>

      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-4">
            <Users className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-primary">{t('nav.advocates')}</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            {t('advocates.title')}
          </h1>

          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            {t('advocates.description')}
          </p>
        </div>

        {/* Featured Advocates */}
        {featuredAdvocates.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-2 mb-6">
              <Sparkles className="w-6 h-6 text-yellow-500" />
              <h2 className="text-2xl font-bold">{t('advocates.featured')}</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredAdvocates.map((advocate) => (
                <AdvocateCard key={advocate.id} advocate={advocate} />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">{t('common.filter')}</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {trackFilters.map((filter) => (
              <Button
                key={filter.value}
                variant={selectedTrack === filter.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedTrack(filter.value)}
              >
                {filter.label}
                {filter.value !== 'all' && (
                  <Badge variant="secondary" className="ml-2">
                    {advocates.filter((adv) => adv.track === filter.value).length}
                  </Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-500">{error}</p>
            <Button onClick={loadAdvocates} className="mt-4">
              {t('common.error')}
            </Button>
          </div>
        )}

        {/* Advocates Grid */}
        {!loading && !error && (() => {
          const nonFeatured = filteredAdvocates.filter((adv) => !adv.is_featured);
          if (filteredAdvocates.length === 0) {
            return (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">{t('advocates.noResults')}</h3>
                <p className="text-muted-foreground">
                  {t('advocates.noResultsHint')}
                </p>
              </div>
            );
          }
          if (nonFeatured.length === 0) return null;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {nonFeatured.map((advocate) => (
                <AdvocateCard key={advocate.id} advocate={advocate} />
              ))}
            </div>
          );
        })()}

        {/* CTA Section */}
        <div className="mt-16 text-center bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            {t('advocates.ctaTitle')}
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            {t('advocates.ctaDescription')}
          </p>
          <Button size="lg" onClick={handleProposeReferent}>
            {t('advocates.ctaButton')}
          </Button>
        </div>

        {/* Comments Section */}
        <EntityComments entityId="referentes" entityType="referentes" />
      </div>
    </>
  );
}

