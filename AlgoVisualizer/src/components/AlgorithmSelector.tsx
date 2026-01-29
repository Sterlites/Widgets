import { Algorithm } from '../types';
import { algorithmInfo } from '../algorithms';
import { cn } from '../utils/cn';

interface AlgorithmSelectorProps {
  selected: Algorithm;
  onSelect: (algorithm: Algorithm) => void;
}

export function AlgorithmSelector({ selected, onSelect }: AlgorithmSelectorProps) {
  const algorithms: Algorithm[] = ['bubble', 'quick', 'merge'];

  return (
    <div className="flex gap-2">
      {algorithms.map((algo) => (
        <button
          key={algo}
          onClick={() => onSelect(algo)}
          className={cn(
            'px-4 py-2 rounded-xl font-medium transition-all',
            selected === algo
              ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25'
              : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-white'
          )}
        >
          {algorithmInfo[algo].name}
        </button>
      ))}
    </div>
  );
}
