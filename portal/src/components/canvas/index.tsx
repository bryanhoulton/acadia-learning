import type { BlockData } from '../playground/canvas/schema';

export interface CanvasBlockProps<T extends BlockData> {
  data: T;
  onChange?: (data: T) => void;
  disabled?: boolean;
}
