import { useRef } from 'react';

export const ROMUploader = ({ onFileLoaded }: { onFileLoaded: (data: Uint8Array) => void }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        onFileLoaded(data);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  return (
    <div className="p-4 bg-white/10 rounded-lg backdrop-blur-sm border border-white/20">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".nes" className="hidden" />
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
      >
        Load ROM
      </button>
    </div>
  );
};
