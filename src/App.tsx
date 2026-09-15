/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { io, Socket } from 'socket.io-client';
import { DriveGameSelector } from './components/DriveGameSelector';
import { Emulator } from './components/Emulator';
import { ControllerOverlay } from './components/ControllerOverlay';

const ControllerView = ({ socket }: { socket: Socket | null }) => {
  const { sessionId: urlSessionId, playerId: urlPlayerId } = useParams();
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(urlSessionId || null);
  const [playerId, setPlayerId] = useState<string | null>(urlPlayerId || null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('code-verified', (data) => {
        console.log("Code verified, session:", data.sessionId);
        setSessionId(data.sessionId);
        setPlayerId('1');
        // Explicitly trigger join here to ensure connection
        socket.emit('join-session', { sessionId: data.sessionId, playerId: 1 });
    });
    socket.on('code-error', (data) => {
        console.log("Code error:", data.message);
        setError(data.message);
    });
    socket.on('connected', () => {
        console.log("Connected to game session");
        setIsConnected(true)
    });
    return () => { 
        socket.off('code-verified');
        socket.off('code-error');
        socket.off('connected');
    };
  }, [socket]);

  useEffect(() => {
      if (sessionId && playerId) {
        console.log("Attempting join-session", sessionId, playerId);
        socket?.emit('join-session', { sessionId, playerId: parseInt(playerId || '1') });
      }
  }, [sessionId, playerId, socket]);

  const joinByCode = () => {
      console.log("joinByCode clicked. Code:", code, "Socket:", !!socket, "Connected:", socket?.connected);
      if (!socket) {
          console.error("Socket not connected");
          return;
      }
      setPlayerId('1'); // Default to P1
      console.log("Emitting join-by-code", { code, playerId: 1 });
      socket.emit('join-by-code', { code, playerId: 1 });
  };

  const sendInput = (button: number, type: 'down' | 'up') => {
    if (!sessionId) return;
    socket?.emit('controller-input', { sessionId, playerId: parseInt(playerId || '1'), button, type });
  };

  const sendExit = () => {
    if (!sessionId) return;
    socket?.emit('controller-exit', { sessionId, playerId: parseInt(playerId || '1') });
  };

  if (!socket) {
    return <div className="text-white">Connecting...</div>;
  }

  if (!sessionId) {
      return (
          <div className="w-screen h-screen bg-stone-900 flex flex-col items-center justify-center p-4">
              <h2 className="text-white mb-4">Enter Connection Code</h2>
              <input 
                  type="text" 
                  value={code} 
                  onChange={(e) => setCode(e.target.value)}
                  className="p-2 rounded mb-4 w-48 text-center text-black"
                  placeholder="0000"
              />
              <button onClick={joinByCode} className="bg-amber-600 text-white p-2 rounded">Connect</button>
              {error && <div className="text-red-500 mt-2">{error}</div>}
              <div className="mt-4 text-white">Or scan QR on TV</div>
          </div>
      )
  }

  return (
    <div className="w-screen h-screen bg-stone-900 flex flex-col items-center justify-center">
      <h2 className="text-white mb-4">Controller P1</h2>
      {isConnected && <div className="text-green-500 mb-2 font-bold">CONNECTED</div>}
      <ControllerOverlay 
        onButtonDown={(btn) => sendInput(btn, 'down')}
        onButtonUp={(btn) => sendInput(btn, 'up')}
        onExit={sendExit}
      />
    </div>
  );
};

const EmulatorView = ({ socket, sessionId, player1Connected, player2Connected, romData, setRomData }: any) => {
  const emulatorRef = useRef<any>(null);
  const gameSelectorRef = useRef<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [connectionCode] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
  const [scale, setScale] = useState(1);

  const handleConnect = (playerId: number) => {
    const code = window.prompt(`Enter connection code for Player ${playerId}:`);
    if (code) {
        socket?.emit('join-by-code', { code, playerId });
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setScale(Math.min(window.innerWidth / 400, 1));
      } else {
        setScale(1);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!socket) return;
    const inputHandler = (data: any) => {
        if (romData) {
            if (data.type === 'down') {
                emulatorRef.current?.buttonDown(data.playerId, data.button);
            } else {
                emulatorRef.current?.buttonUp(data.playerId, data.button);
            }
        } else {
            gameSelectorRef.current?.handleInput(data.button, data.type);
        }
    };
    
    const exitHandler = () => {
        setRomData(null);
        setIsFullScreen(false);
        document.exitFullscreen?.().catch(console.error);
    };

    socket.on('game-input', inputHandler);
    socket.on('game-exit', exitHandler);
    console.log("Registering code:", connectionCode, "session:", sessionId);
    socket.emit('register-code', { code: connectionCode, sessionId });
    return () => { 
        socket.off('game-input', inputHandler); 
        socket.off('game-exit', exitHandler);
    };
  }, [socket, romData, connectionCode, sessionId]);

  const triggerFullScreen = () => {
    const canvas = emulatorRef.current?.getCanvas();
    if (canvas && !isFullScreen) {
      canvas.requestFullscreen().then(() => {
        setIsFullScreen(true);
      }).catch(console.error);
    }
  };

  if (isFullScreen) {
      return (
          <div className="w-screen h-screen bg-black flex items-center justify-center">
              <Emulator ref={emulatorRef} romData={romData} onStart={triggerFullScreen} />
          </div>
      );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-start pt-10 sm:pt-32 gap-6 sm:gap-20" style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
      <img 
        src="/assets/background.png" 
        alt="Room background" 
        className="absolute inset-0 w-[1027px] h-[1007px] object-cover -z-10" 
      />

      {/* Emulator container */}
      <div 
        className="cursor-pointer"
        style={{ 
            width: '32vw',
            height: '35vh' 
        }}
        onClick={triggerFullScreen}
      >
        <Emulator ref={emulatorRef} romData={romData} onStart={triggerFullScreen} />
      </div>

      {/* UI Overlay */}
      <div 
        className="bg-black/80 p-2 sm:p-4 rounded-xl border border-amber-600 backdrop-blur-md shadow-2xl flex flex-col items-center gap-2 sm:gap-3"
        style={{
            width: '340px',
        }}
      >
        <DriveGameSelector ref={gameSelectorRef} onGameSelected={setRomData} />

        <div className="flex gap-2 sm:gap-4 justify-center w-full items-center">
            {/* P1 */}
            <div key={1} className="flex flex-col items-center gap-1 sm:gap-2 w-full">
                <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/1`} size={50} />
                <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
                    <button 
                        className="bg-amber-600 text-white text-[9px] py-1 rounded w-full hover:bg-amber-700 transition"
                        onClick={() => handleConnect(1)}
                    >
                        Connect
                    </button>
                </div>
                <div className={`flex items-center gap-0.5 text-[8px] ${player1Connected ? 'text-green-400' : 'text-gray-400'}`}>
                    <Gamepad2 size={8} /> P1: {player1Connected ? 'CONNECTED' : 'DISCONNECTED'}
                </div>
            </div>

            {/* Central Connection Code */}
            <div className="flex flex-col items-center text-[9px] text-white text-center whitespace-nowrap px-1">
                <div>Connect with:</div>
                <div className="font-bold text-sm text-amber-500">{connectionCode}</div>
            </div>

            {/* P2 */}
            <div key={2} className="flex flex-col items-center gap-1 sm:gap-2 w-full">
                <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/2`} size={50} />
                <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
                    <button 
                        className="bg-amber-600 text-white text-[9px] py-1 rounded w-full hover:bg-amber-700 transition"
                        onClick={() => handleConnect(2)}
                    >
                        Connect
                    </button>
                </div>
                <div className={`flex items-center gap-0.5 text-[8px] ${player2Connected ? 'text-green-400' : 'text-gray-400'}`}>
                    <Gamepad2 size={8} /> P2: {player2Connected ? 'CONNECTED' : 'DISCONNECTED'}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [romData, setRomData] = useState<Uint8Array | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [player1Connected, setPlayer1Connected] = useState(false);
  const [player2Connected, setPlayer2Connected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const s = io();
    s.on('connect', () => {
      s.emit('join-session', { sessionId, playerId: 0 }); // Join as viewer initially
    });
    s.on('player-connected', (playerId) => {
        if (playerId === 1) setPlayer1Connected(true);
        if (playerId === 2) setPlayer2Connected(true);
    });
    setSocket(s);
    return () => { s.disconnect(); };
  }, [sessionId]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/controller/:sessionId/:playerId" element={<ControllerView socket={socket} />} />
        <Route path="/" element={<EmulatorView 
          socket={socket} 
          sessionId={sessionId}
          player1Connected={player1Connected}
          player2Connected={player2Connected}
          romData={romData}
          setRomData={setRomData}
        />} />
      </Routes>
    </BrowserRouter>
  );
}

