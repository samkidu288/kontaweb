import React from 'react';
import { Video, Smartphone, ArrowRight } from 'lucide-react';

interface HomePageProps {
  onSelectRole: (role: 'left' | 'right') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectRole }) => {
  return (
    <div className="flex flex-col items-center justify-center max-w-sm mx-auto px-4 py-6 text-center space-y-7 animate-in fade-in zoom-in-95 duration-300">
      
      {/* Brand Header */}
      <div className="space-y-3">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-xl shadow-sky-500/25">
          <Video className="w-7 h-7 text-white" />
        </div>
        
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
          Web Video Call
        </h1>
      </div>

      {/* 2 Main Action Buttons - Khusus Layar HP */}
      <div className="flex flex-col gap-3.5 w-full">
        
        {/* TOMBOL PESERTA 1 */}
        <button
          onClick={() => onSelectRole('left')}
          className="group relative flex items-center p-4 rounded-2xl bg-slate-900 border-2 border-slate-800 hover:border-sky-500 hover:bg-slate-900/90 active:bg-slate-800 shadow-lg transition-all duration-200 cursor-pointer text-left active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition shrink-0 mr-4">
            <Smartphone className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-sky-400 transition truncate">
              Peserta 1
            </h2>
            <p className="text-xs text-slate-400 leading-snug mt-0.5">
              Tekan tombol disini untuk masuk
            </p>
          </div>

          <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-sky-400 transform group-hover:translate-x-1 transition ml-2 shrink-0" />
        </button>

        {/* TOMBOL PESERTA 2 */}
        <button
          onClick={() => onSelectRole('right')}
          className="group relative flex items-center p-4 rounded-2xl bg-slate-900 border-2 border-emerald-500/60 hover:border-emerald-400 hover:bg-slate-900/90 active:bg-slate-800 shadow-xl shadow-emerald-950/20 transition-all duration-200 cursor-pointer text-left active:scale-[0.98]"
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition shrink-0 mr-4">
            <Smartphone className="w-6 h-6" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 group-hover:text-emerald-400 transition truncate">
              Peserta 2
            </h2>
            <p className="text-xs text-slate-400 leading-snug mt-0.5">
              Tekan tombol disini untuk masuk
            </p>
          </div>

          <ArrowRight className="w-5 h-5 text-emerald-500 group-hover:text-emerald-400 transform group-hover:translate-x-1 transition ml-2 shrink-0" />
        </button>

      </div>

    </div>
  );
};
