interface ArrayControlsProps {
  arraySize: number;
  onArraySizeChange: (size: number) => void;
  onGenerateRandom: () => void;
  onGenerateReversed: () => void;
  onGenerateNearlySorted: () => void;
}

export function ArrayControls({
  arraySize,
  onArraySizeChange,
  onGenerateRandom,
  onGenerateReversed,
  onGenerateNearlySorted,
}: ArrayControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-slate-400">Size:</label>
        <input
          type="range"
          min="5"
          max="30"
          value={arraySize}
          onChange={(e) => onArraySizeChange(Number(e.target.value))}
          className="w-32 accent-indigo-500"
        />
        <span className="text-sm text-white font-medium w-8">{arraySize}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onGenerateRandom}
          className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-sm font-medium transition-all"
        >
          Random
        </button>
        <button
          onClick={onGenerateReversed}
          className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-sm font-medium transition-all"
        >
          Reversed
        </button>
        <button
          onClick={onGenerateNearlySorted}
          className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-sm font-medium transition-all"
        >
          Nearly Sorted
        </button>
      </div>
    </div>
  );
}
