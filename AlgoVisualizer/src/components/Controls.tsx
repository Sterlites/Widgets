import { cn } from '../utils/cn';

interface ControlsProps {
  isPlaying: boolean;
  currentStep: number;
  totalSteps: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}

export function Controls({
  isPlaying,
  currentStep,
  totalSteps,
  speed,
  onPlay,
  onPause,
  onStepForward,
  onStepBackward,
  onReset,
  onSpeedChange,
}: ControlsProps) {
  const speedOptions = [0.5, 1, 2, 4];

  return (
    <div className="flex flex-col gap-4">
      {/* Progress Bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 w-16">
          {currentStep + 1} / {totalSteps}
        </span>
        <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onReset}
          className="p-3 rounded-xl bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white transition-all"
          title="Reset"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={onStepBackward}
          disabled={currentStep === 0}
          className={cn(
            'p-3 rounded-xl transition-all',
            currentStep === 0
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white'
          )}
          title="Step Backward"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white shadow-lg shadow-indigo-500/25 transition-all"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={onStepForward}
          disabled={currentStep === totalSteps - 1}
          className={cn(
            'p-3 rounded-xl transition-all',
            currentStep === totalSteps - 1
              ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
              : 'bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white'
          )}
          title="Step Forward"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="ml-4 flex items-center gap-2 bg-slate-700/50 rounded-xl px-3 py-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {speedOptions.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                'px-2 py-1 rounded-lg text-sm font-medium transition-all',
                speed === s
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
