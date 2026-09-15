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
  const [code, setCode] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('code-verified', (data) => {
        setSessionId(data.sessionId);
    });
    socket.on('code-error', (data) => {
        setError(data.message);
    });
    socket.on('connected', () => setIsConnected(true));
    return () => { 
        socket.off('code-verified');
        socket.off('code-error');
        socket.off('connected');
    };
  }, [socket]);

  useEffect(() => {
      if (sessionId && playerId) {
        socket?.emit('join-session', { sessionId, playerId: parseInt(playerId || '1') });
      }
  }, [sessionId, playerId, socket]);

  const joinByCode = () => {
      socket?.emit('join-by-code', { code, playerId: 1 }); // Default to P1, logic to pick P1/P2 can be added
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
  const [p1Code, setP1Code] = useState('');
  const [p2Code, setP2Code] = useState('');
  const [connectionCode] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());

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
    <div className="relative w-screen h-screen overflow-hidden flex flex-col items-center justify-start pt-32 gap-20">
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
        className="bg-black/80 p-4 rounded-xl border border-amber-600 backdrop-blur-md shadow-2xl flex flex-col items-center gap-3"
        style={{
            width: '360px',
            height: '357.486px',
        }}
      >
        <DriveGameSelector ref={gameSelectorRef} onGameSelected={setRomData} />

        <div className="flex gap-4 justify-center w-full items-center">
            {/* P1 */}
            <div key={1} className="flex flex-col items-center gap-2 w-full">
                <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/1`} size={75} />
                <div className="flex flex-col gap-1 w-full">
                    <input 
                        type="text" 
                        placeholder="Code"
                        value={p1Code}
                        onChange={(e) => setP1Code(e.target.value)}
                        className="p-1 rounded text-black text-xs text-center w-full"
                    />
                    <button 
                        className="bg-amber-600 text-white text-[10px] py-0.5 rounded w-full hover:bg-amber-700 transition"
                        onClick={() => socket?.emit('join-by-code', { code: p1Code, playerId: 1 })}
                    >
                        Connect
                    </button>
                </div>
                <div className={`flex items-center gap-1 text-[9px] ${player1Connected ? 'text-green-400' : 'text-gray-400'}`}>
                    <Gamepad2 size={10} /> P1: {player1Connected ? 'CONNECTED' : 'DISCONNECTED'}
                </div>
            </div>

            {/* Central Connection Code */}
            <div className="flex flex-col items-center text-[10px] text-white text-center whitespace-nowrap px-2">
                <div>Connect with:</div>
                <div className="font-bold text-base text-amber-500">{connectionCode}</div>
            </div>

            {/* P2 */}
            <div key={2} className="flex flex-col items-center gap-2 w-full">
                <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/2`} size={75} />
                <div className="flex flex-col gap-1 w-full">
                    <input 
                        type="text" 
                        placeholder="Code"
                        value={p2Code}
                        onChange={(e) => setP2Code(e.target.value)}
                        className="p-1 rounded text-black text-xs text-center w-full"
                    />
                    <button 
                        className="bg-amber-600 text-white text-[10px] py-0.5 rounded w-full hover:bg-amber-700 transition"
                        onClick={() => socket?.emit('join-by-code', { code: p2Code, playerId: 2 })}
                    >
                        Connect
                    </button>
                </div>
                <div className={`flex items-center gap-1 text-[9px] ${player2Connected ? 'text-green-400' : 'text-gray-400'}`}>
                    <Gamepad2 size={10} /> P2: {player2Connected ? 'CONNECTED' : 'DISCONNECTED'}
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

