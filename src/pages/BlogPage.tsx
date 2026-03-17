// src/pages/BlogPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Filter, Loader2, RotateCcw, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BlogCard from "@/components/ui/blog-card";
import { blogService, type DomainPost } from "@/services/blog.service";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Util: formatear fechas respecting locale
const formatDate = (iso?: string, locale = 'es') => {
  if (!iso) return "";
  try {
    const loc = locale === 'en' ? 'en-US' : 'es-MX';
    return new Date(iso).toLocaleDateString(loc, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
};

// Util: leer y escribir query params
const readQuery = () => {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") ?? "",
    cat: sp.get("cat") ?? "all",
    page: Math.max(1, Number(sp.get("page") ?? 1)),
  };
};

const writeQuery = (q: string, cat: string, page: number) => {
  const sp = new URLSearchParams(window.location.search);
  q ? sp.set("q", q) : sp.delete("q");
  cat && cat !== "all" ? sp.set("cat", cat) : sp.delete("cat");
  page > 1 ? sp.set("page", String(page)) : sp.delete("page");
  const url = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState(null, "", url);
};

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 300;

const BlogPage = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('es') ? 'es' : 'en';
  const navigate = useNavigate();
  const { user } = useAuth();
  const initial = useRef(readQuery());
  const [posts, setPosts] = useState<DomainPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState(initial.current.q);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.current.q);
  const [categoryFilter, setCategoryFilter] = useState(initial.current.cat || "all");
  const [categories, setCategories] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(initial.current.page);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPosts, setTotalPosts] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const handleAddEntry = () => {
    if (user) {
      navigate('/admin/blog');
    } else {
      navigate('/login?redirectTo=/admin/blog');
    }
  };

  // Debounce de búsqueda
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setCurrentPage(1); // reset page al cambiar búsqueda
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  // Cargar categorías una sola vez
  useEffect(() => {
    (async () => {
      try {
        const cats = await blogService.getCategories();
        // Normaliza: sin duplicados y orden alfabético
        const normalized = Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b));
        setCategories(normalized);
      } catch (err) {
        console.error("Error cargando categorías", err);
      }
    })();
  }, []);

  // Persistir filtros/paginación a la URL
  useEffect(() => {
    writeQuery(debouncedSearch, categoryFilter, currentPage);
  }, [debouncedSearch, categoryFilter, currentPage]);

  // Cargar posts (con cancelación)
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort(); // cancela solicitud anterior
    abortRef.current = controller;

    const fetchPosts = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const resp = await blogService.getPosts(
          currentPage,
          PAGE_SIZE,
          {
            search: debouncedSearch || undefined,
            status: "published",
            category: categoryFilter === "all" ? undefined : categoryFilter,
            locale,
          },
          controller.signal // pasa signal al servicio
        );

        // Verificar si fue cancelada antes de actualizar estado
        if (controller.signal.aborted) return;

        setPosts(resp.data || []);
        setTotalPages(resp.totalPages || 1);
        setTotalPosts(resp.total || 0);
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted) return; // petición cancelada
        console.error("Error cargando posts", err);
        setErrorMsg("No pudimos cargar los artículos. Intenta de nuevo.");
        setPosts([]);
        setTotalPages(1);
        setTotalPosts(0);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchPosts();
    return () => controller.abort();
  }, [debouncedSearch, categoryFilter, currentPage, locale]);

  const hasActiveFilters = debouncedSearch.length > 0 || categoryFilter !== "all";

  const visibleCategories = useMemo(() => ["all", ...categories], [categories]);

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setCurrentPage(1);
  };

  const canPrev = currentPage > 1 && !loading;
  const canNext = currentPage < totalPages && !loading;

  // Cálculo de ventanas de páginas (máx 5 botones)
  const pagesToShow = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  }, [currentPage, totalPages]);

  // Cleanup refs on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <h1 className="text-4xl lg:text-5xl font-bold text-foreground mb-4">
              Blog <span className="text-gradient bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">DeFi México</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              Mantente al día con las últimas tendencias, análisis técnicos y noticias del ecosistema DeFi mexicano y global.
            </p>
            {!loading && (
              <p className="text-sm text-muted-foreground">
                {totalPosts === 0 ? "No hay artículos disponibles" : totalPosts === 1 ? "1 artículo publicado" : `${totalPosts} artículos publicados`}
              </p>
            )}
          </motion.div>
          <Button
            size="lg"
            onClick={handleAddEntry}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <Plus className="mr-2 h-5 w-5" />
            Agregar entrada
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" aria-hidden />
            <Input
              aria-label="Buscar artículos"
              placeholder="Buscar artículos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              disabled={loading}
            />
          </div>

          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-full md:w-48" aria-label="Filtrar por categoría">
              <Filter className="w-4 h-4 mr-2" aria-hidden />
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              {visibleCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category === "all" ? "Todas las categorías" : category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Error State */}
        {errorMsg && !loading && (
          <div className="flex items-center justify-between border border-destructive/30 rounded-md p-4 mb-6">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setCurrentPage((p) => p)} 
              aria-label="Reintentar"
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reintentar
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl border animate-pulse bg-muted" />
            ))}
            <div className="col-span-full flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        )}

        {/* Posts Grid */}
        {!loading && (
          <AnimatePresence mode="wait">
            {posts.length > 0 ? (
              <motion.div
                key="posts-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
              >
                {posts.map((post, index) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.06 }}
                  >
                    <BlogCard
                      title={post.title}
                      excerpt={post.excerpt}
                      author={post.author}
                      date={formatDate(post.published_at || post.created_at, locale)}
                      category={(post.categories && post.categories.length > 0) ? post.categories[0] : "General"}
                      tags={post.tags}
                      imageUrl={post.image_url}
                      slug={post.slug}
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="no-posts"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl font-semibold mb-2">
                  {hasActiveFilters ? "No se encontraron artículos" : "Próximamente contenido educativo sobre DeFi"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {hasActiveFilters ? "Intenta ajustar los filtros de búsqueda" : "Estamos preparando artículos increíbles sobre finanzas descentralizadas. ¡Mantente atento!"}
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Pagination */}
        {!loading && posts.length > 0 && totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-8" role="navigation" aria-label="Paginación">
            <Button variant="outline" disabled={!canPrev} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              Anterior
            </Button>
            {pagesToShow.map((p) => (
              <Button
                key={p}
                variant={currentPage === p ? "default" : "outline"}
                onClick={() => setCurrentPage(p)}
                aria-current={currentPage === p ? "page" : undefined}
              >
                {p}
              </Button>
            ))}
            <Button variant="outline" disabled={!canNext} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
              Siguiente
            </Button>
          </div>
        )}

        {/* CTA para estado vacío global */}
        {!loading && posts.length === 0 && !hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-xl border border-primary/20 p-8 text-center mt-12"
          >
            <h3 className="text-2xl font-bold mb-4">¿Quieres contribuir con contenido?</h3>
            <p className="text-muted-foreground mb-6">
              Si tienes experiencia en DeFi y quieres compartir tu conocimiento con la comunidad mexicana, nos encantaría colaborar contigo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg">Proponer artículo</Button>
              <Button size="lg" variant="outline">Unirse a la comunidad</Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default BlogPage;