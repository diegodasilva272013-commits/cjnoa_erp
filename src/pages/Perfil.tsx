import { useState, useRef } from 'react';
import { User, Camera, Lock, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { useAvatarUrl } from '../hooks/useAvatarUrl';

export default function Perfil() {
  const { perfil, user } = useAuth();
  const { showToast } = useToast();
  const avatarUrl = useAvatarUrl(perfil?.avatar_url);
  const fileRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(perfil?.nombre || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  async function handleSaveProfile() {
    if (!nombre.trim()) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ nombre: nombre.trim() })
        .eq('id', user!.id);
      if (error) throw error;
      showToast('Perfil actualizado', 'success');
    } catch {
      showToast('Error al guardar perfil', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Solo se permiten imágenes JPG, PNG o WebP', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('La imagen no debe superar 2 MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('perfiles')
        .update({ avatar_url: path })
        .eq('id', user.id);
      if (updateError) throw updateError;

      showToast('Avatar actualizado', 'success');
    } catch {
      showToast('Error al subir avatar', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePwd() {
    if (!newPwd || !confirmPwd) return;
    if (newPwd !== confirmPwd) {
      showToast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (newPwd.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      showToast('Contraseña actualizada correctamente', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al cambiar contraseña', 'error');
    } finally {
      setSavingPwd(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-semibold text-white">Mi Perfil</h1>

      {/* Avatar + nombre */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-6 space-y-5">
        <h2 className="text-sm font-medium text-gray-300">Información personal</h2>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-white/[0.04] border border-white/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-8 h-8 text-gray-600" />
              </div>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm text-white">{perfil?.nombre || 'Sin nombre'}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingAvatar}
              className="mt-2 flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              Cambiar foto
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
        </div>

        {/* Nombre */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Nombre completo</label>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Tu nombre"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile || !nombre.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl text-sm text-white font-medium transition-colors"
        >
          {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar cambios
        </button>
      </div>

      {/* Cambiar contraseña */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-6 space-y-5">
        <h2 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          Cambiar contraseña
        </h2>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wide">Contraseña actual</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wide">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wide">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Repetir contraseña"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
            />
          </div>
        </div>

        <button
          onClick={handleChangePwd}
          disabled={savingPwd || !newPwd || !confirmPwd}
          className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 border border-white/10 rounded-xl text-sm text-white font-medium transition-colors"
        >
          {savingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Actualizar contraseña
        </button>
      </div>

      {/* Info cuenta */}
      <div className="glass-panel rounded-2xl border border-white/[0.06] p-6 space-y-3">
        <h2 className="text-sm font-medium text-gray-300">Información de cuenta</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">Email</p>
            <p className="text-gray-300">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Rol</p>
            <p className="text-gray-300 capitalize">{perfil?.rol || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
