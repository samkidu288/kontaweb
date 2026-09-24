import React from 'react';
import { Video } from 'lucide-react';

interface HeaderProps {
  statusText?: string;
  isConnected?: boolean;
  isInCall?: boolean;
  role?: 'left' | 'right' | null;
  onExitCall?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  statusText = 'Siap', 
  isConnected = false,
  isInCall = false,
  role = null,
  onExitCall
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-between gap-3">
          
          {/* Logo & Judul Web Video Call (1 Baris Ringkas, tanpa card P2P 1-on-1) */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20 shrink-0">
              <Video className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
              Web Video Call
            </h1>
          </div>

          {/* Right Header Section - Disembunyikan saat di halaman Layar call karena sudah muncul di layar video bawahnya */}
          {!isInCall && (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span className="font-medium text-[11px]">Siap</span>
              </div>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
