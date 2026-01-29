import { useState, useEffect, useCallback, useRef } from 'react';
import { Algorithm, Step } from './types';
import { generateSteps } from './algorithms';
import { ArrayBars } from './components/ArrayBars';
import { Controls } from './components/Controls';
import { AlgorithmSelector } from './components/AlgorithmSelector';
import { InfoPanel } from './components/InfoPanel';
import { ArrayControls } from './components/ArrayControls';

function generateRandomArray(size: number): number[] {
  return Array.from({ length: size }, () => Math.floor(Math.random() * 95) + 5);
}

function generateReversedArray(size: number): number[] {
  return Array.from({ length: size }, (_, i) => Math.floor(((size - i) / size) * 90) + 10);
}

function generateNearlySortedArray(size: number): number[] {
  const arr = Array.from({ length: size }, (_, i) => Math.floor((i / size) * 90) + 10);
  // Swap a few random pairs
  for (let i = 0; i < Math.floor(size / 5); i++) {
    const idx1 = Math.floor(Math.random() * size);
    const idx2 = Math.floor(Math.random() * size);
    [arr[idx1], arr[idx2]] = [arr[idx2], arr[idx1]];
  }
  return arr;
}

export function App() {
  const [algorithm, setAlgorithm] = useState<Algorithm>('bubble');
  const [arraySize, setArraySize] = useState(15);
  const [originalArray, setOriginalArray] = useState<number[]>(() => generateRandomArray(15));
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  
  const intervalRef = useRef<number | null>(null);

  // Generate steps when algorithm or array changes
  useEffect(() => {
    const newSteps = generateSteps(algorithm, originalArray);
    setSteps(newSteps);
    setCurrentStep(0);
    setIsPlaying(false);
  }, [algorithm, originalArray]);

  // Playback interval
  useEffect(() => {
    if (isPlaying && steps.length > 0) {
      intervalRef.current = window.setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500 / speed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, speed, steps.length]);

  const handlePlay = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [currentStep, steps.length]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStepForward = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, steps.length]);

  const handleStepBackward = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleReset = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleAlgorithmChange = useCallback((algo: Algorithm) => {
    setAlgorithm(algo);
    setIsPlaying(false);
  }, []);

  const handleArraySizeChange = useCallback((size: number) => {
    setArraySize(size);
    setOriginalArray(generateRandomArray(size));
  }, []);

  const handleGenerateRandom = useCallback(() => {
    setOriginalArray(generateRandomArray(arraySize));
  }, [arraySize]);

  const handleGenerateReversed = useCallback(() => {
    setOriginalArray(generateReversedArray(arraySize));
  }, [arraySize]);

  const handleGenerateNearlySorted = useCallback(() => {
    setOriginalArray(generateNearlySortedArray(arraySize));
  }, [arraySize]);

  const currentStepData = steps[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
            Algorithm Visualizer
          </h1>
          <p className="text-slate-400">
            Watch sorting algorithms in action with step-by-step visualization
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Visualization Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Algorithm Selector & Array Controls */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <AlgorithmSelector
                  selected={algorithm}
                  onSelect={handleAlgorithmChange}
                />
                <ArrayControls
                  arraySize={arraySize}
                  onArraySizeChange={handleArraySizeChange}
                  onGenerateRandom={handleGenerateRandom}
                  onGenerateReversed={handleGenerateReversed}
                  onGenerateNearlySorted={handleGenerateNearlySorted}
                />
              </div>
            </div>

            {/* Visualization */}
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
              {currentStepData && <ArrayBars array={currentStepData.array} />}
            </div>

            {/* Playback Controls */}
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
              <Controls
                isPlaying={isPlaying}
                currentStep={currentStep}
                totalSteps={steps.length}
                speed={speed}
                onPlay={handlePlay}
                onPause={handlePause}
                onStepForward={handleStepForward}
                onStepBackward={handleStepBackward}
                onReset={handleReset}
                onSpeedChange={setSpeed}
              />
            </div>
          </div>

          {/* Info Panel */}
          <div className="lg:col-span-1">
            <InfoPanel
              algorithm={algorithm}
              currentDescription={currentStepData?.description || 'Loading...'}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-slate-500 text-sm">
          <p>Use the controls to play, pause, or step through the algorithm</p>
        </footer>
      </div>
    </div>
  );
}
