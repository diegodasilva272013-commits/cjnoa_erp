import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import CommandPalette from './CommandPalette';
import AlarmaTareas from './AlarmaTareas';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useKeyboardShortcuts();

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <CommandPalette />
      <AlarmaTareas />

      <div className="lg:pl-[260px] min-h-screen">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        {/* pb-20 on mobile to clear the bottom nav bar */}
        <main className="p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-[1600px] mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
}
