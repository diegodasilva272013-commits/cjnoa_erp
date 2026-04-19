import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import CommandPalette from './CommandPalette';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useKeyboardShortcuts();

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <CommandPalette />

      <div className="lg:pl-[260px] min-h-screen">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
