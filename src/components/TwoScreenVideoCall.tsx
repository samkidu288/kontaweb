import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Camera, CameraOff, Mic, MicOff, PhoneOff,
  Smartphone, RefreshCw, Sparkles, ArrowLeft,
  ArrowUpDown
} from 'lucide-react';

interface VideoCallProps {
  role: 'left' | 'right';
  onExit: () => void;
  onStatusChange?: (status: string, connected: boolean) => void;
}

export const TwoScreenVideoCall: React.FC<VideoCallProps> = ({ role, onExit, onStatusChange }) => {
  const [, setLeftOnline] = useState(false);
  const [, setRightOnline] = useState(false);
  const [isP2PConnected, setIsP2PConnected] = useState(false);
  const [callStatus, setCallStatus] = useState<string>('Menghubungkan...');

  // Media Controls
  const [hasMedia, setHasMedia] = useState(false);
  const [isSimulatedStream, setIsSimulatedStream] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Swap view state (apakah video lokal di Main atau di PiP)
  const [isSwappedView, setIsSwappedView] = useState(false);

  // Video Refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // WebRTC & Socket Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const updateCallState = (status: string, connected: boolean) => {
    setCallStatus(status);
    if (onStatusChange) {
      onStatusChange(status, connected);
    }
  };

  // Konfigurasi STUN Server untuk koneksi P2P lintas jaringan
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  };

  // Inisialisasi Akses Kamera & Mikrofon dengan Preferensi Portrait 9:16
  const initMedia = async (forceVirtual = false, targetFacing = facingMode) => {
    stopCurrentStream();

    if (!forceVirtual) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: targetFacing,
            width: { ideal: 720 }, 
            height: { ideal: 1280 },
            aspectRatio: { ideal: 9 / 16 }
          },
          audio: true
        });

        localStreamRef.current = stream;
        assignLocalStream(stream);
        setHasMedia(true);
        setIsSimulatedStream(false);
        setIsCamOff(false);
        setIsMicMuted(false);
        return stream;
      } catch (err) {
        console.warn('Gagal akses kamera fisik, beralih ke simulasi visual portrait:', err);
      }
    }

    return startVirtualStream();
  };

  const assignLocalStream = (stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  };

  const assignRemoteStream = (stream: MediaStream) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
  };

  // Fallback virtual feed portrait (360x640)
  const startVirtualStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    canvasRef.current = canvas;

    let frame = 0;
    const draw = () => {
      if (!ctx) return;
      frame++;
      
      const grad = ctx.createLinearGradient(0, 0, 360, 640);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 360, 640);

      // Pulsing Circle
      ctx.beginPath();
      const radius = 45 + Math.sin(frame * 0.06) * 10;
      ctx.arc(180, 260, radius, 0, Math.PI * 2);
      ctx.strokeStyle = role === 'left' ? '#38bdf8' : '#34d399';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Avatar
      ctx.beginPath();
      ctx.arc(180, 250, 30, 0, Math.PI * 2);
      ctx.fillStyle = role === 'left' ? '#38bdf8' : '#34d399';
      ctx.fill();

      // Text
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(role === 'left' ? 'Peserta 1' : 'Peserta 2', 180, 340);
      
      ctx.font = '12px monospace';
      ctx.fillStyle = '#94a3b8';
      const timeStr = new Date().toTimeString().split(' ')[0];
      ctx.fillText(`${timeStr} • Live 9:16`, 180, 370);

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    const canvasStream = canvas.captureStream(30);

    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      const dest = audioCtx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();

      dest.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    } catch {
      // Audio fallback
    }

    localStreamRef.current = canvasStream;
    assignLocalStream(canvasStream);
    setHasMedia(true);
    setIsSimulatedStream(true);
    return canvasStream;
  };

  const stopCurrentStream = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setHasMedia(false);
  };

  // Setup WebRTC Peer Connection
  const setupPeerConnection = (socket: Socket): RTCPeerConnection => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current);
        }
      });
    }

    pc.ontrack = (event) => {
      console.log('[WebRTC] Menerima remote track:', event.track.kind);
      if (event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        assignRemoteStream(event.streams[0]);
        setIsP2PConnected(true);
        updateCallState('Terhubung', true);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsP2PConnected(true);
        updateCallState('Terhubung', true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsP2PConnected(false);
        updateCallState('Terputus', false);
      }
    };

    return pc;
  };

  // Hubungkan ke Socket.io signaling
  const connectSignaling = (roleToRegister: 'left' | 'right') => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Socket] Terhubung sebagai ${roleToRegister === 'left' ? 'Peserta 1' : 'Peserta 2'}`);
      socket.emit('register-peer', { role: roleToRegister });
      updateCallState(roleToRegister === 'left' ? 'Menunggu Peserta 2...' : 'Menunggu Peserta 1...', false);
    });

    socket.on('peer-status', ({ leftOnline: lOnline, rightOnline: rOnline, bothOnline }: { leftOnline: boolean; rightOnline: boolean; bothOnline: boolean }) => {
      setLeftOnline(lOnline);
      setRightOnline(rOnline);

      if (bothOnline) {
        updateCallState('Menghubungkan Video...', false);
      } else if (roleToRegister === 'left' && !rOnline) {
        updateCallState('Menunggu Peserta 2 masuk...', false);
      } else if (roleToRegister === 'right' && !lOnline) {
        updateCallState('Menunggu Peserta 1 masuk...', false);
      }
    });

    // Pihak 'left' diinstruksikan server untuk membuat offer
    socket.on('start-handshake', async () => {
      console.log('[WebRTC] Memulai handshake...');
      updateCallState('Menghubungkan sinyal...', false);

      const pc = setupPeerConnection(socket);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer });
      } catch (err) {
        console.error('[WebRTC] Gagal createOffer:', err);
      }
    });

    // Menerima Offer (Pihak Right / Receiver)
    socket.on('offer', async (data: { offer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Menerima offer...');
      updateCallState('Menerima panggilan...', false);

      const pc = setupPeerConnection(socket);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { answer });
      } catch (err) {
        console.error('[WebRTC] Gagal createAnswer:', err);
      }
    });

    // Menerima Answer
    socket.on('answer', async (data: { answer: RTCSessionDescriptionInit }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
          console.error('[WebRTC] Gagal setRemoteDescription answer:', err);
        }
      }
    });

    // Menerima ICE Candidate
    socket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('[WebRTC] Gagal addIceCandidate:', err);
        }
      }
    });

    // Lawan bicara keluar
    socket.on('peer-disconnected', () => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      remoteStreamRef.current = null;
      setIsP2PConnected(false);
      updateCallState('Lawan bicara keluar', false);
    });
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !isMicMuted;
        audioTracks.forEach(t => (t.enabled = !nextState));
        setIsMicMuted(nextState);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !isCamOff;
        videoTracks.forEach(t => (t.enabled = !nextState));
        setIsCamOff(nextState);
      }
    }
  };

  // Balik kamera depan / belakang (HP)
  const switchCameraFacing = async () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    const newStream = await initMedia(false, nextFacing);
    
    if (newStream && peerConnectionRef.current) {
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && newVideoTrack) {
        sender.replaceTrack(newVideoTrack);
      }
    }
  };

  const handleExitCall = () => {
    stopCurrentStream();
    if (socketRef.current) {
      socketRef.current.emit('leave-call');
      socketRef.current.disconnect();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    onExit();
  };

  // Re-attach streams saat swapping view
  useEffect(() => {
    if (isSwappedView) {
      // Main = Local, PiP = Remote
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    } else {
      // Main = Remote, PiP = Local
      if (remoteVideoRef.current && remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [isSwappedView]);

  useEffect(() => {
    initMedia(false).then(() => {
      connectSignaling(role);
    });

    return () => {
      stopCurrentStream();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [role]);

  const otherRoleName = role === 'left' ? 'Peserta 2' : 'Peserta 1';
  const currentRoleName = role === 'left' ? 'Peserta 1' : 'Peserta 2';

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[calc(100dvh-75px)] py-1">
      
      {/* KONTINER UTAMA RASIO PORTRAIT 9:16 (Seperti Layar Smartphone) */}
      <div className="relative w-full max-w-[400px] aspect-[9/16] max-h-[88vh] bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col justify-between select-none">
        
        {/* ========================================================= */}
        {/* 1. LAYAR UTAMA (Background Full Portrait 9:16)            */}
        {/* Menampilkan Lawan Bicara (Remote Video)                   */}
        {/* ========================================================= */}
        <div className="absolute inset-0 z-0 bg-slate-950 flex items-center justify-center overflow-hidden">
          {!isSwappedView ? (
            // Default: Layar Utama = Lawan Bicara
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              
              {!isP2PConnected && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl">
                    <Smartphone className="w-8 h-8 text-emerald-400 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-100">
                      Menunggu {otherRoleName}
                    </h3>
                    <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                      Menunggu lawan bicara masuk dan terhubung...
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            // Jika Swapped: Layar Utama = Kamera Lokal Anda
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
              {(!hasMedia || isCamOff) && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <CameraOff className="w-10 h-10 text-slate-600" />
                  <p className="text-xs font-medium">Kamera Anda Dimatikan</p>
                </div>
              )}
            </>
          )}

          {/* Label Nama Peserta di Layar Utama */}
          <div className="absolute top-14 left-4 z-10">
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-slate-200 border border-white/10">
              <span className={`w-2 h-2 rounded-full ${isP2PConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{!isSwappedView ? otherRoleName : `${currentRoleName} (Anda)`}</span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 2. KAMERA LOKAL PiP (Floating Overlay di Kanan Bawah)       */}
        {/* ========================================================= */}
        <div 
          onClick={() => setIsSwappedView(!isSwappedView)}
          className="absolute bottom-22 right-4 z-20 w-28 sm:w-32 aspect-[9/16] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700/80 cursor-pointer transition transform hover:scale-105 active:scale-95 group"
          title="Klik untuk menukar tampilan layar"
        >
          {isSwappedView ? (
            // Jika Swapped: PiP = Lawan Bicara
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            // Default: PiP = Kamera Lokal Anda Sendiri
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
              {(!hasMedia || isCamOff) && (
                <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-500">
                  <CameraOff className="w-6 h-6" />
                </div>
              )}
            </>
          )}

          {/* Badge & Swap Icon di PiP */}
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-md text-[9px] text-white">
            <span className="font-semibold truncate">
              {isSwappedView ? otherRoleName : 'Anda'}
            </span>
            <ArrowUpDown className="w-3 h-3 text-sky-400 opacity-70 group-hover:opacity-100" />
          </div>

          {isMicMuted && (
            <div className="absolute top-1.5 right-1.5 bg-rose-500 text-white p-1 rounded-full shadow">
              <MicOff className="w-2.5 h-2.5" />
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* 3. TOP BAR OVERLAY                                        */}
        {/* ========================================================= */}
        <div className="relative z-30 p-3.5 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <button
            onClick={handleExitCall}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 backdrop-blur-md transition cursor-pointer flex items-center gap-1 text-xs font-semibold"
            title="Keluar ke Menu Utama"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="text-[11px]">Menu</span>
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 backdrop-blur-md text-[11px] text-slate-300">
            <span className={`w-2 h-2 rounded-full ${isP2PConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-medium truncate max-w-[140px]">{callStatus}</span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* 4. BOTTOM FLOATING CONTROLS                               */}
        {/* ========================================================= */}
        <div className="relative z-30 p-3.5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-center">
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl px-4 py-2 rounded-full shadow-2xl">
            
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer border ${
                isMicMuted
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
              title={isMicMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon'}
            >
              {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Cam Toggle */}
            <button
              onClick={toggleCam}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer border ${
                isCamOff
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
              title={isCamOff ? 'Nyalakan Kamera' : 'Matikan Kamera'}
            >
              {isCamOff ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </button>

            {/* Balik Kamera Depan / Belakang (HP) */}
            <button
              onClick={switchCameraFacing}
              className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 flex items-center justify-center transition cursor-pointer"
              title="Balik Kamera Depan / Belakang"
            >
              <RefreshCw className="w-4 h-4 text-sky-400" />
            </button>

            {/* Virtual Test Feed Fallback */}
            <button
              onClick={() => initMedia(!isSimulatedStream)}
              className="w-10 h-10 rounded-full bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 flex items-center justify-center transition cursor-pointer"
              title={isSimulatedStream ? 'Beralih ke Kamera Fisik' : 'Beralih ke Virtual Feed'}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
            </button>

            {/* End Call Button */}
            <button
              onClick={handleExitCall}
              className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition cursor-pointer shadow-lg shadow-rose-600/40 active:scale-95"
              title="Akhiri Panggilan"
            >
              <PhoneOff className="w-4 h-4" />
            </button>

          </div>
        </div>

      </div>

    </div>
  );
};