import { Step } from '../types';

type BarState = 'default' | 'comparing' | 'swapping' | 'sorted' | 'pivot' | 'selected';

interface Bar {
  value: number;
  state: BarState;
}

export function generateQuickSortSteps(initialArray: number[]): Step[] {
  const steps: Step[] = [];
  const arr: Bar[] = initialArray.map((value) => ({ value, state: 'default' }));
  
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Starting Quick Sort - Pick a pivot and partition the array',
  });

  function resetStates() {
    arr.forEach((bar) => {
      if (bar.state !== 'sorted') bar.state = 'default';
    });
  }

  function partition(low: number, high: number): number {
    const pivotValue = arr[high].value;
    
    resetStates();
    arr[high].state = 'pivot';
    steps.push({
      array: arr.map((bar) => ({ ...bar })),
      description: `Choosing pivot: ${pivotValue} (last element of current partition)`,
      pivot: high,
    });

    let i = low - 1;

    for (let j = low; j < high; j++) {
      resetStates();
      arr[high].state = 'pivot';
      arr[j].state = 'comparing';
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Comparing ${arr[j].value} with pivot ${pivotValue}`,
        comparing: [j],
        pivot: high,
      });

      if (arr[j].value < pivotValue) {
        i++;
        if (i !== j) {
          arr[i].state = 'swapping';
          arr[j].state = 'swapping';
          steps.push({
            array: arr.map((bar) => ({ ...bar })),
            description: `${arr[j].value} < ${pivotValue}, swapping ${arr[i].value} and ${arr[j].value}`,
            swapping: [i, j],
            pivot: high,
          });

          const temp = arr[i];
          arr[i] = arr[j];
          arr[j] = temp;

          steps.push({
            array: arr.map((bar) => ({ ...bar })),
            description: `Swapped elements`,
            pivot: high,
          });
        }
      }
    }

    // Place pivot in correct position
    if (i + 1 !== high) {
      resetStates();
      arr[i + 1].state = 'swapping';
      arr[high].state = 'swapping';
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Placing pivot ${pivotValue} in its correct position`,
        swapping: [i + 1, high],
      });

      const temp = arr[i + 1];
      arr[i + 1] = arr[high];
      arr[high] = temp;
    }

    arr[i + 1].state = 'sorted';
    steps.push({
      array: arr.map((bar) => ({ ...bar })),
      description: `Pivot ${pivotValue} is now in its final sorted position`,
    });

    return i + 1;
  }

  function quickSort(low: number, high: number) {
    if (low < high) {
      const pi = partition(low, high);
      quickSort(low, pi - 1);
      quickSort(pi + 1, high);
    } else if (low === high) {
      arr[low].state = 'sorted';
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `${arr[low].value} is in its sorted position`,
      });
    }
  }

  quickSort(0, arr.length - 1);

  arr.forEach((bar) => (bar.state = 'sorted'));
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Quick Sort complete! Array is sorted.',
  });

  return steps;
}
