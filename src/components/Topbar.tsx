import { useRef } from 'react';
import { Menu, LogOut, User, Camera, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import { ROLES, Rol } from '../types/database';
import NotificationBell from './NotificationBell';

interface TopbarProps {
  onMenuClick: () => void;
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, perfil, signOut, refetchPerfil } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rolLabel = ROLES.find(r => r.value === perfil?.rol)?.label || perfil?.rol || 'Usuario';
  const avatarUrl = useAvatarUrl(perfil?.avatar_url);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      showToast('Solo se permiten imágenes', 'error');
      return;
    }
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `avatars/${user.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('notas-voz').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('perfiles').update({ avatar_url: path }).eq('id', user.id);
      if (dbErr) throw dbErr;
      await refetchPerfil();
      showToast('Foto actualizada');
    } catch (err: any) {
      showToast(err.message || 'Error al subir foto', 'error');
    }
    e.target.value = '';
  }

  return (
    <header className="sticky top-0 z-30 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="flex items-center justify-between px-6 py-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-4">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-500 hover:text-gray-300 hover:border-white/10 transition-all text-xs"
            title="Buscar (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Buscar...</span>
            <kbd className="ml-1 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px]">⌘K</kbd>
          </button>
          <NotificationBell />
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative w-8 h-8 rounded-lg overflow-hidden group flex-shrink-0"
              title="Cambiar foto de perfil"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-200" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-white" />
              </div>
            </button>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-white">
                {perfil?.nombre || 'Usuario'}
              </p>
              <p className="text-[10px] text-gray-600">{rolLabel}</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="p-2.5 text-gray-500 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-all duration-200"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
