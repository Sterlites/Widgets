import { Step } from '../types';

type BarState = 'default' | 'comparing' | 'swapping' | 'sorted' | 'pivot' | 'selected';

interface Bar {
  value: number;
  state: BarState;
}

export function generateBubbleSortSteps(initialArray: number[]): Step[] {
  const steps: Step[] = [];
  const arr: Bar[] = initialArray.map((value) => ({ value, state: 'default' }));
  
  // Initial state
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Starting Bubble Sort - Compare adjacent elements and swap if needed',
  });

  const n = arr.length;
  
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      // Reset states
      arr.forEach((bar) => {
        if (bar.state !== 'sorted') bar.state = 'default';
      });
      
      // Comparing
      arr[j].state = 'comparing';
      arr[j + 1].state = 'comparing';
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Comparing ${arr[j].value} and ${arr[j + 1].value}`,
        comparing: [j, j + 1],
      });

      if (arr[j].value > arr[j + 1].value) {
        // Swapping
        arr[j].state = 'swapping';
        arr[j + 1].state = 'swapping';
        steps.push({
          array: arr.map((bar) => ({ ...bar })),
          description: `Swapping ${arr[j].value} and ${arr[j + 1].value} because ${arr[j].value} > ${arr[j + 1].value}`,
          swapping: [j, j + 1],
        });

        // Perform swap
        const temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;

        steps.push({
          array: arr.map((bar) => ({ ...bar })),
          description: `Swapped! Array updated`,
          swapping: [j, j + 1],
        });
      }
    }
    
    // Mark as sorted
    arr[n - i - 1].state = 'sorted';
    steps.push({
      array: arr.map((bar) => ({ ...bar })),
      description: `${arr[n - i - 1].value} is now in its final position`,
    });
  }

  // Mark first element as sorted
  arr[0].state = 'sorted';
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Bubble Sort complete! Array is sorted.',
  });

  return steps;
}
