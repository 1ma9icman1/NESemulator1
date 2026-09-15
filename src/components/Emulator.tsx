import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { NES } from 'jsnes';
import { Volume2, VolumeX } from 'lucide-react';

export const Emulator = forwardRef(({ romData, onStart }: { romData: Uint8Array | null, onStart?: () => void }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nesRef = useRef<NES | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useImperativeHandle(ref, () => ({
    buttonDown: (controller: number, button: number) => nesRef.current?.buttonDown(controller, button),
    buttonUp: (controller: number, button: number) => nesRef.current?.buttonUp(controller, button),
    getCanvas: () => canvasRef.current,
  }));

  useEffect(() => {
    if (!romData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const scriptNode = audioCtx.createScriptProcessor(1024, 0, 2);
    scriptNode.connect(audioCtx.destination);
    
    const buffer: number[] = [];
    scriptNode.onaudioprocess = (e) => {
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      for (let i = 0; i < outputL.length; i++) {
        if (buffer.length > 0 && !isMuted) {
            const sample = buffer.shift()!;
            outputL[i] = sample;
            outputR[i] = sample;
        } else {
            outputL[i] = 0;
            outputR[i] = 0;
        }
      }
    };

    const nes = new NES({
      onFrame: (buffer: Uint32Array) => {
        const imageData = ctx.createImageData(256, 240);
        for (let i = 0; i < buffer.length; i++) {
          imageData.data[i * 4] = (buffer[i] >> 16) & 0xFF;
          imageData.data[i * 4 + 1] = (buffer[i] >> 8) & 0xFF;
          imageData.data[i * 4 + 2] = buffer[i] & 0xFF;
          imageData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
      },
      onStatusUpdate: () => {},
      onAudioSample: (left: number, right: number) => {
          buffer.push((left + right) / 2);
      },
      sampleRate: audioCtx.sampleRate,
    });

    nes.loadROM(romData);
    nesRef.current = nes;

    const interval = setInterval(() => {
      nes.frame();
    }, 1000 / 60);

    return () => {
      clearInterval(interval);
      nesRef.current = null;
      scriptNode.disconnect();
      audioCtx.close();
      audioCtxRef.current = null;
    };
  }, [romData, isMuted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!nesRef.current) return;
      const controller = 1;
      switch (e.key) {
        case 'ArrowUp': nesRef.current.buttonDown(controller, NES.Buttons.UP); break;
        case 'ArrowDown': nesRef.current.buttonDown(controller, NES.Buttons.DOWN); break;
        case 'ArrowLeft': nesRef.current.buttonDown(controller, NES.Buttons.LEFT); break;
        case 'ArrowRight': nesRef.current.buttonDown(controller, NES.Buttons.RIGHT); break;
        case 'z': nesRef.current.buttonDown(controller, 0); break; // A
        case 'x': nesRef.current.buttonDown(controller, 1); break; // B
        case 'Enter': 
          nesRef.current.buttonDown(controller, 3); // START
          onStart?.();
          break;
        case 'Shift': nesRef.current.buttonDown(controller, 2); break; // SELECT
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!nesRef.current) return;
      const controller = 1;
      switch (e.key) {
        case 'ArrowUp': nesRef.current.buttonUp(controller, NES.Buttons.UP); break;
        case 'ArrowDown': nesRef.current.buttonUp(controller, NES.Buttons.DOWN); break;
        case 'ArrowLeft': nesRef.current.buttonUp(controller, NES.Buttons.LEFT); break;
        case 'ArrowRight': nesRef.current.buttonUp(controller, NES.Buttons.RIGHT); break;
        case 'z': nesRef.current.buttonUp(controller, 0); break; // A
        case 'x': nesRef.current.buttonUp(controller, 1); break; // B
        case 'Enter': nesRef.current.buttonUp(controller, 3); break; // START
        case 'Shift': nesRef.current.buttonUp(controller, 2); break; // SELECT
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onStart]);

  return (
    <div className="relative">
        <canvas ref={canvasRef} width="256" height="240" className="w-full h-auto aspect-[256/240] bg-black border-4 border-white/10" />
        <button 
            onClick={() => setIsMuted(!isMuted)}
            className="absolute top-2 left-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
        >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
    </div>
  );
});
