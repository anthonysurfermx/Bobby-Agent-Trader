import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Rocket, Users, Calendar, FileText, Award } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Types for search results
interface SearchStartup {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  category?: string;
}

interface SearchCommunity {
  id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  category?: string;
}

interface SearchEvent {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  image_url?: string;
  venue_city?: string;
  start_date?: string;
}

interface SearchBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  image_url?: string;
  category?: string;
}

interface SearchAdvocate {
  id: string;
  name: string;
  slug?: string;
  bio?: string;
  avatar_url?: string;
  expertise?: string;
}

interface SearchResults {
  startups: SearchStartup[];
  communities: SearchCommunity[];
  events: SearchEvent[];
  blogPosts: SearchBlogPost[];
  advocates: SearchAdvocate[];
}

const emptyResults: SearchResults = {
  startups: [],
  communities: [],
  events: [],
  blogPosts: [],
  advocates: [],
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(emptyResults);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Keyboard shortcut detection
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Search function using RPC - single DB call
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults(emptyResults);
      return;
    }

    setIsLoading(true);

    try {
      // Single RPC call that searches all tables server-side
      const { data, error } = await supabase.rpc('global_search', {
        search_query: searchQuery,
        result_limit: 3
      });

      if (error) {
        console.error('Search RPC error:', error);
        setResults(emptyResults);
        return;
      }

      setResults(data as SearchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults(emptyResults);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSelect = (path: string) => {
    setOpen(false);
    setQuery('');
    navigate(path);
  };

  const totalResults =
    results.startups.length +
    results.communities.length +
    results.events.length +
    results.blogPosts.length +
    results.advocates.length;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t('search.placeholder')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isLoading ? t('search.searching') : t('search.noResults')}
        </CommandEmpty>

        {/* Startups */}
        {results.startups.length > 0 && (
          <CommandGroup heading={t('nav.startups')}>
            {results.startups.map((startup) => (
              <CommandItem
                key={startup.id}
                value={startup.name}
                onSelect={() => handleSelect(startup.slug ? `/startups/${startup.slug}` : '/startups')}
              >
                <Rocket className="mr-2 h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>{startup.name}</span>
                  {startup.description && (
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {startup.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Communities */}
        {results.communities.length > 0 && (
          <CommandGroup heading={t('nav.communities')}>
            {results.communities.map((community) => (
              <CommandItem
                key={community.id}
                value={community.name}
                onSelect={() => handleSelect(community.slug ? `/comunidades/${community.slug}` : '/comunidades')}
              >
                <Users className="mr-2 h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>{community.name}</span>
                  {community.category && (
                    <span className="text-xs text-muted-foreground">
                      {community.category}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Events */}
        {results.events.length > 0 && (
          <CommandGroup heading={t('nav.events')}>
            {results.events.map((event) => (
              <CommandItem
                key={event.id}
                value={event.title}
                onSelect={() => handleSelect(event.slug ? `/eventos/${event.slug}` : '/eventos')}
              >
                <Calendar className="mr-2 h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>{event.title}</span>
                  {event.venue_city && (
                    <span className="text-xs text-muted-foreground">
                      {event.venue_city}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Blog Posts */}
        {results.blogPosts.length > 0 && (
          <CommandGroup heading={t('nav.blog')}>
            {results.blogPosts.map((post) => (
              <CommandItem
                key={post.id}
                value={post.title}
                onSelect={() => handleSelect(`/blog/${post.slug}`)}
              >
                <FileText className="mr-2 h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>{post.title}</span>
                  {post.excerpt && (
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {post.excerpt}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Advocates */}
        {results.advocates.length > 0 && (
          <CommandGroup heading={t('nav.advocates')}>
            {results.advocates.map((advocate) => (
              <CommandItem
                key={advocate.id}
                value={advocate.name}
                onSelect={() => handleSelect(advocate.slug ? `/referentes/${advocate.slug}` : '/referentes')}
              >
                <Award className="mr-2 h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span>{advocate.name}</span>
                  {advocate.expertise && (
                    <span className="text-xs text-muted-foreground">
                      {advocate.expertise}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
