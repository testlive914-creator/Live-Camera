import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Video, ShieldCheck, Film, ListOrdered, Plus } from 'lucide-react';

interface NavbarProps {
  onOpenCreateModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreateModal }) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="border-b border-[#1F2937] bg-[#0F172A]/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link to="/admin/dashboard" className="flex items-center space-x-2 text-white font-semibold text-lg">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Video className="w-5 h-5" />
            </div>
            <span className="tracking-tight">Live Selfie <span className="text-blue-500 font-bold">Connect</span></span>
          </Link>
          <span className="text-xs bg-gray-800 text-gray-300 font-mono px-2 py-0.5 rounded border border-gray-700">
            Admin
          </span>
        </div>

        <nav className="hidden md:flex items-center space-x-1">
          <Link
            to="/admin/dashboard"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1.5 ${
              isActive('/admin/dashboard')
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
                : 'text-gray-300 hover:text-white hover:bg-gray-800/60'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Live Monitor</span>
          </Link>
          <Link
            to="/admin/sessions"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1.5 ${
              isActive('/admin/sessions')
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
                : 'text-gray-300 hover:text-white hover:bg-gray-800/60'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Sessions</span>
          </Link>
          <Link
            to="/admin/recordings"
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center space-x-1.5 ${
              isActive('/admin/recordings')
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/30'
                : 'text-gray-300 hover:text-white hover:bg-gray-800/60'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Recordings</span>
          </Link>
        </nav>

        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Audio Disabled (No Mic)</span>
          </div>

          {onOpenCreateModal && (
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg shadow transition-all shadow-blue-600/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>New Session</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
