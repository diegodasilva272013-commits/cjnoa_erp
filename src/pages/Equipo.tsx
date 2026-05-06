import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Loader2, Shield, ShieldCheck, User, Pencil, Trash2, UserCheck, UserX, Eye, EyeOff, Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { usePermisos } from '../hooks/usePermisos';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import { Perfil, Rol, ROLES, PermisosUsuario, PERMISOS_DEFAULT, MODULOS } from '../types/database';
import Modal from '../components/Modal';
import AuditLogPanel from '../components/AuditLogPanel';

const rolIcons: Record<Rol, typeof Shield> = {
  admin: ShieldCheck,
  socio: Shield,
  abogado: Shield,
  empleado: User,
  procurador: User,
};

const rolColors: Record<Rol, string> = {
  admin: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  socio: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  abogado: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  empleado: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  procurador: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

function MiembroAvatar({ path, fallback, isActivo }: { path: string | null | undefined; fallback: React.ReactNode; isActivo: boolean }) {
  const url = useAvatarUrl(path);
  return (
    <div className={`w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 ${
      !path && (isActivo ? 'bg-gradient-to-br from-gray-600 to-gray-800' : 'bg-gray-800')
    }`}>
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          {fallback}
        </div>
      )}
    </div>
  );
}

export default function Equipo() {
  const { user, perfil } = useAuth();
  const { isAdmin } = usePermisos();
  const canAccessEquipo = isAdmin || perfil?.rol === 'socio' || perfil?.permisos?.equipo === true;
  const { showToast } = useToast();
  const [miembros, setMiembros] = useState<(Perfil & { email?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMiembro, setEditingMiembro] = useState<Perfil | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchMiembros = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        showToast('Error al cargar miembros: ' + error.message, 'error');
      } else if (data) {
        setMiembros(data as Perfil[]);
      }
    } catch (err) {
      showToast('Error al cargar miembros', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMiembros();
  }, [fetchMiembros]);

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase.from('perfiles').delete().eq('id', id);
      if (error) throw error;
      showToast('Miembro eliminado');
      setDeleteConfirm(null);
      fetchMiembros();
    } catch (err: any) {
      showToast(err.message || 'Error al eliminar', 'error');
    }
  }

  async function handleToggleActivo(miembro: Perfil) {
    try {
      const newActivo = miembro.activo === false ? true : false;
      const { error } = await supabase
        .from('perfiles')
        .update({ activo: newActivo })
        .eq('id', miembro.id);
      if (error) throw error;
      showToast(newActivo ? 'Miembro activado' : 'Miembro desactivado');
      fetchMiembros();
    } catch (err: any) {
      showToast(err.message || 'Error', 'error');
    }
  }

  if (!canAccessEquipo) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <Shield className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-lg font-medium">Acceso restringido</p>
          <p className="text-gray-600 text-sm">Necesitás permiso de "Equipo" para gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Equipo</h1>
          <p className="text-gray-500 text-sm mt-1">
            {miembros.length} {miembros.length === 1 ? 'miembro' : 'miembros'}
          </p>
        </div>
        <button onClick={() => { setEditingMiembro(null); setModalOpen(true); }} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo Miembro</span>
        </button>
      </div>

      {/* Roles legend */}
      <div className="glass-card p-4">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-3">Roles y Permisos</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ROLES.map(r => {
            const Icon = rolIcons[r.value];
            return (
              <div key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border ${rolColors[r.value]}`}>
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{r.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Members table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Nombre</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Rol</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3 hidden sm:table-cell">Estado</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3 hidden lg:table-cell">Permisos</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3 hidden md:table-cell">Miembro desde</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {miembros.map(miembro => {
                const Icon = rolIcons[(miembro.rol as Rol) || 'empleado'];
                const isCurrentUser = miembro.id === user?.id;
                const isActivo = miembro.activo !== false;
                return (
                  <tr key={miembro.id} className="table-row">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <MiembroAvatar
                          path={miembro.avatar_url}
                          isActivo={isActivo}
                          fallback={<Icon className={`w-4 h-4 ${isActivo ? 'text-gray-200' : 'text-gray-600'}`} />}
                        />
                        <div>
                          <p className={`text-sm font-medium ${isActivo ? 'text-white' : 'text-gray-500'}`}>
                            {miembro.nombre}
                            {isCurrentUser && (
                              <span className="text-xs text-gray-500 ml-2">(vos)</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${rolColors[(miembro.rol as Rol) || 'empleado']}`}>
                        <Icon className="w-3 h-3" />
                        {ROLES.find(r => r.value === miembro.rol)?.label || miembro.rol}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden sm:table-cell">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        isActivo ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {isActivo ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                        {isActivo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1.5">
                        {MODULOS.map(mod => {
                          const tiene = miembro.permisos
                            ? (miembro.permisos as PermisosUsuario)[mod.key]
                            : PERMISOS_DEFAULT[(miembro.rol as Rol) || 'empleado'][mod.key];
                          return (
                            <span
                              key={mod.key}
                              title={`${mod.label}: ${tiene ? 'Sí' : 'No'}`}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                tiene
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : 'bg-white/5 text-gray-600'
                              }`}
                            >
                              {mod.label.substring(0, 3).toUpperCase()}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {new Date(miembro.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!isCurrentUser && (
                          <button
                            onClick={() => handleToggleActivo(miembro)}
                            className={`p-2 rounded-lg transition-colors ${
                              isActivo
                                ? 'text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10'
                                : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                            title={isActivo ? 'Desactivar' : 'Activar'}
                          >
                            {isActivo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingMiembro(miembro); setModalOpen(true); }}
                          className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {!isCurrentUser && (
                          deleteConfirm === miembro.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(miembro.id)}
                                className="px-2 py-1 text-xs text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-2 py-1 text-xs text-gray-400 bg-white/5 rounded-lg hover:bg-white/10"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(miembro.id)}
                              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit log de cambios de rol/permisos */}
      <AuditLogPanel />

      {/* Modal Create/Edit */}
      <MiembroModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingMiembro(null); }}
        miembro={editingMiembro}
        onSaved={fetchMiembros}
      />
    </div>
  );
}

// ============================================
// Modal para crear/editar miembros
// ============================================
function MiembroModal({ open, onClose, miembro, onSaved }: {
  open: boolean;
  onClose: () => void;
  miembro: Perfil | null;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const { refetchPerfil, user } = useAuth();
  const isEditing = !!miembro;

  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('socio');
  const [permisos, setPermisos] = useState<PermisosUsuario>(PERMISOS_DEFAULT.socio);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (miembro) {
      setNombre(miembro.nombre);
      const r = (miembro.rol as Rol) || 'socio';
      setRol(r);
      setPermisos(miembro.permisos ? { ...PERMISOS_DEFAULT[r], ...miembro.permisos } : PERMISOS_DEFAULT[r]);
      setEmail('');
      setPassword('');
      setAvatarPreview(null);
      setAvatarFile(null);
      // Load signed URL for existing avatar
      if (miembro.avatar_url) {
        supabase.storage.from('notas-voz').createSignedUrl(miembro.avatar_url, 3600)
          .then(({ data }) => { if (data) setAvatarPreview(data.signedUrl); });
      }
    } else {
      setNombre('');
      setRol('socio');
      setPermisos(PERMISOS_DEFAULT.socio);
      setEmail('');
      setPassword('');
      setAvatarPreview(null);
      setAvatarFile(null);
    }
  }, [miembro, open]);

  function handleRolChange(newRol: Rol) {
    setRol(newRol);
    setPermisos(PERMISOS_DEFAULT[newRol]);
  }

  function togglePermiso(key: keyof PermisosUsuario) {
    setPermisos(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!nombre.trim()) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }
    if (!isEditing && (!email.trim() || !password.trim())) {
      showToast('Email y contraseña son obligatorios para crear un usuario', 'error');
      return;
    }
    if (!isEditing && password.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        let avatarUrl = miembro!.avatar_url || null;
        if (avatarFile) {
          const ext = avatarFile.name.split('.').pop() || 'jpg';
          const path = `avatars/${miembro!.id}.${ext}`;
          const { error: upErr } = await supabase.storage.from('notas-voz').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
          if (upErr) throw upErr;
          avatarUrl = path;
        }
        const { error } = await supabase
          .from('perfiles')
          .update({ nombre: nombre.trim(), rol, permisos, avatar_url: avatarUrl })
          .eq('id', miembro!.id);
        if (error) throw error;
        if (miembro!.id === user?.id) await refetchPerfil();
        showToast('Miembro actualizado');
      } else {
        // Nuevo flujo: crear usuario vía endpoint backend
        const resp = await fetch('/api/createUserAdmin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: password.trim(), nombre: nombre.trim() })
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Error al crear usuario');
        const userId = result.user?.id;
        if (userId) {
          // Actualizar perfil con rol y permisos
          const { error: perfilError } = await supabase
            .from('perfiles')
            .update({ nombre: nombre.trim(), rol, permisos })
            .eq('id', userId);
          if (perfilError) {
            const { error: insertError } = await supabase
              .from('perfiles')
              .upsert({
                id: userId,
                nombre: nombre.trim(),
                rol,
                permisos,
              });
            if (insertError) showToast('Error al actualizar perfil: ' + insertError.message, 'error');
          }
        }
        showToast('Miembro creado. Puede iniciar sesión con su email y contraseña.');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar Miembro' : 'Nuevo Miembro'}
      subtitle={isEditing ? miembro!.nombre : 'Agregar un colaborador al equipo'}
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        {/* Avatar upload */}
        <div className="flex flex-col items-center gap-3">
          <input
            type="file"
            ref={avatarInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (!file.type.startsWith('image/')) { showToast('Solo se permiten imágenes', 'error'); return; }
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl overflow-hidden group border-2 border-white/10 hover:border-white/20 transition-colors"
            title="Cambiar foto"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </button>
          <p className="text-[10px] text-gray-500">Clic para subir foto</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Nombre completo</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className="input-dark"
            placeholder="Ej: Rodrigo López"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Rol</label>
          <div className="space-y-2">
            {ROLES.map(r => {
              const Icon = rolIcons[r.value];
              return (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    rol === r.value
                      ? rolColors[r.value]
                      : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <input
                    type="radio"
                    name="rol"
                    value={r.value}
                    checked={rol === r.value}
                    onChange={() => handleRolChange(r.value)}
                    className="sr-only"
                  />
                  <Icon className={`w-5 h-5 ${rol === r.value ? '' : 'text-gray-500'}`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${rol === r.value ? '' : 'text-gray-400'}`}>{r.label}</p>
                    <p className={`text-xs ${rol === r.value ? 'opacity-70' : 'text-gray-600'}`}>{r.description}</p>
                  </div>
                  {rol === r.value && (
                    <div className="w-2 h-2 rounded-full bg-current" />
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Permisos personalizados */}
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Menús visibles</label>
          <p className="text-xs text-gray-600 mb-3">Elegí qué secciones puede ver este usuario</p>
          <div className="space-y-2">
            {MODULOS.map(mod => (
              <button
                key={mod.key}
                type="button"
                onClick={() => togglePermiso(mod.key)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  permisos[mod.key]
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <div className={`p-1.5 rounded-lg ${
                  permisos[mod.key] ? 'bg-emerald-500/15' : 'bg-white/5'
                }`}>
                  {permisos[mod.key]
                    ? <Eye className="w-4 h-4 text-emerald-400" />
                    : <EyeOff className="w-4 h-4 text-gray-600" />
                  }
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${permisos[mod.key] ? 'text-white' : 'text-gray-500'}`}>
                    {mod.label}
                  </p>
                  <p className={`text-xs ${permisos[mod.key] ? 'text-gray-400' : 'text-gray-600'}`}>
                    {mod.description}
                  </p>
                </div>
                <div className={`w-10 h-6 rounded-full relative transition-colors ${
                  permisos[mod.key] ? 'bg-emerald-500' : 'bg-white/10'
                }`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    permisos[mod.key] ? 'left-5' : 'left-1'
                  }`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {!isEditing && (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Email de acceso</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-dark"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-dark"
                placeholder="Mínimo 6 caracteres"
              />
              <p className="text-xs text-gray-600 mt-1.5">El usuario podrá cambiarla después</p>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : (isEditing ? 'Guardar cambios' : 'Crear miembro')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
