import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  CameraOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  RotateCcw,
  ShieldCheck,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Header } from './Header';
import { AudioVisualizer } from './AudioVisualizer';

interface TwoScreenVideoCallProps {
  userRole: 'left' | 'right';
  onSwitchRole: () => void;
}

export const TwoScreenVideoCall: React.FC<TwoScreenVideoCallProps> = ({
  userRole,
  onSwitchRole
}) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isRemoteAudioMuted, setIsRemoteAudioMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Memulai sinyal...');
  const [isOtherPeerOnline, setIsOtherPeerOnline] = useState(false);
  const [isBothOnline, setIsBothOnline] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<'Baik' | 'Sedang' | 'Buruk'>('Baik');
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isWideFit, setIsWideFit] = useState(true); // Default true agar gambar kamera luas tidak terpotong

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      setIsMobileDevice(/android|ipad|iphone|ipod/i.test(userAgent.toLowerCase()));
    };
    checkMobile();
  }, []);

  const partnerRole = userRole === 'left' ? 'right' : 'left';
  const roleName = userRole === 'left' ? 'Peserta 1' : 'Peserta 2';
  const partnerRoleName = partnerRole === 'left' ? 'Peserta 1' : 'Peserta 2';

  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    if (isBothOnline && isCallActive) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isBothOnline, isCallActive]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let isMounted = true;

    const startMedia = async () => {
      try {
        setErrorMessage(null);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Paksa zoom kamera HP ke tingkat minimum (terlebar/ultrawide jika ada)
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
          try {
            const capabilities = videoTrack.getCapabilities() as { zoom?: { min: number; max: number } };
            if (capabilities.zoom && typeof capabilities.zoom.min === 'number') {
              await (videoTrack as any).applyConstraints({
                advanced: [{ zoom: capabilities.zoom.min }]
              });
            }
          } catch {
            // Abaikan jika browser tidak mengizinkan akses hardware zoom
          }
        }

        localStreamRef.current = stream;

        if (localVideoRef.current && isMounted) {
          localVideoRef.current.srcObject = stream;
        }

        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          stream.getTracks().forEach((track) => {
            const sender = senders.find((s) => s.track && s.track.kind === track.kind);
            if (sender) {
              sender.replaceTrack(track);
            } else {
              pcRef.current?.addTrack(track, stream);
            }
          });
        }
      } catch (err: any) {
        console.error('Gagal mengakses kamera/mikrofon:', err);
        if (isMounted) {
          setErrorMessage(
            err.name === 'NotAllowedError'
              ? 'Izin kamera dan mikrofon ditolak. Berikan izin di browser Anda.'
              : 'Perangkat kamera/mikrofon tidak terdeteksi atau sedang dipakai aplikasi lain.'
          );
        }
      }
    };

    startMedia();

    return () => {
      isMounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const createPeerConnection = () => {
    if (pcRef.current) {
      pcRef.current.close();
    }

    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pc) return;
      switch (pc.connectionState) {
        case 'connected':
          setConnectionStatus('Terhubung');
          setIsCallActive(true);
          setNetworkQuality('Baik');
          break;
        case 'disconnected':
        case 'failed':
          setConnectionStatus('Sambungan Terputus');
          setIsCallActive(false);
          setNetworkQuality('Buruk');
          break;
        case 'connecting':
          setConnectionStatus('Menghubungkan P2P...');
          break;
      }
    };

    return pc;
  };

  useEffect(() => {
    const socket: Socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('register-peer', { role: userRole });
    });

    socket.on('peer-status', ({ leftOnline, rightOnline, bothOnline }) => {
      const partnerOnline = userRole === 'left' ? rightOnline : leftOnline;
      setIsOtherPeerOnline(partnerOnline);
      setIsBothOnline(bothOnline);

      if (!partnerOnline) {
        setConnectionStatus(`Menunggu ${partnerRoleName} membuka link...`);
        setIsCallActive(false);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      } else if (bothOnline && !isCallActive) {
        setConnectionStatus('Mempersiapkan saluran...');
      }
    });

    socket.on('start-handshake', async () => {
      if (userRole === 'left') {
        const pc = createPeerConnection();
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);
          socket.emit('offer', { offer });
          setConnectionStatus('Mengirim panggilan...');
        } catch (e) {
          console.error('Gagal membuat offer WebRTC:', e);
        }
      }
    });

    socket.on('offer', async ({ offer }) => {
      if (userRole === 'right') {
        const pc = createPeerConnection();
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { answer });
          setConnectionStatus('Menerima panggilan...');
        } catch (e) {
          console.error('Gagal merespon offer WebRTC:', e);
        }
      }
    });

    socket.on('answer', async ({ answer }) => {
      if (userRole === 'left' && pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setConnectionStatus('Terhubung');
        } catch (e) {
          console.error('Gagal memasang remote answer WebRTC:', e);
        }
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      if (pcRef.current && candidate) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Gagal menambahkan ICE candidate:', e);
        }
      }
    });

    socket.on('peer-disconnected', () => {
      setIsOtherPeerOnline(false);
      setIsBothOnline(false);
      setIsCallActive(false);
      setConnectionStatus(`${partnerRoleName} keluar dari obrolan`);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    });

    return () => {
      socket.emit('leave-call');
      socket.disconnect();
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [userRole]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleRemoteAudio = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !isRemoteAudioMuted;
      setIsRemoteAudioMuted(!isRemoteAudioMuted);
    }
  };

  const copyPartnerLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('role', partnerRole);
    navigator.clipboard.writeText(url.toString());
    setCopyFeedback(true);
    setIsCopied(true);
    setTimeout(() => {
      setCopyFeedback(false);
      setIsCopied(false);
    }, 2500);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[calc(100vh-80px)] px-3 py-4 md:py-6">
      {errorMessage && (
        <div className="w-full max-w-md mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs text-center backdrop-blur-sm">
          {errorMessage}
        </div>
      )}

      {/* Kontainer Video Portrait Smartphone 9:16 */}
      <div className="relative w-full aspect-[9/16] max-h-[82vh] max-w-[460px] bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
        {/* Remote Video (Layar Penuh Lawan Bicara) */}
        <div className="absolute inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full transform -scale-x-100 transition-all duration-300 ${
              isWideFit ? 'object-contain' : 'object-cover'
            }`}
          />

          {/* Standby State Jika Lawan Belum Masuk */}
          {!isBothOnline && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/85 backdrop-blur-md z-10">
              <div className="w-16 h-16 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mb-4">
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-500"></span>
                </span>
              </div>
              <h3 className="text-base font-semibold text-white mb-1.5">{connectionStatus}</h3>
              <p className="text-slate-400 text-xs max-w-xs mb-6 leading-relaxed">
                Bagikan link berikut ke HP rekan Anda untuk langsung terhubung otomatis:
              </p>
              <button
                onClick={copyPartnerLink}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-medium shadow-lg shadow-sky-500/25 transition cursor-pointer active:scale-95"
              >
                {copyFeedback ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copyFeedback ? 'Link Berhasil Disalin!' : `Salin Link ${partnerRoleName}`}</span>
              </button>
            </div>
          )}

          {/* Local Video PIP (Kamera Anda di Sudut Kanan Atas) */}
          <div className="absolute top-4 right-4 w-28 h-40 sm:w-32 sm:h-44 bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700/80 z-20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full transform -scale-x-100 transition-all duration-300 ${
                isWideFit ? 'object-contain' : 'object-cover'
              }`}
            />
            {isVideoOff && (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 text-[10px]">
                <CameraOff className="w-5 h-5 mb-1" />
                <span>Kamera Mati</span>
              </div>
            )}
            <div className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-[10px] text-white font-medium">
              Anda ({roleName})
            </div>
          </div>

          {/* Top Bar Info Status & Durasi */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white text-xs">
              <span className={`w-2 h-2 rounded-full ${isBothOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="font-medium">{roleName}</span>
              {isBothOnline && <span className="font-mono text-slate-300 ml-1">| {formatDuration(callDuration)}</span>}
            </div>
          </div>
        </div>

        {/* Toolbar Kontrol Bawah */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-3 p-3 rounded-2xl bg-black/60 backdrop-blur-lg border border-white/10 shadow-xl">
          {/* Toggle Wide View (Luas / Layar Penuh) */}
          <button
            onClick={() => setIsWideFit((prev) => !prev)}
            className={`p-3 rounded-full transition cursor-pointer ${
              isWideFit
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 hover:bg-sky-500/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
            title={isWideFit ? 'Tampilan: Luas (Lensa Penuh)' : 'Tampilan: Penuh (Terpotong)'}
          >
            {isWideFit ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* Mic Toggle */}
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full transition cursor-pointer ${
              isAudioMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-slate-800/80 text-white hover:bg-slate-700'
            }`}
            title={isAudioMuted ? 'Nyalakan Mikrofon' : 'Matikan Mikrofon'}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full transition cursor-pointer ${
              isVideoOff
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-slate-800/80 text-white hover:bg-slate-700'
            }`}
            title={isVideoOff ? 'Nyalakan Kamera' : 'Matikan Kamera'}
          >
            {isVideoOff ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
          </button>

          {/* Remote Speaker Audio Toggle */}
          <button
            onClick={toggleRemoteAudio}
            className={`p-3 rounded-full transition cursor-pointer ${
              isRemoteAudioMuted
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                : 'bg-slate-800/80 text-white hover:bg-slate-700'
            }`}
            title={isRemoteAudioMuted ? 'Nyalakan Suara Partner' : 'Bisukan Suara Partner'}
          >
            {isRemoteAudioMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {/* Ganti Peran Peserta 1 / 2 */}
          <button
            onClick={onSwitchRole}
            className="p-3 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition cursor-pointer"
            title="Tukar Peran (Peserta 1 / Peserta 2)"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};