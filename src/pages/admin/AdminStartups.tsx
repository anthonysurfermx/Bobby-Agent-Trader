import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  Eye,
  Edit3,
  Trash2,
  MoreHorizontal,
  Loader2,
  Building2,
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useNavigate } from "react-router-dom";
import { startupsService } from "@/services/startups.service";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import ImportJSONWithPreview from "@/components/admin/ImportJSONWithPreview";
import { IMPORT_PROMPTS } from "@/constants/importPrompts";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal } from "@/types/proposals";

interface Startup {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  logo_url?: string;
  founded_date?: string;
  tags?: string[];
  categories?: string[];
  status: string;
  is_featured?: boolean;
  created_at?: string;
  total_users?: number;
  city?: string;
  country?: string;
}

const AdminStartups = () => {
  const navigate = useNavigate();
  const { getRoles } = useAuth();
  const userRoles = getRoles?.() || [];
  const isAdmin = userRoles.includes('admin');

  // Cargar TODAS las propuestas de startups para mostrar pendientes y aprobadas
  const { proposals, loading: proposalsLoading, approveProposal, rejectProposal: rejectProposalHook, refetch: refetchProposals } = useProposals({
    contentType: 'startup',
  });

  console.log('📋 Startup Proposals loaded:', proposals.length, proposals);

  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedStartups, setSelectedStartups] = useState<string[]>([]);

  useEffect(() => {
    loadStartups();
  }, []);

  const loadStartups = async () => {
    try {
      setLoading(true);
      // Cargar TODAS las startups, no solo las publicadas
      const { data, error } = await supabase
        .from('startups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('Startups loaded in admin:', data);
      setStartups(data || []);
    } catch (error) {
      console.error('Error loading startups:', error);
      toast.error('Error al cargar las startups');
    } finally {
      setLoading(false);
    }
  };

  // Aprobar propuesta de startup
  const approveProposalItem = async (proposal: Proposal) => {
    try {
      const { error } = await approveProposal(proposal.id);

      if (!error) {
        toast.success('Propuesta aprobada y publicada como startup');
        await refetchProposals();
        loadStartups();
      }
    } catch (error) {
      console.error('Error approving proposal:', error);
    }
  };

  // Rechazar propuesta de startup
  const rejectProposalItem = async (proposal: Proposal) => {
    const reason = prompt("¿Por qué rechazas esta propuesta? (opcional)");

    try {
      const { error } = await rejectProposalHook(proposal.id, reason || 'Sin razón especificada');

      if (!error) {
        await refetchProposals();
        toast.success('Propuesta rechazada');
      }
    } catch (error) {
      console.error('Error rejecting proposal:', error);
    }
  };

  const handleDelete = async (startup: any) => {
    const isDraft = startup.status === 'draft';
    const message = isDraft
      ? `¿Estás seguro de eliminar permanentemente "${startup.name}"? Esta acción no se puede deshacer.`
      : `¿Estás seguro de desactivar "${startup.name}"? Se cambiará a borrador.`;

    if (!confirm(message)) return;

    try {
      if (isDraft) {
        // Borrado permanente si ya está en draft
        const result = await startupsService.permanentlyDelete(startup.id);
        if (result.error) throw new Error(result.error);
        toast.success('Startup eliminada permanentemente');
      } else {
        // Soft delete - cambiar a draft
        const result = await startupsService.delete(startup.id);
        if (result.error) throw new Error(result.error);
        toast.success('Startup desactivada correctamente');
      }

      loadStartups();
    } catch (error) {
      console.error('Error deleting startup:', error);
      toast.error('Error al procesar la solicitud');
    }
  };

  const handleDeleteAllDrafts = async () => {
    const drafts = startups.filter((s) => s.status === 'draft');

    if (drafts.length === 0) {
      toast.info('No hay startups en borrador para eliminar');
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar permanentemente ${drafts.length} startups en borrador? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      let successCount = 0;
      let failedCount = 0;

      for (const startup of drafts) {
        try {
          const result = await startupsService.permanentlyDelete(startup.id);
          if (result.data !== undefined && !result.error) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Error deleting startup ${startup.id}:`, error);
          failedCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} startups eliminadas permanentemente`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} startups no pudieron ser eliminadas`);
      }

      loadStartups();
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error('Error al eliminar startups');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('startups')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Estado actualizado a ${newStatus}`);
      loadStartups(); // Recargar lista
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar el estado');
    }
  };

  // Combinar startups con propuestas
  const allItems = [
    ...proposals
      .filter(p => p.status !== 'rejected') // Filtrar propuestas rechazadas
      .map(p => ({
        id: p.id,
        name: p.content_data.name || 'Sin nombre',
        description: p.content_data.description || '',
        logo_url: p.content_data.logo_url,
        categories: p.content_data.categories || [],
        tags: p.content_data.tags || [],
        city: p.content_data.city,
        country: p.content_data.country,
        status: 'pending', // Mostrar como pending en la UI
        isProposal: true,
        proposalData: p,
      } as any)),
    ...startups.map(s => ({
      ...s,
      isProposal: false,
    })),
  ];

  // Obtener categorías únicas
  const allCategories = Array.from(
    new Set(allItems.flatMap(s => s.categories || s.tags || []))
  ).filter(Boolean);

  // Filtrar startups y propuestas
  const filteredStartups = allItems.filter(startup => {
    const matchesSearch = 
      startup.name.toLowerCase().includes(search.toLowerCase()) ||
      (startup.description?.toLowerCase().includes(search.toLowerCase()) || false);
    
    const matchesCategory = selectedCategory === "all" || 
      startup.categories?.includes(selectedCategory) ||
      startup.tags?.includes(selectedCategory);
    
    const matchesStatus = selectedStatus === "all" || startup.status === selectedStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const toggleStartupSelection = (startupId: string) => {
    setSelectedStartups(prev => 
      prev.includes(startupId) 
        ? prev.filter(id => id !== startupId)
        : [...prev, startupId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedStartups(
      selectedStartups.length === filteredStartups.length 
        ? [] 
        : filteredStartups.map(s => s.id)
    );
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedStartups.length} startups seleccionadas?`)) return;

    try {
      const { error } = await supabase
        .from('startups')
        .delete()
        .in('id', selectedStartups);

      if (error) throw error;

      toast.success(`${selectedStartups.length} startups eliminadas`);
      setSelectedStartups([]);
      loadStartups();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Error al eliminar las startups');
    }
  };

  const handleImportStartups = async (startups: any[]) => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const startup of startups) {
      try {
        if (!startup.name) {
          throw new Error("Falta el campo 'name'");
        }

        const slug = startup.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

        const { error } = await supabase
          .from('startups')
          .insert({
            name: startup.name,
            slug,
            description: startup.description || null,
            website: startup.website || null,
            logo_url: startup.logo_url || null,
            founded_date: startup.founded_year ? `${startup.founded_year}-01-01` : null,
            twitter_url: startup.twitter_url || null,
            github_url: startup.github_url || null,
            linkedin_url: startup.linkedin_url || null,
            tags: startup.tags || [],
            categories: startup.category ? [startup.category] : [],
            stage: startup.stage || null, // MVP, Grants, Pre-seed, Seed, Series A, Series B, Series C+
            status: startup.status || "draft",
            city: startup.location || null,
            country: startup.location?.includes(',') ? startup.location.split(',').pop()?.trim() : null,
            is_featured: startup.is_featured || false,
          });

        if (error) throw error;

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`${startup.name || "Unknown"}: ${error.message}`);
      }
    }

    await loadStartups();
    return { success: successCount, failed: failedCount, errors };
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; label: string; className?: string }> = {
      published: { variant: "default", label: "Publicado", className: "bg-green-500/10 text-green-500 border-green-500/20" },
      approved: { variant: "default", label: "Aprobado", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
      draft: { variant: "secondary", label: "Borrador" },
      pending: { variant: "outline", label: "Pendiente" },
      rejected: { variant: "destructive", label: "Rechazado" },
    };

    const config = statusConfig[status] || { variant: "outline", label: status };
    
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestión de Startups</h1>
          <p className="text-muted-foreground">
            Administra el directorio de startups de DeFi México
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && startups.filter((s) => s.status === 'draft').length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAllDrafts}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar {startups.filter((s) => s.status === 'draft').length} borradores
            </Button>
          )}
          {isAdmin && (
            <ImportJSONWithPreview
              onImport={handleImportStartups}
              promptSuggestion={IMPORT_PROMPTS.startups}
              entityName="Startups"
              validateItem={(item: any) => !!item.name}
              getItemKey={(item: any, index: number) => item.name || index}
              renderPreviewItem={(item: any) => (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    {item.logo_url && (
                      <img
                        src={item.logo_url}
                        alt={item.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">{item.name}</h4>
                      {item.location && (
                        <p className="text-xs text-muted-foreground truncate">
                          📍 {item.location}
                        </p>
                      )}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {item.category && (
                          <Badge variant="outline" className="text-xs">
                            {item.category}
                          </Badge>
                        )}
                        {item.stage && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${item.stage === 'MVP' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' : ''}`}
                          >
                            {item.stage}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {item.website && (
                      <Badge variant="secondary" className="text-xs">
                        Website
                      </Badge>
                    )}
                    {item.twitter_url && (
                      <Badge variant="secondary" className="text-xs">
                        Twitter
                      </Badge>
                    )}
                    {item.github_url && (
                      <Badge variant="secondary" className="text-xs">
                        GitHub
                      </Badge>
                    )}
                    {item.founded_year && (
                      <Badge variant="secondary" className="text-xs">
                        {item.founded_year}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            />
          )}
          <Button asChild className="bg-green-600 hover:bg-green-700 text-white">
            <Link to="/admin/startups/new" className="flex items-center">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Startup
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o descripción..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filter */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {allCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
                <SelectItem value="approved">Aprobado</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="rejected">Rechazado</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" className="w-full lg:w-auto">
              <Filter className="w-4 h-4 mr-2" />
              Más filtros
            </Button>
          </div>

          {/* Results count and bulk actions */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {filteredStartups.length} startup{filteredStartups.length !== 1 ? 's' : ''} encontrada{filteredStartups.length !== 1 ? 's' : ''}
            </div>
            
            {selectedStartups.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedStartups.length} seleccionada{selectedStartups.length !== 1 ? 's' : ''}
                </span>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Startups Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredStartups.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedStartups.length === filteredStartups.length && filteredStartups.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Startup</TableHead>
                    <TableHead>Categorías</TableHead>
                    <TableHead>Ciudad</TableHead>
                    <TableHead>Fundación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-24">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStartups.map((startup) => {
                    const isSelected = selectedStartups.includes(startup.id);
                    
                    return (
                      <TableRow key={startup.id} className={isSelected ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleStartupSelection(startup.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={startup.logo_url} alt={startup.name} />
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {startup.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-medium text-foreground">{startup.name}</div>
                                {/* Badges de estado de propuesta */}
                                {(startup as any).isProposal && (startup as any).proposalData && (
                                  <>
                                    {(startup as any).proposalData.status === 'pending' && (
                                      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                        Propuesta Pendiente
                                      </Badge>
                                    )}
                                    {(startup as any).proposalData.status === 'approved' && (
                                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                        Aprobada (ERROR: No migró)
                                      </Badge>
                                    )}
                                    {(startup as any).proposalData.status === 'rejected' && (
                                      <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                                        Rechazada
                                      </Badge>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground max-w-xs truncate">
                                {startup.description || 'Sin descripción'}
                              </div>
                              {/* Fecha de propuesta */}
                              {(startup as any).isProposal && (startup as any).proposalData && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Propuesta: {new Date((startup as any).proposalData.created_at).toLocaleDateString('es-MX', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-48">
                            {startup.categories?.slice(0, 2).map((cat) => (
                              <Badge key={cat} variant="secondary" className="text-xs">
                                {cat}
                              </Badge>
                            ))}
                            {startup.tags?.slice(0, startup.categories ? 1 : 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {((startup.categories?.length || 0) + (startup.tags?.length || 0)) > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{(startup.categories?.length || 0) + (startup.tags?.length || 0) - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {startup.city || 'N/A'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {startup.founded_date 
                            ? new Date(startup.founded_date).getFullYear()
                            : 'N/A'
                          }
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(startup.status)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {/* Acciones para propuestas */}
                              {(startup as any).isProposal ? (
                                <>
                                  {(startup as any).proposalData.status === 'pending' && (
                                    <>
                                      <DropdownMenuItem
                                        className="text-green-600"
                                        onClick={() => approveProposalItem((startup as any).proposalData)}
                                      >
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        Aprobar y Publicar
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-orange-600"
                                        onClick={() => rejectProposalItem((startup as any).proposalData)}
                                      >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Rechazar
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  {(startup as any).proposalData.status === 'approved' && (
                                    <DropdownMenuItem
                                      className="text-green-600"
                                      onClick={() => approveProposalItem((startup as any).proposalData)}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Reintentar Migración
                                    </DropdownMenuItem>
                                  )}
                                </>
                              ) : (
                                /* Acciones para startups normales */
                                <>
                                  <DropdownMenuItem asChild>
                                    <Link to={`/startups/${startup.id}`}>
                                      <Eye className="w-4 h-4 mr-2" />
                                      Ver
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => navigate(`/admin/startups/edit/${startup.id}`)}
                                  >
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!((startup as any).isProposal) && startup.status === 'draft' && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(startup.id, 'published')}
                                  className="text-green-600"
                                >
                                  <Building2 className="w-4 h-4 mr-2" />
                                  Publicar
                                </DropdownMenuItem>
                              )}
                              {!((startup as any).isProposal) && startup.status === 'published' && (
                                <DropdownMenuItem
                                  onClick={() => handleStatusChange(startup.id, 'draft')}
                                  className="text-yellow-600"
                                >
                                  <Building2 className="w-4 h-4 mr-2" />
                                  Cambiar a Borrador
                                </DropdownMenuItem>
                              )}
                              {!((startup as any).isProposal) && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDelete(startup)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {startup.status === 'draft' ? 'Eliminar permanentemente' : 'Eliminar'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Mostrando 1-{Math.min(10, filteredStartups.length)} de {filteredStartups.length}
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" disabled>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" disabled={filteredStartups.length <= 10}>
                    Siguiente
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <Card className="p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No se encontraron startups</h3>
          <p className="text-muted-foreground mb-4">
            {search || selectedCategory !== 'all' || selectedStatus !== 'all' 
              ? 'Intenta ajustar los filtros'
              : 'No hay startups registradas'}
          </p>
          <Button asChild>
            <Link to="/admin/startups/new">
              <Plus className="w-4 h-4 mr-2" />
              Agregar primera startup
            </Link>
          </Button>
        </Card>
      )}
    </div>
  );
};

export default AdminStartups;