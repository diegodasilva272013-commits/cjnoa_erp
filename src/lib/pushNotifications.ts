// Web Push helpers — registra service worker y gestiona la suscripción
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'BHwsxYus85bGMYI-CVG5DwVCb6gNq6Y5J5h2Nemx1o22AVuTDwD42uNvtoa-yL55H07AdJW0Alt3J1oAk-eZS2I';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer | null) {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.warn('SW register fallido', err);
    return null;
  }
}

export async function suscribirPush(usuarioId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (Notification.permission === 'denied') return false;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const j = sub.toJSON() as any;
    const endpoint = sub.endpoint;
    const p256dh = j.keys?.p256dh || arrayBufferToBase64(sub.getKey('p256dh'));
    const auth = j.keys?.auth || arrayBufferToBase64(sub.getKey('auth'));
    if (!endpoint || !p256dh || !auth) return false;

    // Upsert por endpoint
    const { error } = await supabase.from('push_subscriptions').upsert({
      usuario_id: usuarioId,
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) console.warn('upsert push_subscriptions:', error.message);
    return !error;
  } catch (err) {
    console.warn('suscribirPush err', err);
    return false;
  }
}

export async function desuscribirPush(usuarioId: string) {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('usuario_id', usuarioId);
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
}
