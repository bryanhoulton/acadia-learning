import { motion } from 'framer-motion';

import type {
  TimelineBlock as TimelineBlockType,
} from '../playground/canvas/schema';
import { CanvasBlockProps } from './';
import { BlockMotionProps } from './motion';

export function TimelineBlock({ data }: CanvasBlockProps<TimelineBlockType>) {
  return (
    <motion.div
      className="w-full p-4 bg-white rounded-lg border border-gray-200"
      {...BlockMotionProps}
    >
      {data.title && (
        <h3 className="text-xl font-bold text-primary-900 mb-6">
          {data.title}
        </h3>
      )}

      <div className="relative">
        <table className="w-full table-fixed">
          <tbody>
            {data.items.map((item, index) => {
              // Check if both current and previous items are filled to color the line
              const shouldColorLine =
                index < data.items.length - 1 &&
                item.filled &&
                data.items[index + 1].filled;

              return (
                <tr key={index} className="relative w-fit">
                  {/* Date column */}
                  <td className="w-32 text-right align-top py-3 whitespace-nowrap">
                    <span
                      className="text-sm font-medium px-2 py-1 rounded-full inline-block"
                      style={{
                        backgroundColor: item.filled
                          ? `${data.color}20`
                          : "#f3f4f620",
                        color: item.filled ? data.color : "#9ca3af",
                      }}
                    >
                      {item.date}
                    </span>
                  </td>

                  {/* Timeline dot column */}
                  <td className="w-8 align-top py-3 relative px-4">
                    {/* Vertical line */}
                    {index < data.items.length - 1 && (
                      <div
                        className="absolute w-0.5"
                        style={{
                          left: "33px",
                          top: "28px", // Start at center of current dot (py-3 = 12px + dot height/2 = 16px)
                          bottom: "-28px", // End at center of next dot
                          transform: "translateX(-100%)",
                          backgroundColor: shouldColorLine
                            ? data.color
                            : "#d1d5db",
                        }}
                      />
                    )}

                    {/* Timeline dot */}
                    <div
                      className="relative flex items-center justify-center w-8 h-8 rounded-full border-2 bg-white shadow-sm"
                      style={{
                        borderColor: item.filled ? data.color : "#d1d5db",
                      }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: item.filled ? data.color : "#d1d5db",
                        }}
                      />
                    </div>
                  </td>

                  {/* Content column */}
                  <td className="align-top py-3 pl-8 w-full">
                    <h4
                      className={`text-lg font-semibold mb-1 ${
                        item.filled ? "text-gray-900" : "text-gray-500"
                      }`}
                    >
                      {item.title}
                    </h4>
                    {item.description && (
                      <p
                        className={`text-sm leading-relaxed ${
                          item.filled ? "text-gray-600" : "text-gray-400"
                        }`}
                      >
                        {item.description}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
