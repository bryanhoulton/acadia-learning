import { FractionDiagram } from 'slate-ui';

import {
  FractionBlock as FractionBlockType,
} from '../playground/canvas/schema';
import { CanvasBlockProps } from './';

export function FractionBlock({ data }: CanvasBlockProps<FractionBlockType>) {
  return (
    <div className="w-full p-4 bg-white rounded-lg border border-gray-200">
      <FractionDiagram
        fractions={data.fractions}
        type={data.diagram_type}
        showLabel={data.show_label}
      />
    </div>
  );
}
