import { motion } from 'framer-motion';

import { TableBlock as TableBlockType } from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import MarkdownRenderer from './Markdown';
import { BlockMotionProps } from './motion';

export function TableBlock({ data }: CanvasBlockProps<TableBlockType>) {
  return (
    <motion.div
      className="w-full bg-white rounded-lg border border-gray-200 overflow-hidden"
      {...BlockMotionProps}
      key={`table-${data.headers.join("-")}-${data.rows
        .map((row) => row.join("-"))
        .join("-")}`}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-300">
              {data.headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left font-semibold text-gray-700 border-r border-gray-200 last:border-r-0"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-gray-200 last:border-b-0"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="px-4 py-3 text-gray-700 border-r border-gray-200 last:border-r-0"
                  >
                    <MarkdownRenderer content={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
