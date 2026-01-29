import { Step } from '../types';

type BarState = 'default' | 'comparing' | 'swapping' | 'sorted' | 'pivot' | 'selected';

interface Bar {
  value: number;
  state: BarState;
}

export function generateMergeSortSteps(initialArray: number[]): Step[] {
  const steps: Step[] = [];
  const arr: Bar[] = initialArray.map((value) => ({ value, state: 'default' }));
  
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Starting Merge Sort - Divide array and merge sorted halves',
  });

  function resetStates() {
    arr.forEach((bar) => {
      if (bar.state !== 'sorted') bar.state = 'default';
    });
  }

  function merge(left: number, mid: number, right: number) {
    const leftArr: Bar[] = [];
    const rightArr: Bar[] = [];

    for (let i = left; i <= mid; i++) {
      leftArr.push({ ...arr[i] });
    }
    for (let i = mid + 1; i <= right; i++) {
      rightArr.push({ ...arr[i] });
    }

    resetStates();
    for (let i = left; i <= right; i++) {
      arr[i].state = 'selected';
    }
    steps.push({
      array: arr.map((bar) => ({ ...bar })),
      description: `Merging subarrays [${leftArr.map(b => b.value).join(', ')}] and [${rightArr.map(b => b.value).join(', ')}]`,
    });

    let i = 0, j = 0, k = left;

    while (i < leftArr.length && j < rightArr.length) {
      resetStates();
      
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Comparing ${leftArr[i].value} and ${rightArr[j].value}`,
        comparing: [left + i, mid + 1 + j],
      });

      if (leftArr[i].value <= rightArr[j].value) {
        arr[k] = { ...leftArr[i], state: 'swapping' };
        steps.push({
          array: arr.map((bar) => ({ ...bar })),
          description: `Placing ${leftArr[i].value} (smaller or equal)`,
        });
        i++;
      } else {
        arr[k] = { ...rightArr[j], state: 'swapping' };
        steps.push({
          array: arr.map((bar) => ({ ...bar })),
          description: `Placing ${rightArr[j].value} (smaller)`,
        });
        j++;
      }
      k++;
    }

    while (i < leftArr.length) {
      arr[k] = { ...leftArr[i], state: 'swapping' };
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Placing remaining element ${leftArr[i].value}`,
      });
      i++;
      k++;
    }

    while (j < rightArr.length) {
      arr[k] = { ...rightArr[j], state: 'swapping' };
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Placing remaining element ${rightArr[j].value}`,
      });
      j++;
      k++;
    }

    resetStates();
    steps.push({
      array: arr.map((bar) => ({ ...bar })),
      description: `Merged: [${arr.slice(left, right + 1).map(b => b.value).join(', ')}]`,
    });
  }

  function mergeSort(left: number, right: number) {
    if (left < right) {
      const mid = Math.floor((left + right) / 2);
      
      resetStates();
      for (let i = left; i <= mid; i++) {
        arr[i].state = 'comparing';
      }
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Dividing: processing left half [${left}...${mid}]`,
      });
      
      mergeSort(left, mid);
      
      resetStates();
      for (let i = mid + 1; i <= right; i++) {
        arr[i].state = 'comparing';
      }
      steps.push({
        array: arr.map((bar) => ({ ...bar })),
        description: `Dividing: processing right half [${mid + 1}...${right}]`,
      });
      
      mergeSort(mid + 1, right);
      merge(left, mid, right);
    }
  }

  mergeSort(0, arr.length - 1);

  arr.forEach((bar) => (bar.state = 'sorted'));
  steps.push({
    array: arr.map((bar) => ({ ...bar })),
    description: 'Merge Sort complete! Array is sorted.',
  });

  return steps;
}
