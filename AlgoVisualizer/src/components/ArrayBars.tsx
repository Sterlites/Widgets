import { ArrayBar } from '../types';
import { cn } from '../utils/cn';

interface ArrayBarsProps {
  array: ArrayBar[];
}

export function ArrayBars({ array }: ArrayBarsProps) {
  const maxValue = Math.max(...array.map((bar) => bar.value));

  const getBarColor = (state: ArrayBar['state']) => {
    switch (state) {
      case 'comparing':
        return 'bg-yellow-400 shadow-yellow-400/50';
      case 'swapping':
        return 'bg-red-500 shadow-red-500/50';
      case 'sorted':
        return 'bg-green-500 shadow-green-500/50';
      case 'pivot':
        return 'bg-purple-500 shadow-purple-500/50';
      case 'selected':
        return 'bg-blue-400 shadow-blue-400/50';
      default:
        return 'bg-indigo-500 shadow-indigo-500/50';
    }
  };

  return (
    <div className="flex items-end justify-center gap-1 h-80 px-4 bg-slate-900/50 rounded-2xl p-6 backdrop-blur-sm border border-slate-700/50">
      {array.map((bar, index) => (
        <div
          key={index}
          className={cn(
            'rounded-t-lg transition-all duration-200 ease-in-out shadow-lg relative group min-w-[20px]',
            getBarColor(bar.state)
          )}
          style={{
            height: `${(bar.value / maxValue) * 100}%`,
            width: `${Math.max(100 / array.length - 1, 3)}%`,
          }}
        >
          <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
            {bar.value}
          </span>
        </div>
      ))}
    </div>
  );
}
