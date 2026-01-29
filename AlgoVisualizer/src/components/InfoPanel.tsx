import { Algorithm } from '../types';
import { algorithmInfo } from '../algorithms';

interface InfoPanelProps {
  algorithm: Algorithm;
  currentDescription: string;
}

export function InfoPanel({ algorithm, currentDescription }: InfoPanelProps) {
  const info = algorithmInfo[algorithm];

  return (
    <div className="space-y-4">
      {/* Current Step Description */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-400 mb-2">Current Step</h3>
        <p className="text-white font-medium">{currentDescription}</p>
      </div>

      {/* Algorithm Info */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-lg font-bold text-white mb-3">{info.name}</h3>
        <p className="text-slate-300 text-sm mb-4">{info.description}</p>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Time Complexity</p>
            <p className="text-indigo-400 font-mono font-bold">{info.timeComplexity}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Space Complexity</p>
            <p className="text-purple-400 font-mono font-bold">{info.spaceComplexity}</p>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Legend</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-indigo-500" />
            <span className="text-sm text-slate-300">Default</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-400" />
            <span className="text-sm text-slate-300">Comparing</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-sm text-slate-300">Swapping</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500" />
            <span className="text-sm text-slate-300">Sorted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-purple-500" />
            <span className="text-sm text-slate-300">Pivot</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-400" />
            <span className="text-sm text-slate-300">Selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
