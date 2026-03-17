// src/pages/admin/AdminAdvocates.tsx
import { useState, useEffect } from "react";
import {
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Star,
  Users,
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { advocatesService, type DeFiAdvocate } from "@/services/advocates.service";
import { useAuth } from "@/hooks/useAuth";
import ImportJSONWithPreview from "@/components/admin/ImportJSONWithPreview";
import { IMPORT_PROMPTS } from "@/constants/importPrompts";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal } from "@/types/proposals";

const trackLabels: Record<string, string> = {
  developer: "Programador",
  lawyer: "Abogado",
  financial: "Financiero",
  designer: "Diseñador",
  marketer: "Marketer",
  other: "Otro",
};

const AdminAdvocates = () => {
  const { getRoles } = useAuth();
  const userRoles = getRoles?.() || [];
  const isAdmin = userRoles.includes('admin');

  // Propuestas de referentes
  const { proposals, loading: proposalsLoading, approveProposal, rejectProposal: rejectProposalHook, refetch: refetchProposals } = useProposals({
    contentType: 'referent',
  });

  console.log('📋 Referent Proposals loaded:', proposals.length, proposals);

  const [advocates, setAdvocates] = useState<DeFiAdvocate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [trackFilter, setTrackFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [advocateToDelete, setAdvocateToDelete] = useState<DeFiAdvocate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [advocateToEdit, setAdvocateToEdit] = useState<DeFiAdvocate | null>(null);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [selectedAdvocates, setSelectedAdvocates] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    bio: "",
    location: "",
    expertise: "",
    track: "other",
    avatar_url: "",
    twitter_url: "",
    linkedin_url: "",
    github_url: "",
    website: "",
    specializations: [] as string[],
    is_featured: false,
    is_active: true,
  });

  // Helper para obtener avatar de GitHub
  const getGitHubAvatar = (githubUrl: string): string | null => {
    try {
      const username = githubUrl.split('github.com/')[1]?.split('/')[0];
      if (username) {
        return `https://github.com/${username}.png?size=200`;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Helper para obtener avatar de Twitter/X
  const getTwitterAvatar = (twitterUrl: string): string | null => {
    try {
      // Soporta tanto twitter.com como x.com
      let username = twitterUrl.split('twitter.com/')[1]?.split('/')[0];
      if (!username) {
        username = twitterUrl.split('x.com/')[1]?.split('/')[0];
      }
      if (username) {
        username = username.replace('@', '');
        // Usar API de unavatar que obtiene avatares de varias plataformas
        return `https://unavatar.io/twitter/${username}`;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Auto-obtener avatar cuando se agrega GitHub o Twitter URL
  const handleAutoFetchAvatar = () => {
    setLoadingAvatar(true);

    // Primero intenta GitHub (mejor calidad)
    if (formData.github_url) {
      const githubAvatar = getGitHubAvatar(formData.github_url);
      if (githubAvatar) {
        setFormData({ ...formData, avatar_url: githubAvatar });
        toast.success("Avatar obtenido de GitHub");
        setLoadingAvatar(false);
        return;
      }
    }

    // Si no hay GitHub, intenta Twitter
    if (formData.twitter_url) {
      const twitterAvatar = getTwitterAvatar(formData.twitter_url);
      if (twitterAvatar) {
        setFormData({ ...formData, avatar_url: twitterAvatar });
        toast.success("Avatar obtenido de Twitter");
        setLoadingAvatar(false);
        return;
      }
    }

    toast.error("No se pudo obtener el avatar. Verifica las URLs.");
    setLoadingAvatar(false);
  };

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    featured: 0,
    byTrack: {} as Record<string, number>,
  });

  useEffect(() => {
    loadAdvocates();
  }, []);

  useEffect(() => {
    calculateStats();
  }, [advocates]);

  const loadAdvocates = async () => {
    try {
      setLoading(true);
      const data = await advocatesService.getAllAdvocates();
      setAdvocates(data || []);
    } catch (error) {
      console.error("Error loading advocates:", error);
      toast.error("Error al cargar los referentes");
    } finally {
      setLoading(false);
    }
  };

  // Aprobar propuesta de referente
  const approveProposalItem = async (proposal: Proposal) => {
    try {
      const { error } = await approveProposal(proposal.id);

      if (!error) {
        toast.success('Propuesta aprobada y publicada como referente');
        await refetchProposals();
        loadAdvocates();
      }
    } catch (error) {
      console.error('Error approving proposal:', error);
    }
  };

  // Rechazar propuesta de referente
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

  const calculateStats = () => {
    const total = advocates.length;
    const active = advocates.filter((a) => a.is_active).length;
    const featured = advocates.filter((a) => a.is_featured).length;
    const byTrack: Record<string, number> = {};

    advocates.forEach((adv) => {
      const track = adv.track || "community_advocate";
      byTrack[track] = (byTrack[track] || 0) + 1;
    });

    setStats({ total, active, featured, byTrack });
  };

  // Combinar advocates con propuestas
  const allItems = [
    ...proposals
      .filter(p => p.status !== 'rejected') // Filtrar propuestas rechazadas
      .map(p => ({
        id: p.id,
        name: p.content_data.name || 'Sin nombre',
        bio: p.content_data.description || '',
        avatar_url: p.content_data.avatar_url,
        track: p.content_data.category || 'other',
        location: p.content_data.location,
        is_active: false,
        is_featured: false,
        isProposal: true,
        proposalData: p,
      } as any)),
    ...advocates.map(a => ({
      ...a,
      isProposal: false,
    })),
  ];

  const filteredAdvocates = allItems.filter((advocate) => {
    const matchesSearch =
      advocate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      advocate.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTrack = trackFilter === "all" || advocate.track === trackFilter;

    // Las propuestas siempre se muestran, independientemente del filtro de estado
    const isProposal = (advocate as any).isProposal;
    const matchesStatus =
      isProposal ||
      statusFilter === "all" ||
      (statusFilter === "active" && advocate.is_active) ||
      (statusFilter === "inactive" && !advocate.is_active);

    return matchesSearch && matchesTrack && matchesStatus;
  });

  const handleDelete = async () => {
    if (!advocateToDelete) return;

    try {
      // Si está inactivo, borrar permanentemente
      if (!advocateToDelete.is_active) {
        await advocatesService.permanentlyDeleteAdvocate(advocateToDelete.id);
        toast.success("Referente eliminado permanentemente");
      } else {
        // Si está activo, solo desactivar
        await advocatesService.deleteAdvocate(advocateToDelete.id);
        toast.success("Referente desactivado exitosamente");
      }
      loadAdvocates();
      setDeleteDialogOpen(false);
      setAdvocateToDelete(null);
    } catch (error) {
      console.error("Error deleting advocate:", error);
      toast.error("Error al procesar la solicitud");
    }
  };

  const handleDeleteAllInactive = async () => {
    const inactiveAdvocates = advocates.filter((a) => !a.is_active);

    if (inactiveAdvocates.length === 0) {
      toast.info("No hay referentes inactivos para eliminar");
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar permanentemente ${inactiveAdvocates.length} referentes inactivos? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      let successCount = 0;
      let failedCount = 0;

      for (const advocate of inactiveAdvocates) {
        try {
          await advocatesService.permanentlyDeleteAdvocate(advocate.id);
          successCount++;
        } catch (error) {
          console.error(`Error deleting advocate ${advocate.id}:`, error);
          failedCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} referentes eliminados permanentemente`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} referentes no pudieron ser eliminados`);
      }

      loadAdvocates();
    } catch (error) {
      console.error("Error in bulk delete:", error);
      toast.error("Error al eliminar referentes");
    }
  };

  const handleToggleFeatured = async (advocate: DeFiAdvocate) => {
    try {
      await advocatesService.toggleFeatured(advocate.id, !advocate.is_featured);
      toast.success(
        advocate.is_featured ? "Referente removido de destacados" : "Referente destacado"
      );
      loadAdvocates();
    } catch (error) {
      console.error("Error toggling featured:", error);
      toast.error("Error al actualizar el referente");
    }
  };

  const handleToggleActive = async (advocate: DeFiAdvocate) => {
    try {
      await advocatesService.toggleActive(advocate.id, !advocate.is_active);
      toast.success(advocate.is_active ? "Referente desactivado" : "Referente activado");
      loadAdvocates();
    } catch (error) {
      console.error("Error toggling active:", error);
      toast.error("Error al actualizar el referente");
    }
  };

  const toggleAdvocateSelection = (advocateId: string) => {
    setSelectedAdvocates(prev =>
      prev.includes(advocateId)
        ? prev.filter(id => id !== advocateId)
        : [...prev, advocateId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedAdvocates(
      selectedAdvocates.length === filteredAdvocates.length
        ? []
        : filteredAdvocates.map(a => a.id)
    );
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Desactivar ${selectedAdvocates.length} referentes seleccionados?`)) return;

    try {
      // Eliminar cada referente seleccionado
      await Promise.all(
        selectedAdvocates.map(id => advocatesService.deleteAdvocate(id))
      );

      toast.success(`${selectedAdvocates.length} referentes desactivados`);
      setSelectedAdvocates([]);
      loadAdvocates();
    } catch (error) {
      console.error("Error bulk deleting:", error);
      toast.error("Error al desactivar los referentes");
    }
  };

  const openCreateDialog = () => {
    setAdvocateToEdit(null);
    setFormData({
      name: "",
      email: "",
      bio: "",
      location: "",
      expertise: "",
      track: "other",
      avatar_url: "",
      twitter_url: "",
      linkedin_url: "",
      github_url: "",
      website: "",
      specializations: [],
      is_featured: false,
      is_active: true,
    });
    setEditDialogOpen(true);
  };

  const openEditDialog = (advocate: DeFiAdvocate) => {
    setAdvocateToEdit(advocate);
    setFormData({
      name: advocate.name,
      email: advocate.email || "",
      bio: advocate.bio || "",
      location: advocate.location || "",
      expertise: advocate.expertise || "",
      track: advocate.track || "community_advocate",
      avatar_url: advocate.avatar_url || "",
      twitter_url: advocate.twitter_url || "",
      linkedin_url: advocate.linkedin_url || "",
      github_url: advocate.github_url || "",
      website: advocate.website || "",
      specializations: advocate.specializations || [],
      is_featured: advocate.is_featured || false,
      is_active: advocate.is_active !== false,
    });
    setEditDialogOpen(true);
  };

  const handleSaveAdvocate = async () => {
    try {
      const slug = advocatesService.generateSlug(formData.name);

      if (advocateToEdit) {
        // Editar
        await advocatesService.updateAdvocate(advocateToEdit.id, {
          ...formData,
          slug,
        });
        toast.success("Referente actualizado exitosamente");
      } else {
        // Crear
        await advocatesService.createAdvocate({
          ...formData,
          slug,
        });
        toast.success("Referente creado exitosamente");
      }

      loadAdvocates();
      setEditDialogOpen(false);
    } catch (error) {
      console.error("Error saving advocate:", error);
      toast.error("Error al guardar el referente");
    }
  };

  const handleImportAdvocates = async (advocates: any[]) => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const advocate of advocates) {
      try {
        if (!advocate.name) {
          throw new Error("Falta el campo 'name'");
        }

        const slug = advocatesService.generateSlug(advocate.name);

        // Auto-obtener avatar si hay Twitter o GitHub
        let avatar_url = advocate.avatar_url || "";
        if (!avatar_url) {
          if (advocate.github_url) {
            const username = advocate.github_url.split('github.com/')[1]?.split('/')[0];
            if (username) {
              avatar_url = `https://github.com/${username}.png?size=200`;
            }
          } else if (advocate.twitter_url) {
            let username = advocate.twitter_url.split('twitter.com/')[1]?.split('/')[0];
            if (!username) {
              username = advocate.twitter_url.split('x.com/')[1]?.split('/')[0];
            }
            if (username) {
              avatar_url = `https://unavatar.io/twitter/${username}`;
            }
          }
        }

        await advocatesService.createAdvocate({
          name: advocate.name,
          slug,
          email: advocate.email || null,
          bio: advocate.bio || null,
          location: advocate.location || null,
          expertise: advocate.expertise || null,
          track: advocate.track || "other",
          avatar_url: avatar_url || null,
          twitter_url: advocate.twitter_url || null,
          linkedin_url: advocate.linkedin_url || null,
          github_url: advocate.github_url || null,
          website: advocate.website || null,
          specializations: advocate.specializations || [],
          achievements: advocate.achievements || [],
          is_featured: advocate.is_featured || false,
          is_active: advocate.is_active !== false,
        });

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`${advocate.name || "Unknown"}: ${error.message}`);
      }
    }

    await loadAdvocates();
    return { success: successCount, failed: failedCount, errors };
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Referentes DeFi</h1>
          <p className="text-muted-foreground">
            Gestiona los referentes y advocates del ecosistema
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <ImportJSONWithPreview
              onImport={handleImportAdvocates}
              promptSuggestion={IMPORT_PROMPTS.advocates}
              entityName="Referentes"
              validateItem={(item: any) => !!item.name}
              getItemKey={(item: any, index: number) => item.name || index}
              renderPreviewItem={(item: any) => (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={item.avatar_url} alt={item.name} />
                      <AvatarFallback>{getInitials(item.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">{item.name}</h4>
                      {item.expertise && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.expertise}
                        </p>
                      )}
                      {item.track && (
                        <Badge variant="outline" className="text-xs mt-1">
                          {trackLabels[item.track] || item.track}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {item.bio && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.bio}
                    </p>
                  )}
                  <div className="flex gap-2 flex-wrap">
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
                    {item.linkedin_url && (
                      <Badge variant="secondary" className="text-xs">
                        LinkedIn
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            />
          )}
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Referente
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Activos</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Destacados</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.featured}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Desarrolladores</CardTitle>
            <Filter className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.byTrack["developer"] || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nombre o ubicación..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={trackFilter} onValueChange={setTrackFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {Object.entries(trackLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results count and bulk actions */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedAdvocates.length === filteredAdvocates.length && filteredAdvocates.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {filteredAdvocates.length} referente{filteredAdvocates.length !== 1 ? 's' : ''} encontrado{filteredAdvocates.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {selectedAdvocates.length > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {selectedAdvocates.length} seleccionado{selectedAdvocates.length !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Desactivar
                  </Button>
                </>
              )}

              {isAdmin && advocates.filter((a) => !a.is_active).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteAllInactive}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar {advocates.filter((a) => !a.is_active).length} inactivos permanentemente
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advocates List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAdvocates.map((advocate, index) => {
            const isSelected = selectedAdvocates.includes(advocate.id);

            return (
              <motion.div
                key={advocate.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={isSelected ? "bg-muted/50" : ""}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleAdvocateSelection(advocate.id)}
                        className="mt-1"
                      />
                      <Avatar className="h-16 w-16">
                      <AvatarImage src={advocate.avatar_url || undefined} />
                      <AvatarFallback className="text-3xl">😊</AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                              {advocate.name}
                              {advocate.is_featured && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              )}
                            </h3>
                            {/* Badges de estado de propuesta */}
                            {(advocate as any).isProposal && (advocate as any).proposalData && (
                              <>
                                {(advocate as any).proposalData.status === 'pending' && (
                                  <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                    Propuesta Pendiente
                                  </Badge>
                                )}
                                {(advocate as any).proposalData.status === 'approved' && (
                                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                    Aprobada (ERROR: No migró)
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {/* Fecha de creación de propuesta */}
                          {(advocate as any).isProposal && (advocate as any).proposalData && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Propuesta: {new Date((advocate as any).proposalData.created_at).toLocaleDateString('es-MX', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                          {advocate.location && (
                            <p className="text-sm text-muted-foreground">{advocate.location}</p>
                          )}
                          {advocate.expertise && (
                            <p className="text-sm text-primary mt-1">{advocate.expertise}</p>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(advocate as any).isProposal && (advocate as any).proposalData?.status === 'pending' ? (
                              <>
                                <DropdownMenuItem onClick={() => approveProposalItem((advocate as any).proposalData)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Aprobar y Publicar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => rejectProposalItem((advocate as any).proposalData)}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Rechazar
                                </DropdownMenuItem>
                              </>
                            ) : (advocate as any).isProposal && (advocate as any).proposalData?.status === 'approved' ? (
                              <DropdownMenuItem onClick={() => approveProposalItem((advocate as any).proposalData)}>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Reintentar Migración
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem onClick={() => openEditDialog(advocate)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleFeatured(advocate)}>
                                  <Star className="h-4 w-4 mr-2" />
                                  {advocate.is_featured ? "Quitar de destacados" : "Destacar"}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleActive(advocate)}>
                                  {advocate.is_active ? (
                                    <XCircle className="h-4 w-4 mr-2" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                  )}
                                  {advocate.is_active ? "Desactivar" : "Activar"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    setAdvocateToDelete(advocate);
                                    setDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {advocate.is_active ? "Eliminar" : "Eliminar permanentemente"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <Badge variant={advocate.is_active ? "default" : "secondary"}>
                          {advocate.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                        <Badge variant="outline">
                          {trackLabels[advocate.track || "other"]}
                        </Badge>
                        {advocate.specializations?.slice(0, 3).map((spec, i) => (
                          <Badge key={i} variant="secondary">
                            {spec}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
          })}

          {filteredAdvocates.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No hay referentes</h3>
                <p className="text-muted-foreground">
                  No se encontraron referentes con los filtros aplicados.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              {advocateToDelete?.is_active ? (
                "Esta acción desactivará el referente. Podrás reactivarlo más tarde."
              ) : (
                "Esta acción eliminará permanentemente el referente de la base de datos. Esta acción no se puede deshacer."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={!advocateToDelete?.is_active ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {advocateToDelete?.is_active ? "Desactivar" : "Eliminar permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create/Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {advocateToEdit ? "Editar Referente" : "Nuevo Referente"}
            </DialogTitle>
            <DialogDescription>
              Completa la información del referente del ecosistema DeFi
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Juan Pérez"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="juan@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">Ubicación</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="Ciudad de México, México"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="track">Categoría</Label>
                <Select
                  value={formData.track}
                  onValueChange={(value) => setFormData({ ...formData, track: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(trackLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expertise">Experiencia/Especialidad</Label>
              <Input
                id="expertise"
                value={formData.expertise}
                onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
                placeholder="Smart Contracts, DeFi Protocols"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Biografía</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Breve descripción..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatar_url">Avatar</Label>
              <div className="flex gap-3 items-start">
                {/* Vista previa del avatar */}
                <div className="flex-shrink-0">
                  <Avatar className="w-20 h-20 ring-2 ring-border">
                    <AvatarImage src={formData.avatar_url || undefined} />
                    <AvatarFallback className="text-lg">
                      {formData.name ? getInitials(formData.name) : "?"}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Input y botón */}
                <div className="flex-1 space-y-2">
                  <Input
                    id="avatar_url"
                    value={formData.avatar_url}
                    onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                    placeholder="https://..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAutoFetchAvatar}
                    disabled={loadingAvatar || (!formData.github_url && !formData.twitter_url)}
                    className="w-full"
                  >
                    {loadingAvatar ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Obteniendo...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3 mr-2" />
                        Obtener de GitHub/Twitter
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Agrega primero una URL de GitHub o Twitter, luego haz clic en el botón para obtener el avatar automáticamente.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="twitter_url">Twitter/X</Label>
                <div className="flex gap-2">
                  <Input
                    id="twitter_url"
                    value={formData.twitter_url}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      setFormData({ ...formData, twitter_url: newUrl });

                      // Auto-obtener avatar si no hay uno y la URL es válida
                      if (newUrl && !formData.avatar_url && (newUrl.includes('twitter.com/') || newUrl.includes('x.com/'))) {
                        const avatar = getTwitterAvatar(newUrl);
                        if (avatar) {
                          setTimeout(() => {
                            setFormData(prev => ({ ...prev, avatar_url: avatar }));
                            toast.success("✨ Avatar obtenido de Twitter");
                          }, 500);
                        }
                      }
                    }}
                    placeholder="https://x.com/usuario o https://twitter.com/usuario"
                  />
                  {formData.twitter_url && formData.avatar_url && (
                    <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="github_url">GitHub</Label>
                <div className="flex gap-2">
                  <Input
                    id="github_url"
                    value={formData.github_url}
                    onChange={(e) => {
                      const newUrl = e.target.value;
                      setFormData({ ...formData, github_url: newUrl });

                      // Auto-obtener avatar si no hay uno y la URL es válida
                      if (newUrl && !formData.avatar_url && newUrl.includes('github.com/')) {
                        const avatar = getGitHubAvatar(newUrl);
                        if (avatar) {
                          setTimeout(() => {
                            setFormData(prev => ({ ...prev, avatar_url: avatar }));
                            toast.success("✨ Avatar obtenido de GitHub");
                          }, 500);
                        }
                      }
                    }}
                    placeholder="https://github.com/usuario"
                  />
                  {formData.github_url && formData.avatar_url && (
                    <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn</Label>
                <Input
                  id="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_featured}
                  onChange={(e) =>
                    setFormData({ ...formData, is_featured: e.target.checked })
                  }
                  className="rounded"
                />
                <span className="text-sm">Destacado</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Activo</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAdvocate} disabled={!formData.name}>
              {advocateToEdit ? "Actualizar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAdvocates;
