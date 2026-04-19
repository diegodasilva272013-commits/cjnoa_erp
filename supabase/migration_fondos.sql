-- Fondos y Gastos del caso
-- Tracking client deposits and case expenses

CREATE TABLE IF NOT EXISTS movimientos_caso (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id UUID NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('deposito', 'gasto')),
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  moneda TEXT NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
  concepto TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  observaciones TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by case
CREATE INDEX IF NOT EXISTS idx_movimientos_caso_caso_id ON movimientos_caso(caso_id);

-- RLS
ALTER TABLE movimientos_caso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movimientos_caso_select" ON movimientos_caso FOR SELECT TO authenticated USING (true);
CREATE POLICY "movimientos_caso_insert" ON movimientos_caso FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "movimientos_caso_update" ON movimientos_caso FOR UPDATE TO authenticated USING (true);
CREATE POLICY "movimientos_caso_delete" ON movimientos_caso FOR DELETE TO authenticated USING (true);
