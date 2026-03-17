import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Eye,
  Edit3,
  Trash2,
  MoreHorizontal,
  Loader2,
  Briefcase,
  CheckCircle,
  XCircle,
  RefreshCw,
  Star,
  StarOff,
  MapPin,
  DollarSign,
  ExternalLink,
  Filter,
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useNavigate } from "react-router-dom";
import { jobsService, type Job } from "@/services/jobs.service";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import ImportJSONWithPreview from "@/components/admin/ImportJSONWithPreview";
import { IMPORT_PROMPTS } from "@/constants/importPrompts";
import { useProposals } from "@/hooks/useProposals";
import type { Proposal } from "@/types/proposals";

const categories = ['Engineering', 'Product', 'Marketing', 'Security', 'Legal & Compliance', 'Design', 'Operations', 'Finance'];
const jobStatuses = [
  { value: 'pending', label: 'Pendiente', color: 'bg-yellow-500' },
  { value: 'draft', label: 'Borrador', color: 'bg-slate-500' },
  { value: 'published', label: 'Publicado', color: 'bg-green-500' },
  { value: 'closed', label: 'Cerrado', color: 'bg-red-500' },
  { value: 'expired', label: 'Expirado', color: 'bg-amber-500' },
];

const AdminJobs = () => {
  const navigate = useNavigate();
  const { getRoles } = useAuth();
  const userRoles = getRoles?.() || [];
  const isAdmin = userRoles.includes('admin');

  // Cargar propuestas de trabajos
  const {
    proposals,
    loading: proposalsLoading,
    approveProposal,
    rejectProposal: rejectProposalHook,
    refetch: refetchProposals
  } = useProposals({
    contentType: 'job',
  });

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const { data, error } = await jobsService.getAllAdmin();

      if (error) throw new Error(error);
      setJobs(data || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
      toast.error('Error al cargar los trabajos');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (job: Job) => {
    const isClosed = job.status === 'closed';
    const message = isClosed
      ? `¿Estás seguro de eliminar permanentemente "${job.title}"? Esta acción no se puede deshacer.`
      : `¿Estás seguro de cerrar "${job.title}"? Se marcará como cerrado.`;

    if (!confirm(message)) return;

    try {
      if (isClosed) {
        const { error } = await jobsService.permanentlyDelete(job.id);
        if (error) throw new Error(error);
        toast.success('Trabajo eliminado permanentemente');
      } else {
        const { error } = await jobsService.delete(job.id);
        if (error) throw new Error(error);
        toast.success('Trabajo cerrado correctamente');
      }
      loadJobs();
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error('Error al eliminar el trabajo');
    }
  };

  const handleStatusChange = async (job: Job, newStatus: Job['status']) => {
    try {
      const { error } = await jobsService.updateStatus(job.id, newStatus);
      if (error) throw new Error(error);
      toast.success(`Estado actualizado a ${newStatus}`);
      loadJobs();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar el estado');
    }
  };

  const handleToggleFeatured = async (job: Job) => {
    try {
      const { error } = await jobsService.toggleFeatured(job.id, !job.is_featured);
      if (error) throw new Error(error);
      toast.success(job.is_featured ? 'Trabajo quitado de destacados' : 'Trabajo destacado');
      loadJobs();
    } catch (error) {
      console.error('Error toggling featured:', error);
      toast.error('Error al cambiar estado destacado');
    }
  };

  // Aprobar propuesta de trabajo
  const approveProposalItem = async (proposal: Proposal) => {
    try {
      const { error } = await approveProposal(proposal.id);

      if (!error) {
        toast.success('Propuesta aprobada y publicada como trabajo');
        await refetchProposals();
        loadJobs();
      }
    } catch (error) {
      console.error('Error approving proposal:', error);
    }
  };

  // Rechazar propuesta de trabajo
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

  const handleDeleteAllDrafts = async () => {
    const drafts = jobs.filter((j) => j.status === 'draft');

    if (drafts.length === 0) {
      toast.info('No hay trabajos en borrador para eliminar');
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar permanentemente ${drafts.length} trabajos en borrador? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      let successCount = 0;
      let failedCount = 0;

      for (const job of drafts) {
        try {
          const result = await jobsService.permanentlyDelete(job.id);
          if (!result.error) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Error deleting job ${job.id}:`, error);
          failedCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} trabajos eliminados permanentemente`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} trabajos no pudieron ser eliminados`);
      }

      loadJobs();
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error('Error al eliminar trabajos');
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selectedJobs.length} trabajos seleccionados?`)) return;

    try {
      const { error } = await supabase
        .from('jobs')
        .delete()
        .in('id', selectedJobs);

      if (error) throw error;

      toast.success(`${selectedJobs.length} trabajos eliminados`);
      setSelectedJobs([]);
      loadJobs();
    } catch (error) {
      console.error('Error bulk deleting:', error);
      toast.error('Error al eliminar los trabajos');
    }
  };

  const handleImportJobs = async (jobsData: any[]) => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const job of jobsData) {
      try {
        if (!job.title || !job.company) {
          throw new Error("Falta el campo 'title' o 'company'");
        }

        const { error } = await supabase
          .from('jobs')
          .insert({
            title: job.title,
            company: job.company,
            company_logo: job.company_logo || null,
            location: job.location || 'México',
            job_type: job.job_type || 'remote',
            category: job.category || 'Engineering',
            salary_min: job.salary_min || null,
            salary_max: job.salary_max || null,
            salary_currency: job.salary_currency || 'USD',
            experience_level: job.experience_level || 'Mid (2-4 años)',
            tags: job.tags || [],
            description: job.description || '',
            requirements: job.requirements || null,
            benefits: job.benefits || null,
            apply_url: job.apply_url || '',
            apply_email: job.apply_email || null,
            is_featured: job.is_featured || false,
            status: job.status || 'draft',
          });

        if (error) throw error;

        successCount++;
      } catch (error: any) {
        failedCount++;
        errors.push(`${job.title || "Unknown"}: ${error.message}`);
      }
    }

    await loadJobs();
    return { success: successCount, failed: failedCount, errors };
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs(prev =>
      prev.includes(jobId)
        ? prev.filter(id => id !== jobId)
        : [...prev, jobId]
    );
  };

  const toggleSelectAll = () => {
    setSelectedJobs(
      selectedJobs.length === filteredJobs.length
        ? []
        : filteredJobs.filter(j => !(j as any).isProposal).map(j => j.id)
    );
  };

  // Combinar jobs con propuestas (solo mostrar pendientes, no aprobadas ni rechazadas)
  const allItems = [
    ...proposals
      .filter(p => p.status === 'pending')
      .map(p => ({
        id: p.id,
        title: p.content_data.title || 'Sin título',
        company: p.content_data.company || 'Sin empresa',
        company_logo: p.content_data.company_logo,
        location: p.content_data.location || 'México',
        job_type: p.content_data.job_type || 'remote',
        category: p.content_data.category || 'Engineering',
        salary_min: p.content_data.salary_min,
        salary_max: p.content_data.salary_max,
        salary_currency: p.content_data.salary_currency || 'USD',
        experience_level: p.content_data.experience_level,
        tags: p.content_data.tags || [],
        description: p.content_data.description || '',
        status: 'pending' as const,
        is_featured: false,
        created_at: p.created_at,
        isProposal: true,
        proposalData: p,
      } as any)),
    ...jobs.map(j => ({
      ...j,
      isProposal: false,
    })),
  ];

  const filteredJobs = allItems.filter(job => {
    const matchesSearch =
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.company.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "all" || job.category === selectedCategory;
    const matchesStatus = selectedStatus === "all" || job.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const pendingProposals = proposals.filter(p => p.status === 'pending').length;

  const stats = {
    total: jobs.length,
    published: jobs.filter(j => j.status === 'published').length,
    draft: jobs.filter(j => j.status === 'draft').length,
    featured: jobs.filter(j => j.is_featured).length,
    pending: pendingProposals,
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = jobStatuses.find(s => s.value === status);
    return (
      <Badge variant="outline" className={`${statusConfig?.color}/10 text-${statusConfig?.color.replace('bg-', '')}`}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  const getTypeLabel = (type: Job['job_type']) => {
    switch (type) {
      case 'remote': return '🌎 Remoto';
      case 'hybrid': return '🏢 Híbrido';
      case 'onsite': return '📍 Presencial';
      default: return type;
    }
  };

  const formatSalary = (job: Job) => {
    if (!job.salary_min && !job.salary_max) return '-';
    const currency = job.salary_currency || 'USD';
    if (job.salary_min && job.salary_max) {
      return `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()} ${currency}`;
    }
    if (job.salary_min) return `$${job.salary_min.toLocaleString()}+ ${currency}`;
    return `Hasta $${job.salary_max?.toLocaleString()} ${currency}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="w-8 h-8 text-primary" />
            Trabajos Web3
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las ofertas de trabajo del ecosistema
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && stats.draft > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAllDrafts}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Eliminar {stats.draft} borradores
            </Button>
          )}
          {isAdmin && (
            <ImportJSONWithPreview
              onImport={handleImportJobs}
              promptSuggestion={IMPORT_PROMPTS.jobs}
              entityName="Trabajos"
              validateItem={(item: any) => !!item.title && !!item.company}
              getItemKey={(item: any, index: number) => item.title || index}
              renderPreviewItem={(item: any) => (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    {item.company_logo && (
                      <img
                        src={item.company_logo}
                        alt={item.company}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">{item.title}</h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.company} • {item.location}
                      </p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {item.job_type === 'remote' ? '🌎 Remoto' : item.job_type === 'hybrid' ? '🏢 Híbrido' : '📍 Presencial'}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {item.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {item.salary_min && item.salary_max && (
                    <p className="text-xs text-green-600 font-medium">
                      💰 ${item.salary_min.toLocaleString()} - ${item.salary_max.toLocaleString()} {item.salary_currency || 'USD'}
                    </p>
                  )}
                  <div className="flex gap-1 flex-wrap">
                    {item.tags?.slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {item.tags?.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{item.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            />
          )}
          <Button asChild className="bg-green-600 hover:bg-green-700 text-white">
            <Link to="/admin/jobs/new">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Trabajo
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {stats.pending > 0 && (
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500/10 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.published}</p>
                <p className="text-xs text-muted-foreground">Publicados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-500/10 rounded-lg">
                <Edit3 className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.draft}</p>
                <p className="text-xs text-muted-foreground">Borradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Star className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.featured}</p>
                <p className="text-xs text-muted-foreground">Destacados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Buscar por título o empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {jobStatuses.map(status => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadJobs}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualizar
            </Button>
          </div>

          {/* Results count and bulk actions */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              {filteredJobs.length} de {jobs.length} trabajos
            </p>
            {selectedJobs.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedJobs.length} seleccionado{selectedJobs.length > 1 ? 's' : ''}
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar seleccionados
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-20">
              <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay trabajos</h3>
              <p className="text-muted-foreground mb-4">
                {search || selectedCategory !== "all" || selectedStatus !== "all"
                  ? "No se encontraron trabajos con esos filtros"
                  : "Comienza agregando tu primera oferta de trabajo"}
              </p>
              <Button asChild>
                <Link to="/admin/jobs/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Trabajo
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedJobs.length === filteredJobs.length && filteredJobs.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Trabajo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Salario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => {
                  const isProposal = (job as any).isProposal;
                  const proposalData = (job as any).proposalData;

                  return (
                    <TableRow key={job.id} className={isProposal ? "bg-yellow-500/5" : ""}>
                      <TableCell>
                        {!isProposal && (
                          <Checkbox
                            checked={selectedJobs.includes(job.id)}
                            onCheckedChange={() => toggleJobSelection(job.id)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isProposal ? 'bg-yellow-500/10' : 'bg-primary/10'}`}>
                            <Briefcase className={`w-5 h-5 ${isProposal ? 'text-yellow-600' : 'text-primary'}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{job.title}</span>
                              {job.is_featured && (
                                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                              )}
                              {isProposal && proposalData?.status === 'pending' && (
                                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                  Propuesta Pendiente
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{job.category}</Badge>
                              {job.tags?.slice(0, 2).map((tag: string) => (
                                <span key={tag} className="text-muted-foreground">{tag}</span>
                              ))}
                            </div>
                            {isProposal && proposalData && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Propuesta: {new Date(proposalData.created_at).toLocaleDateString('es-MX', {
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
                        <div className="flex items-center gap-2">
                          <span>{job.company}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {job.location}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getTypeLabel(job.job_type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatSalary(job as Job)}</span>
                      </TableCell>
                      <TableCell>
                        {isProposal ? (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            Pendiente
                          </Badge>
                        ) : (
                          <Select
                            value={job.status}
                            onValueChange={(value) => handleStatusChange(job as Job, value as Job['status'])}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {jobStatuses.filter(s => s.value !== 'pending').map(status => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Acciones para propuestas */}
                            {isProposal ? (
                              <>
                                {proposalData?.status === 'pending' && (
                                  <>
                                    <DropdownMenuItem
                                      className="text-green-600"
                                      onClick={() => approveProposalItem(proposalData)}
                                    >
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Aprobar y Publicar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-orange-600"
                                      onClick={() => rejectProposalItem(proposalData)}
                                    >
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Rechazar
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </>
                            ) : (
                              /* Acciones para jobs normales */
                              <>
                                <DropdownMenuItem asChild>
                                  <Link to={`/admin/jobs/edit/${job.id}`}>
                                    <Edit3 className="w-4 h-4 mr-2" />
                                    Editar
                                  </Link>
                                </DropdownMenuItem>
                                {(job as Job).apply_url && (
                                  <DropdownMenuItem asChild>
                                    <a href={(job as Job).apply_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-4 h-4 mr-2" />
                                      Ver URL aplicación
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleToggleFeatured(job as Job)}>
                                  {job.is_featured ? (
                                    <>
                                      <StarOff className="w-4 h-4 mr-2" />
                                      Quitar destacado
                                    </>
                                  ) : (
                                    <>
                                      <Star className="w-4 h-4 mr-2" />
                                      Destacar
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDelete(job as Job)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  {job.status === 'closed' ? 'Eliminar permanente' : 'Cerrar trabajo'}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminJobs;
