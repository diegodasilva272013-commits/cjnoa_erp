-- Fix RLS de consultas_agendadas: permitir a cualquier perfil con sesion activa.
-- El gating fino lo maneja el front via permisos.agendamiento (Sidebar) y rol.
-- Antes: solo rol IN ('empleado','socio','admin') -> abogado/procurador bloqueados.

ALTER TABLE public.consultas_agendadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultas_agendadas_select" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_insert" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_update" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_delete" ON public.consultas_agendadas;
DROP POLICY IF EXISTS consultas_agendadas_update_authenticated ON public.consultas_agendadas;

CREATE POLICY "consultas_agendadas_select" ON public.consultas_agendadas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "consultas_agendadas_insert" ON public.consultas_agendadas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "consultas_agendadas_update" ON public.consultas_agendadas
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "consultas_agendadas_delete" ON public.consultas_agendadas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));
