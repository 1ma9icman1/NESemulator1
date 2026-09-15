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
  const { sessionId, playerId } = useParams();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;
    socket.emit('join-session', { sessionId, playerId: parseInt(playerId || '1') });
    socket.on('connected', () => setIsConnected(true));
    return () => { socket.off('connected'); };
  }, [socket, sessionId, playerId]);

  const sendInput = (button: number, type: 'down' | 'up') => {
    socket?.emit('controller-input', { sessionId, playerId: parseInt(playerId || '1'), button, type });
  };

  const sendExit = () => {
    socket?.emit('controller-exit', { sessionId, playerId: parseInt(playerId || '1') });
  };

  if (!socket) {
    return <div className="text-white">Connecting...</div>;
  }

  return (
    <div className="w-screen h-screen bg-stone-900 flex flex-col items-center justify-center">
      <h2 className="text-white mb-4">Controller P{playerId}</h2>
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
  const appContainerRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<any>(null);
  const gameSelectorRef = useRef<any>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const inputHandler = (data: any) => {
        // Always pass input to emulator IF a game is loaded.
        // If not loaded, pass to game selector.
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
    return () => { 
        socket.off('game-input', inputHandler); 
        socket.off('game-exit', exitHandler);
    };
  }, [socket, romData]);

  const triggerFullScreen = () => {
    const canvas = emulatorRef.current?.getCanvas();
    if (canvas && !isFullScreen) {
      canvas.requestFullscreen().then(() => {
        setIsFullScreen(true);
      }).catch(console.error);
    }
  };

  return (
    <div ref={appContainerRef} className={`w-screen h-screen flex flex-col items-center justify-start pt-44 text-white bg-transparent ${isFullScreen ? '!p-0' : 'p-4'} gap-6`}>
      <div className={`flex flex-col items-center justify-center text-center ${isFullScreen ? 'w-screen h-screen !p-0' : ''}`}>
        <h1 className="text-4xl font-bold tracking-tight text-transparent">NES EMULATOR</h1>
        
        <div className={`${isFullScreen ? 'w-full h-full' : 'w-full max-w-5xl'}`} onClick={triggerFullScreen}>
          <Emulator ref={emulatorRef} romData={romData} onStart={triggerFullScreen} />
        </div>
      </div>

      {!isFullScreen && (
        <div className="flex flex-col items-center gap-4 bg-black/70 p-4 rounded-lg border-2 border-amber-500 backdrop-blur-sm shadow-xl mt-16">
          <DriveGameSelector ref={gameSelectorRef} onGameSelected={setRomData} />

          <div className="flex gap-8 justify-center">
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/1`} size={100} />
              <div className={`flex items-center gap-2 text-sm ${player1Connected ? 'text-green-400' : 'text-gray-400'}`}>
                <Gamepad2 size={16} /> P1: {player1Connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <QRCodeSVG value={`${window.location.origin}/controller/${sessionId}/2`} size={100} />
              <div className={`flex items-center gap-2 text-sm ${player2Connected ? 'text-green-400' : 'text-gray-400'}`}>
                <Gamepad2 size={16} /> P2: {player2Connected ? 'CONNECTED' : 'DISCONNECTED'}
              </div>
            </div>
          </div>
        </div>
      )}
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

