-- ============================================================
-- FIX: recursión infinita en RLS de chat_participantes
-- La política original hacía EXISTS sobre la misma tabla.
-- Solución: helper SECURITY DEFINER que evita la recursión.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_chat_member(conv_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participantes
    WHERE conversacion_id = conv_id AND usuario_id = uid
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) TO authenticated;

-- ===================== chat_participantes =====================
DROP POLICY IF EXISTS chat_part_select ON public.chat_participantes;
CREATE POLICY chat_part_select ON public.chat_participantes
  FOR SELECT TO authenticated USING (
    usuario_id = auth.uid()
    OR public.is_chat_member(conversacion_id, auth.uid())
  );

-- ===================== chat_conversaciones =====================
DROP POLICY IF EXISTS chat_conv_select ON public.chat_conversaciones;
CREATE POLICY chat_conv_select ON public.chat_conversaciones
  FOR SELECT TO authenticated USING (
    public.is_chat_member(id, auth.uid())
  );

DROP POLICY IF EXISTS chat_conv_update ON public.chat_conversaciones;
CREATE POLICY chat_conv_update ON public.chat_conversaciones
  FOR UPDATE TO authenticated USING (
    public.is_chat_member(id, auth.uid())
  );

-- ===================== chat_mensajes =====================
DROP POLICY IF EXISTS chat_msg_select ON public.chat_mensajes;
CREATE POLICY chat_msg_select ON public.chat_mensajes
  FOR SELECT TO authenticated USING (
    public.is_chat_member(conversacion_id, auth.uid())
  );

DROP POLICY IF EXISTS chat_msg_insert ON public.chat_mensajes;
CREATE POLICY chat_msg_insert ON public.chat_mensajes
  FOR INSERT TO authenticated WITH CHECK (
    emisor_id = auth.uid()
    AND public.is_chat_member(conversacion_id, auth.uid())
  );

NOTIFY pgrst, 'reload schema';
