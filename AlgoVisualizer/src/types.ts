export interface ArrayBar {
  value: number;
  state: 'default' | 'comparing' | 'swapping' | 'sorted' | 'pivot' | 'selected';
}

export interface Step {
  array: ArrayBar[];
  description: string;
  comparing?: number[];
  swapping?: number[];
  pivot?: number;
}

export type Algorithm = 'bubble' | 'quick' | 'merge';

export interface AlgorithmInfo {
  name: string;
  timeComplexity: string;
  spaceComplexity: string;
  description: string;
}
