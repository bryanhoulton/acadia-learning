import { NumberLine } from 'slate-ui';

import {
  NumberLineBlock as NumberLineBlockType,
} from '../playground/canvas/schema';
import { CanvasBlockProps } from './';

export function NumberLineBlock({
  data,
}: CanvasBlockProps<NumberLineBlockType>) {
  return (
    <div className="w-full p-4 bg-white rounded-lg border border-gray-200">
      <NumberLine
        min={data.min}
        max={data.max}
        step={data.step ?? undefined}
        marks={data.marks?.map((mark) => ({
          ...mark,
          label: mark.label ?? undefined,
          color: mark.color ?? undefined,
        }))}
        segments={data.segments?.map((segment) => ({
          ...segment,
          label: segment.label ?? undefined,
          color: segment.color ?? undefined,
        }))}
        rays={data.rays?.map((ray) => ({
          ...ray,
          label: ray.label ?? undefined,
          color: ray.color ?? undefined,
        }))}
        title={data.title ?? undefined}
      />
    </div>
  );
}
