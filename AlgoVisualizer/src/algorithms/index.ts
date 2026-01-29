import { Algorithm, AlgorithmInfo, Step } from '../types';
import { generateBubbleSortSteps } from './bubbleSort';
import { generateQuickSortSteps } from './quickSort';
import { generateMergeSortSteps } from './mergeSort';

export function generateSteps(algorithm: Algorithm, array: number[]): Step[] {
  switch (algorithm) {
    case 'bubble':
      return generateBubbleSortSteps(array);
    case 'quick':
      return generateQuickSortSteps(array);
    case 'merge':
      return generateMergeSortSteps(array);
    default:
      return generateBubbleSortSteps(array);
  }
}

export const algorithmInfo: Record<Algorithm, AlgorithmInfo> = {
  bubble: {
    name: 'Bubble Sort',
    timeComplexity: 'O(n²)',
    spaceComplexity: 'O(1)',
    description: 'Repeatedly steps through the list, compares adjacent elements and swaps them if they are in the wrong order.',
  },
  quick: {
    name: 'Quick Sort',
    timeComplexity: 'O(n log n)',
    spaceComplexity: 'O(log n)',
    description: 'Picks a pivot element and partitions the array around it. Elements smaller than pivot go left, larger go right.',
  },
  merge: {
    name: 'Merge Sort',
    timeComplexity: 'O(n log n)',
    spaceComplexity: 'O(n)',
    description: 'Divides the array into halves, recursively sorts them, then merges the sorted halves back together.',
  },
};
