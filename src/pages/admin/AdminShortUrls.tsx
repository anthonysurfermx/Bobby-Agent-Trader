import { useState, useEffect } from 'react';
import {
  Link2,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  ToggleLeft,
  ToggleRight,
  MousePointerClick,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ShortUrl {
  id: string;
  code: string;
  target_path: string;
  title: string | null;
  click_count: number;
  is_active: boolean;
  created_at: string;
}

const SITE_URL = 'https://defimexico.org';

function generateCode(length = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default function AdminShortUrls() {
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formTarget, setFormTarget] = useState('');
  const [formTitle, setFormTitle] = useState('');

  const db = supabase as any;

  const fetchUrls = async () => {
    const { data, error } = await db
      .from('short_urls')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching short urls:', error);
      toast.error('Error cargando short URLs');
      return;
    }
    setUrls((data as ShortUrl[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchUrls();
  }, []);

  const openNewDialog = () => {
    setFormCode(generateCode());
    setFormTarget('');
    setFormTitle('');
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!formCode.trim() || !formTarget.trim()) {
      toast.error('Código y destino son obligatorios');
      return;
    }

    setSaving(true);
    const { error } = await db.from('short_urls').insert({
      code: formCode.trim().toLowerCase(),
      target_path: formTarget.trim(),
      title: formTitle.trim() || null,
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('Ese código ya existe, usa otro');
      } else {
        toast.error('Error creando short URL');
        console.error(error);
      }
    } else {
      toast.success('Short URL creado');
      setDialogOpen(false);
      await fetchUrls();
    }
    setSaving(false);
  };

  const handleToggle = async (url: ShortUrl) => {
    const { error } = await db
      .from('short_urls')
      .update({ is_active: !url.is_active })
      .eq('id', url.id);

    if (error) {
      toast.error('Error actualizando estado');
      console.error(error);
    } else {
      toast.success(url.is_active ? 'Desactivado' : 'Activado');
      await fetchUrls();
    }
  };

  const handleDelete = async (url: ShortUrl) => {
    if (!confirm(`Eliminar "${url.code}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await db
      .from('short_urls')
      .delete()
      .eq('id', url.id);

    if (error) {
      toast.error('Error eliminando');
      console.error(error);
    } else {
      toast.success('Eliminado');
      await fetchUrls();
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(`${SITE_URL}/s/${code}`);
    toast.success('Copiado al portapapeles');
  };

  const filtered = urls.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.code.toLowerCase().includes(q) ||
      u.target_path.toLowerCase().includes(q) ||
      (u.title && u.title.toLowerCase().includes(q))
    );
  });

  const totalClicks = urls.reduce((sum, u) => sum + (u.click_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Link2 className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{urls.length}</p>
                <p className="text-sm text-muted-foreground">Short URLs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ToggleRight className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{urls.filter((u) => u.is_active).length}</p>
                <p className="text-sm text-muted-foreground">Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <MousePointerClick className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Clicks totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Short URLs
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={openNewDialog}>
                <Plus className="w-4 h-4 mr-1.5" />
                Nuevo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {search ? 'No se encontraron resultados' : 'No hay short URLs. Crea el primero.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Short URL</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Titulo</TableHead>
                    <TableHead className="text-center">Clicks</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((url) => (
                    <TableRow key={url.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                            /s/{url.code}
                          </code>
                          <button
                            onClick={() => copyToClipboard(url.code)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Copiar URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 max-w-[300px]">
                          <span className="text-sm truncate">{url.target_path}</span>
                          <a
                            href={url.target_path.startsWith('http') ? url.target_path : `${SITE_URL}${url.target_path}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {url.title || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-mono text-sm">{url.click_count || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={url.is_active ? 'default' : 'secondary'}>
                          {url.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(url)}
                            title={url.is_active ? 'Desactivar' : 'Activar'}
                          >
                            {url.is_active ? (
                              <ToggleRight className="w-4 h-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(url)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Short URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="code">Codigo</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">/s/</span>
                <Input
                  id="code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="mi-link"
                  maxLength={20}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {SITE_URL}/s/{formCode || '...'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Destino</Label>
              <Input
                id="target"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                placeholder="/blog/mi-articulo o https://..."
              />
              <p className="text-xs text-muted-foreground">
                Ruta interna (/blog/...) o URL externa (https://...)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Titulo (opcional)</Label>
              <Input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Descripcion para identificar el link"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving || !formCode.trim() || !formTarget.trim()}>
              {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
