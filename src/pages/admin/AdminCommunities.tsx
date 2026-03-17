// src/pages/admin/AdminCommunities.tsx
import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Star,
  Shield,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { communitiesService } from "@/services/communities.service";
import type { Community } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import ImportJSONWithPreview from "@/components/admin/ImportJSONWithPreview";
import { IMPORT_PROMPTS } from "@/constants/importPrompts";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal } from "@/types/proposals";

const AdminCommunities = () => {
  const { toast } = useToast();
  const { getRoles } = useAuth();
  const userRoles = getRoles?.() || [];
  const isAdmin = userRoles.includes('admin');
  
  // Cargar TODAS las propuestas (pendientes y aprobadas) para debugging
  const { proposals, loading: proposalsLoading, approveProposal, rejectProposal: rejectProposalHook, refetch: refetchProposals } = useProposals({
    contentType: 'community',
    // status: 'pending', // Comentado para ver TODAS las propuestas
  });

  // Debug: Log proposals
  console.log('📋 Proposals loaded:', proposals.length, proposals);

  // Estados
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [featuredFilter, setFeaturedFilter] = useState<"all" | "featured" | "normal">("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [communityToDelete, setCommunityToDelete] = useState<Community | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    featured: 0,
    totalMembers: 0,
    pending: 0,
    verified: 0
  });

  // Cargar datos al montar
  useEffect(() => {
    loadCommunities();
    loadStats();
  }, []);

  const loadCommunities = async () => {
    try {
      setLoading(true);
      const result = await communitiesService.getAll({ 
        limit: 100,
        isActive: undefined // Mostrar todas en admin
      });
      
      if (result.data) {
        setCommunities(result.data);
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading communities:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las comunidades",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await communitiesService.getStatsWithPending();
      if (result.data) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  // Combinar comunidades con propuestas pendientes
  // NOTA: La BD usa image_url (no logo_url), is_verified (no is_active)
  const allItems = [
    ...proposals
      .filter(p => p.status !== 'rejected') // Filtrar propuestas rechazadas
      .map(p => ({
        id: p.id,
        name: p.content_data.name || 'Sin nombre',
        description: p.content_data.description || '',
        image_url: p.content_data.logo_url || p.content_data.image_url,
        category: p.content_data.community_type || p.content_data.focus_area,
        location: p.content_data.city || p.content_data.country,
        member_count: p.content_data.member_count,
        is_verified: false,
        is_featured: false,
        isProposal: true,
        proposalData: p,
      } as any)),
    ...communities.map(c => ({
      ...c,
      isProposal: false,
    })),
  ];

  // Filtrar comunidades y propuestas
  const filteredCommunities = allItems.filter(community => {
    const matchesSearch = searchTerm === "" ||
      community.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      community.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === "all" || community.category === categoryFilter;

    // Usar is_verified en lugar de is_active (no existe en BD)
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "active" && community.is_verified) ||
      (statusFilter === "inactive" && !community.is_verified);

    const matchesFeatured = featuredFilter === "all" ||
      (featuredFilter === "featured" && community.is_featured) ||
      (featuredFilter === "normal" && !community.is_featured);

    return matchesSearch && matchesCategory && matchesStatus && matchesFeatured;
  });

  // Obtener categorías únicas
  const categories = [...new Set(communities.map(c => c.category).filter(Boolean))];

  // Manejar eliminación
  const handleDelete = (community: Community) => {
    setCommunityToDelete(community);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!communityToDelete) return;

    try {
      let result;

      // Si no está verificada, borrar permanentemente
      if (!communityToDelete.is_verified) {
        result = await communitiesService.permanentlyDelete(communityToDelete.id);
        if (result.data) {
          toast({
            title: "Éxito",
            description: "Comunidad eliminada permanentemente"
          });
        }
      } else {
        // Si está activa, solo desactivar
        result = await communitiesService.delete(communityToDelete.id);
        if (result.data) {
          toast({
            title: "Éxito",
            description: "Comunidad desactivada correctamente"
          });
        }
      }

      if (result.data) {
        loadCommunities();
        loadStats();
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo procesar la solicitud",
        variant: "destructive"
      });
    } finally {
      setDeleteDialogOpen(false);
      setCommunityToDelete(null);
    }
  };

  const handleDeleteAllInactive = async () => {
    const inactiveCommunities = communities.filter((c) => !c.is_verified);

    if (inactiveCommunities.length === 0) {
      toast({
        title: "Info",
        description: "No hay comunidades inactivas para eliminar"
      });
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar permanentemente ${inactiveCommunities.length} comunidades inactivas? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      let successCount = 0;
      let failedCount = 0;

      for (const community of inactiveCommunities) {
        try {
          const result = await communitiesService.permanentlyDelete(community.id);
          if (result.data) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Error deleting community ${community.id}:`, error);
          failedCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Éxito",
          description: `${successCount} comunidades eliminadas permanentemente`
        });
      }
      if (failedCount > 0) {
        toast({
          title: "Error",
          description: `${failedCount} comunidades no pudieron ser eliminadas`,
          variant: "destructive"
        });
      }

      loadCommunities();
      loadStats();
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast({
        title: "Error",
        description: "Error al eliminar comunidades",
        variant: "destructive"
      });
    }
  };

  // Toggle featured
  const toggleFeatured = async (community: Community) => {
    try {
      const result = await communitiesService.update(community.id, {
        is_featured: !community.is_featured
      });
      
      if (result.data) {
        toast({
          title: "Éxito",
          description: community.is_featured 
            ? "Comunidad removida de destacadas" 
            : "Comunidad marcada como destacada"
        });
        loadCommunities();
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo actualizar la comunidad",
        variant: "destructive"
      });
    }
  };

  // Toggle verified (usando is_verified en lugar de is_active)
  const toggleActive = async (community: Community) => {
    try {
      const result = await communitiesService.update(community.id, {
        is_verified: !community.is_verified
      });

      if (result.data) {
        toast({
          title: "Éxito",
          description: community.is_verified
            ? "Comunidad desverificada"
            : "Comunidad verificada"
        });
        loadCommunities();
        loadStats();
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
          title: "Error",
          description: "No se pudo actualizar la comunidad",
          variant: "destructive"
      });
    }
  };

  const handleImportCommunities = async (communities: any[]) => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const community of communities) {
      try {
        if (!community.name) {
          throw new Error("Falta el campo 'name'");
        }

        const slug = community.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-');

        // Usar método create (no createCommunity) y campos correctos de BD
        // BD usa: image_url (no logo_url), links (no social_links), no tiene is_active
        const result = await communitiesService.create({
          name: community.name,
          slug,
          description: community.description || '',
          category: community.type || "other",
          member_count: community.member_count || 0,
          tags: community.tags || [],
          is_verified: community.is_verified || false,
          is_featured: community.is_featured || false,
        });

        if (result.error) throw new Error(result.error);

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`${community.name || "Unknown"}: ${error.message}`);
      }
    }

    await loadCommunities();
    await loadStats();
    return { success: successCount, failed: failedCount, errors };
  };

  // Aprobar comunidad (de la tabla communities)
  const approveCommunity = async (community: Community) => {
    try {
      const result = await communitiesService.verify(community.id);

      if (result.data) {
        toast({
          title: "Éxito",
          description: "Comunidad aprobada y publicada"
        });
        loadCommunities();
        loadStats();
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo aprobar la comunidad",
        variant: "destructive"
      });
    }
  };

  // Rechazar comunidad (de la tabla communities)
  const rejectCommunity = async (community: Community) => {
    try {
      const result = await communitiesService.reject(community.id);

      if (result.data) {
        toast({
          title: "Éxito",
          description: "Comunidad rechazada"
        });
        loadCommunities();
        loadStats();
      } else if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo rechazar la comunidad",
        variant: "destructive"
      });
    }
  };

  // Aprobar propuesta (de la tabla proposals)
  const approveProposalItem = async (proposal: Proposal) => {
    try {
      const { error } = await approveProposal(proposal.id);

      if (!error) {
        toast({
          title: "Éxito",
          description: "Propuesta aprobada y publicada como comunidad"
        });
        // Recargar propuestas pendientes, comunidades y stats
        await refetchProposals();
        loadCommunities();
        loadStats();
      }
    } catch (error) {
      console.error('Error approving proposal:', error);
    }
  };

  // Rechazar propuesta (de la tabla proposals)
  const rejectProposalItem = async (proposal: Proposal) => {
    const reason = prompt("¿Por qué rechazas esta propuesta? (opcional)");

    try {
      const { error } = await rejectProposalHook(proposal.id, reason || 'Sin razón especificada');

      if (!error) {
        await refetchProposals();
        loadStats();
        toast({
          title: "Éxito",
          description: "Propuesta rechazada"
        });
        loadStats();
      }
    } catch (error) {
      console.error('Error rejecting proposal:', error);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedItems(
      selectedItems.length === filteredCommunities.length
        ? []
        : filteredCommunities.map(item => item.id)
    );
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedItems.length} items seleccionados?`)) return;

    try {
      await Promise.all(
        selectedItems.map(id => communitiesService.delete(id))
      );

      toast({
        title: "Éxito",
        description: `${selectedItems.length} items eliminados`
      });
      setSelectedItems([]);
      loadCommunities();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast({
        title: "Error",
        description: "Error al eliminar los items",
        variant: "destructive"
      });
    }
  };

  if (loading || proposalsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gestión de Comunidades</h1>
            <p className="text-muted-foreground">
              Administra las comunidades del ecosistema DeFi México
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <ImportJSONWithPreview
                onImport={handleImportCommunities}
                promptSuggestion={IMPORT_PROMPTS.communities}
                entityName="Comunidades"
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
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.location}
                          </p>
                        )}
                        {item.category && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {item.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {item.member_count && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {item.member_count} miembros
                        </Badge>
                      )}
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
                    </div>
                  </div>
                )}
              />
            )}
            <Button asChild className="bg-green-600 hover:bg-green-700 text-white">
              <Link to="/admin/comunidades/new">
                <Plus className="w-4 h-4 mr-2" />
                Nueva Comunidad
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar comunidades..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activas</SelectItem>
                    <SelectItem value="inactive">Inactivas</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={featuredFilter} onValueChange={(value: any) => setFeaturedFilter(value)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Destacadas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="featured">Destacadas</SelectItem>
                    <SelectItem value="normal">Normales</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results count and bulk actions */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedItems.length === filteredCommunities.length && filteredCommunities.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">
                  {filteredCommunities.length} item{filteredCommunities.length !== 1 ? 's' : ''} encontrado{filteredCommunities.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedItems.length > 0 && (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {selectedItems.length} seleccionado{selectedItems.length !== 1 ? 's' : ''}
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </>
                )}

                {isAdmin && communities.filter((c) => !c.is_verified).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteAllInactive}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-4 w-4 mr-2" />
                    Eliminar {communities.filter((c) => !c.is_verified).length} no verificadas permanentemente
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-primary">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-500">{(stats.pending || 0) + proposals.length}</div>
              <div className="text-sm text-muted-foreground">Pendientes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-500">{stats.verified || 0}</div>
              <div className="text-sm text-muted-foreground">Verificadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-500">{stats.active}</div>
              <div className="text-sm text-muted-foreground">Activas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-500">{stats.featured}</div>
              <div className="text-sm text-muted-foreground">Destacadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-500">
                {stats.totalMembers.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Miembros</div>
            </CardContent>
          </Card>
        </div>

        {/* Communities Table */}
        <Card>
          <CardHeader>
            <CardTitle>Comunidades ({filteredCommunities.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredCommunities.map((community, index) => {
                const isSelected = selectedItems.includes(community.id);

                return (
                  <motion.div
                    key={community.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    className={`flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors ${isSelected ? "bg-muted/50" : ""}`}
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleItemSelection(community.id)}
                        className="mt-1"
                      />
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={(community as any).image_url || undefined} alt={community.name} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {community.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground truncate">
                          {community.name}
                        </h3>
                        {/* Mostrar estado de la propuesta si es una propuesta */}
                        {(community as any).isProposal && (community as any).proposalData && (
                          <>
                            {(community as any).proposalData.status === 'pending' && (
                              <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                <Clock className="w-3 h-3 mr-1" />
                                Propuesta Pendiente
                              </Badge>
                            )}
                            {(community as any).proposalData.status === 'approved' && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Propuesta Aprobada (ERROR: No migró)
                              </Badge>
                            )}
                            {(community as any).proposalData.status === 'rejected' && (
                              <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                                <XCircle className="w-3 h-3 mr-1" />
                                Propuesta Rechazada
                              </Badge>
                            )}
                          </>
                        )}
                        {/* Estado de comunidades normales */}
                        {!(community as any).isProposal && !community.is_verified && (
                          <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-300">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendiente
                          </Badge>
                        )}
                        {!(community as any).isProposal && community.is_verified && (
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verificada
                          </Badge>
                        )}
                        {community.is_featured && (
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        )}
                        {community.category && (
                          <Badge variant="outline" className="text-xs">
                            {community.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {community.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    {(community as any).isProposal && (community as any).proposalData && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          {new Date((community as any).proposalData.created_at).toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short'
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date((community as any).proposalData.created_at).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    )}

                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">
                        {community.member_count?.toLocaleString() || "0"}
                      </div>
                      <div className="text-xs text-muted-foreground">Miembros</div>
                    </div>

                    {community.location && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          {community.location}
                        </div>
                        <div className="text-xs text-muted-foreground">Ubicación</div>
                      </div>
                    )}

                    {!((community as any).isProposal) && community.founded_date && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          {new Date(community.founded_date).getFullYear()}
                        </div>
                        <div className="text-xs text-muted-foreground">Fundada</div>
                      </div>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!(community as any).isProposal && (
                          <>
                            <DropdownMenuItem asChild>
                              <Link to={`/comunidades/${community.slug || community.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                Ver Pública
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/comunidades/edit/${community.id}`}>
                                <Edit className="w-4 h-4 mr-2" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {!community.is_verified && (
                          <>
                            <DropdownMenuItem
                              className="text-green-600"
                              onClick={() =>
                                (community as any).isProposal
                                  ? approveProposalItem((community as any).proposalData)
                                  : approveCommunity(community)
                              }
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Aprobar y Publicar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-orange-600"
                              onClick={() =>
                                (community as any).isProposal
                                  ? rejectProposalItem((community as any).proposalData)
                                  : rejectCommunity(community)
                              }
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Rechazar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {!(community as any).isProposal && (
                          <>
                            <DropdownMenuItem onClick={() => toggleFeatured(community)}>
                              <Star className="w-4 h-4 mr-2" />
                              {community.is_featured ? "Quitar Destacada" : "Marcar Destacada"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleActive(community)}>
                              <Shield className="w-4 h-4 mr-2" />
                              {community.is_verified ? "Desverificar" : "Verificar"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(community)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              {community.is_verified ? "Eliminar" : "Eliminar permanentemente"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              );
              })}
            </div>

            {filteredCommunities.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No se encontraron comunidades
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || categoryFilter !== "all" || statusFilter !== "all" || featuredFilter !== "all"
                    ? "Intenta ajustar los filtros"
                    : "Agrega la primera comunidad"}
                </p>
                <Button asChild className="bg-green-600 hover:bg-green-700 text-white">
                  <Link to="/admin/comunidades/new">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Comunidad
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
              <AlertDialogDescription>
                {communityToDelete?.is_verified ? (
                  `Esta acción desverificará la comunidad "${communityToDelete?.name}". Podrás verificarla más tarde.`
                ) : (
                  `Esta acción eliminará permanentemente la comunidad "${communityToDelete?.name}" de la base de datos. Esta acción no se puede deshacer.`
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className={!communityToDelete?.is_verified ? "bg-red-600 hover:bg-red-700" : "bg-destructive text-destructive-foreground"}
              >
                {communityToDelete?.is_verified ? "Desverificar" : "Eliminar permanentemente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </div>
  );
};

export default AdminCommunities;