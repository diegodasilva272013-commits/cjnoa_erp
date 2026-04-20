const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://yvuxcpqlbybmtkrnmnsj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2dXhjcHFsYnlibXRrcm5tbnNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzIyNzYsImV4cCI6MjA5MjEwODI3Nn0.1G94pv71y_n-lae5QGteF8TwiWLtj1wI0NfUzUJcJcA'
);

async function main() {
  // 1. Autenticarse
  console.log('=== AUTENTICANDO ===');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'centrojuridiconoa@gmail.com',
    password: 'Noa@Base!de_$Datos112244'
  });

  if (authError) {
    console.error('ERROR DE AUTH:', authError.message);
    process.exit(1);
  }
  console.log('Autenticado como:', authData.user.email);

  // 2. Borrar datos en orden de FK (hijos primero)
  const tables = [
    'documentos',
    'recordatorios',
    'movimientos_caso',
    'cuotas',
    'ingresos',
    'egresos',
    'finanzas_excel_resumenes',
    'casos',
    'clientes'
  ];

  console.log('\n=== BORRANDO DATOS ===');
  for (const table of tables) {
    // Primero contar cuantos hay
    const { count: antes } = await supabase.from(table).select('*', { count: 'exact', head: true });
    
    // Borrar todo
    const { error, count: deleted } = await supabase.from(table).delete({ count: 'exact' }).gte('id', '00000000-0000-0000-0000-000000000000');
    
    if (error) {
      console.log(`${table}: ERROR - ${error.message}`);
    } else {
      console.log(`${table}: tenia ${antes ?? 0} filas, se borraron ${deleted ?? '?'}`);
    }
  }

  // 3. Verificar que todo este vacio
  console.log('\n=== VERIFICACION FINAL ===');
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`${table}: ERROR al verificar - ${error.message}`);
    } else {
      const status = count === 0 ? 'VACIA' : `QUEDAN ${count} FILAS`;
      console.log(`${table}: ${status}`);
    }
  }

  console.log('\n=== FIN ===');
  await supabase.auth.signOut();
}

main().catch(console.error);
