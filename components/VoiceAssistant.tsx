
import React from 'react';
import { MicOff } from 'lucide-react';

const VoiceAssistant: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto flex flex-col items-center justify-center space-y-8 min-h-[60vh]">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900">Sales Co-Pilot</h2>
        <p className="text-slate-500">Real-time voice consultation is currently under maintenance.</p>
      </div>

      <div className="p-12 bg-slate-100 rounded-full text-slate-300">
        <MicOff size={64} />
      </div>

      <div className="p-4 bg-amber-50 text-amber-600 rounded-lg border border-amber-100 max-w-md text-center text-sm">
        <p className="font-bold">Module Upgrade In Progress</p>
        <p>We are upgrading our voice infrastructure to the latest stable Gemini 1.5 standards. This feature will return shortly.</p>
      </div>
    </div>
  );
};

export default VoiceAssistant;