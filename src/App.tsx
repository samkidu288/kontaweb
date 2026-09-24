import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { HomePage } from './components/HomePage';
import { TwoScreenVideoCall } from './components/TwoScreenVideoCall';

export default function App() {
  const [role, setRole] = useState<'left' | 'right' | null>(null);
  const [callStatus, setCallStatus] = useState<string>('Siap');
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Periksa apakah URL memiliki parameter ?peer=left atau ?peer=right
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const peerParam = params.get('peer');
    if (peerParam === 'left') {
      setRole('left');
    } else if (peerParam === 'right') {
      setRole('right');
    }
  }, []);

  const handleSelectRole = (selectedRole: 'left' | 'right') => {
    setRole(selectedRole);
    // Sinkronkan ke URL tanpa refresh
    const newUrl = `${window.location.pathname}?peer=${selectedRole}`;
    window.history.pushState(null, '', newUrl);
  };

  const handleExitCall = () => {
    setRole(null);
    setIsConnected(false);
    setCallStatus('Siap');
    // Bersihkan URL query param
    window.history.pushState(null, '', window.location.pathname);
  };

  const handleStatusChange = (status: string, connected: boolean) => {
    setCallStatus(status);
    setIsConnected(connected);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Header dengan Judul "Web Video Call" Ringkas 1 Baris */}
      <Header 
        statusText={callStatus} 
        isConnected={isConnected} 
        isInCall={!!role}
        role={role}
        onExitCall={handleExitCall}
      />

      {/* Main Content Area: Diposisikan lebih naik saat video call aktif */}
      <main className={`flex-1 w-full mx-auto flex flex-col ${
        role ? 'p-1 sm:p-2 max-w-lg justify-start items-center' : 'px-4 py-6 max-w-sm justify-center'
      }`}>
        {!role ? (
          /* 1. HOMEPAGE: Judul Web Video Call + Tombol Peserta 1 & Peserta 2 */
          <HomePage onSelectRole={handleSelectRole} />
        ) : (
          /* 2. LAYAR VIDEO CALL PORTRAIT 9:16 + PiP KAMERA LOKAL */
          <TwoScreenVideoCall 
            role={role}
            onExit={handleExitCall}
            onStatusChange={handleStatusChange} 
          />
        )}
      </main>

      {/* Footer minimalis (disembunyikan saat call agar layar video maksimal) */}
      {!role && (
        <footer className="border-t border-slate-900 bg-slate-950/80 py-3 text-center text-xs text-slate-500">
          <span>Web Video Call</span>
        </footer>
      )}
    </div>
  );
}
