import { useState, useEffect } from "react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Eye, UserCheck, UserX, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { usersService, type AppUser, type UserStats } from "@/services/users.service";
import { toast } from "sonner";

const AdminUsers = () => {
  // Estado para datos
  const [users, setUsers] = useState<AppUser[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado para filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Estado para acciones
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Estado para modal de permisos
  const [permissionsModal, setPermissionsModal] = useState<{
    open: boolean;
    user: AppUser | null;
    permissions: string[];
    loading: boolean;
  }>({
    open: false,
    user: null,
    permissions: [],
    loading: false,
  });

  // Cargar usuarios al montar el componente
  useEffect(() => {
    loadUsers();
    loadStats();
  }, []);

  // Recargar cuando cambien los filtros
  useEffect(() => {
    loadUsers();
  }, [searchTerm, roleFilter, statusFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const result = await usersService.getAll({
        search: searchTerm || undefined,
        role: roleFilter === 'all' ? undefined : roleFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      
      if (result.error) {
        setError(result.error);
      } else {
        setUsers(result.data || []);
        setError(null);
      }
    } catch (err) {
      setError('Error al cargar usuarios');
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await usersService.getStats();
      if (result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  // Acciones de usuario
  const handleToggleStatus = async (userId: string) => {
    try {
      setActionLoading(userId);
      const result = await usersService.toggleStatus(userId);
      
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Estado del usuario actualizado');
        await loadUsers();
        await loadStats();
      }
    } catch (err) {
      toast.error('Error al cambiar estado del usuario');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      setActionLoading(userId);
      const result = await usersService.changeRole(userId, newRole);
      
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Rol actualizado correctamente');
        await loadUsers();
        await loadStats();
      }
    } catch (err) {
      toast.error('Error al cambiar rol del usuario');
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenPermissionsModal = async (user: AppUser) => {
    setPermissionsModal(prev => ({ ...prev, loading: true, open: true, user }));
    
    try {
      // Obtener permisos actuales del usuario
      const defaultPermissions = usersService.getDefaultPermissions(user.role);
      setPermissionsModal(prev => ({
        ...prev,
        permissions: defaultPermissions,
        loading: false
      }));
    } catch (err) {
      toast.error('Error al cargar permisos del usuario');
      setPermissionsModal(prev => ({ ...prev, loading: false, open: false }));
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    // Función mantenida para compatibilidad, pero actualmente deshabilitada
    setPermissionsModal(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permission]
        : prev.permissions.filter(p => p !== permission)
    }));
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de que quieres desactivar este usuario?')) {
      return;
    }
    
    try {
      setActionLoading(userId);
      const result = await usersService.delete(userId);
      
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('Usuario desactivado correctamente');
        await loadUsers();
        await loadStats();
      }
    } catch (err) {
      toast.error('Error al desactivar usuario');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users;

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-500/10 text-red-500";
      case "editor": return "bg-blue-500/10 text-blue-500";
      case "moderator": return "bg-green-500/10 text-green-500";
      case "user": return "bg-purple-500/10 text-purple-500";
      case "viewer": return "bg-gray-500/10 text-gray-500";
      default: return "bg-gray-500/10 text-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-500";
      case "inactive": return "bg-red-500/10 text-red-500";
      case "pending": return "bg-yellow-500/10 text-yellow-500";
      default: return "bg-gray-500/10 text-gray-500";
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground">Gestión de Usuarios</h1>
            <p className="text-muted-foreground">
              Administra usuarios, roles y permisos del sistema
            </p>
          </div>
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Invitar Usuario
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Buscar por nombre o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="moderator">Moderador</SelectItem>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              {stats ? (
                <>
                  <div className="text-2xl font-bold text-primary">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Usuarios</div>
                </>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              {stats ? (
                <>
                  <div className="text-2xl font-bold text-green-500">{stats.active}</div>
                  <div className="text-sm text-muted-foreground">Activos</div>
                </>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              {stats ? (
                <>
                  <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
                  <div className="text-sm text-muted-foreground">Pendientes</div>
                </>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              {stats ? (
                <>
                  <div className="text-2xl font-bold text-red-500">{stats.admins}</div>
                  <div className="text-sm text-muted-foreground">Administradores</div>
                </>
              ) : (
                <Skeleton className="h-12 w-full" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Usuarios ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between p-4 border border-border rounded-lg">
                    <div className="flex items-center space-x-4 flex-1">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-1/3 mb-2" />
                        <Skeleton className="h-3 w-1/2 mb-1" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-6 w-12" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredUsers.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={user.avatar_url || undefined} alt={user.full_name || user.email} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {(user.full_name || user.email).split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground truncate">
                          {user.full_name || user.email.split('@')[0]}
                        </h3>
                        <Badge className={getRoleColor(user.role)}>
                          {user.role}
                        </Badge>
                        <Badge className={getStatusColor(user.status || 'active')}>
                          {user.status || 'activo'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Creado: {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">
                        {user.permissions?.length || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Permisos</div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch 
                        checked={user.status !== "inactive"} 
                        disabled={user.role === "admin" || actionLoading === user.id}
                        onCheckedChange={() => handleToggleStatus(user.id)}
                      />
                      <span className="text-xs text-muted-foreground">
{user.status !== "inactive" ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Perfil
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar Usuario
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleOpenPermissionsModal(user)}
                        >
                          <Shield className="w-4 h-4 mr-2" />
                          Cambiar Permisos
                        </DropdownMenuItem>
                        {user.status !== "inactive" ? (
                          <DropdownMenuItem onClick={() => handleToggleStatus(user.id)}>
                            <UserX className="w-4 h-4 mr-2" />
                            Desactivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleStatus(user.id)}>
                            <UserCheck className="w-4 h-4 mr-2" />
                            Activar
                          </DropdownMenuItem>
                        )}
                        {user.role !== "admin" && (
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
              </div>
            )}

            {!loading && filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No se encontraron usuarios
                </h3>
                <p className="text-muted-foreground mb-4">
                  Intenta ajustar los filtros de búsqueda.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Permissions Modal */}
        <Dialog 
          open={permissionsModal.open} 
          onOpenChange={(open) => !open && setPermissionsModal({ open: false, user: null, permissions: [], loading: false })}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Editar Permisos
              </DialogTitle>
              <DialogDescription>
                Gestiona los permisos para {permissionsModal.user?.full_name || permissionsModal.user?.email}
              </DialogDescription>
            </DialogHeader>

            {permissionsModal.loading ? (
              <div className="space-y-4 py-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 py-4">
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Permisos por rol:</strong> Los permisos se asignan automáticamente según el rol del usuario. 
                    Cambiar permisos individuales requiere configuración adicional de base de datos.
                  </AlertDescription>
                </Alert>

                {/* Lista de todos los permisos disponibles */}
                {[
                  { id: 'read', label: 'Lectura', description: 'Ver contenido y datos' },
                  { id: 'write', label: 'Escritura', description: 'Crear y editar contenido' },
                  { id: 'delete', label: 'Eliminar', description: 'Eliminar contenido' },
                  { id: 'publish_content', label: 'Publicar', description: 'Publicar contenido' },
                  { id: 'moderate_content', label: 'Moderar', description: 'Moderar contenido de usuarios' },
                  { id: 'manage_comments', label: 'Gestionar Comentarios', description: 'Administrar comentarios' },
                  { id: 'manage_users', label: 'Gestionar Usuarios', description: 'Administrar otros usuarios' },
                  { id: 'analytics', label: 'Analytics', description: 'Ver estadísticas y métricas' },
                  { id: 'admin_panel', label: 'Panel Admin', description: 'Acceso al panel administrativo' },
                ].map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={permission.id}
                      checked={permissionsModal.permissions.includes(permission.id)}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(permission.id, checked as boolean)
                      }
                      disabled={true}
                    />
                    <div className="space-y-1 leading-none">
                      <Label
                        htmlFor={permission.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {permission.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {permission.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setPermissionsModal({ open: false, user: null, permissions: [], loading: false })}
              >
                Cerrar
              </Button>
              <Button
                disabled={true}
                className="bg-gray-400 text-gray-600 cursor-not-allowed"
              >
                <Shield className="w-4 h-4 mr-2" />
                Edición Limitada
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  );
};

export default AdminUsers;