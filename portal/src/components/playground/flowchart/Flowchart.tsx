/**
 * Flowchart Playground Component
 *
 * A view-only flowchart renderer using ReactFlow with dagre auto-layout.
 * - AI defines nodes and edges (no position data needed)
 * - System auto-layouts using dagre
 * - Students can click to select/highlight nodes
 */

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo, useState } from "react";

import dagre from "dagre";

import {
  Background,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";

import type { PlaygroundComponentProps } from "../types";
import { ACTION_DEFAULTS } from "./actions";
import {
  actionSchemas,
  type Config,
  type FlowchartAction,
  type FlowchartEdge,
  type FlowchartNode,
  type State,
} from "./schema";

// ============================================
// Props Type
// ============================================

type Props = PlaygroundComponentProps<Config, State, typeof actionSchemas>;

// ============================================
// Node Dimensions by Shape
// ============================================

const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  rectangle: { width: 150, height: 50 },
  diamond: { width: 120, height: 80 },
  circle: { width: 80, height: 80 },
  pill: { width: 140, height: 40 },
};

// ============================================
// Custom Node Components
// ============================================

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  shape: string;
  color?: string;
  description?: string;
  selected?: boolean;
  highlighted?: boolean;
  index?: number;
  direction?: string;
}

// Get handle positions based on layout direction
function getHandlePositions(direction: string = "TB"): {
  source: Position;
  target: Position;
} {
  switch (direction) {
    case "LR":
      return { source: Position.Right, target: Position.Left };
    case "RL":
      return { source: Position.Left, target: Position.Right };
    case "BT":
      return { source: Position.Top, target: Position.Bottom };
    case "TB":
    default:
      return { source: Position.Bottom, target: Position.Top };
  }
}

// ============================================
// Animation Styles
// ============================================

const nodeAnimationStyle = (index: number = 0) => ({
  animation: `nodeEnter 0.4s ease-out ${index * 0.08}s both`,
});

const glowAnimation = `
  @keyframes nodeEnter {
    from {
      opacity: 0;
      transform: scale(0.8) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  
  @keyframes glow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(250, 204, 21, 0.4), 0 0 10px rgba(250, 204, 21, 0.3), 0 0 15px rgba(250, 204, 21, 0.2);
    }
    50% {
      box-shadow: 0 0 10px rgba(250, 204, 21, 0.6), 0 0 20px rgba(250, 204, 21, 0.4), 0 0 30px rgba(250, 204, 21, 0.3);
    }
  }
  
  @keyframes pulseScale {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }
  
  .react-flow__edge-path {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
    animation: edgeDraw 1s ease-out forwards;
    animation-delay: 0.3s;
  }
  
  @keyframes edgeDraw {
    to {
      stroke-dashoffset: 0;
    }
  }
  
  .react-flow__edge:hover .react-flow__edge-path {
    stroke-width: 3;
    filter: drop-shadow(0 0 3px rgba(148, 163, 184, 0.5));
  }
  
  .react-flow__edgelabel-renderer {
    animation: fadeIn 0.5s ease-out 0.8s both;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes pathFlow {
    0% {
      stroke-dashoffset: 24;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }
  
  @keyframes edgePulse {
    0%, 100% {
      filter: drop-shadow(0 0 4px rgba(0, 230, 230, 0.8)) drop-shadow(0 0 8px rgba(0, 230, 230, 0.5));
    }
    50% {
      filter: drop-shadow(0 0 8px rgba(0, 230, 230, 1)) drop-shadow(0 0 16px rgba(0, 230, 230, 0.7));
    }
  }
  
  .highlighted-edge .react-flow__edge-path {
    stroke: #00e6e6 !important;
    stroke-width: 4 !important;
    stroke-dasharray: 8 4 !important;
    stroke-dashoffset: 0 !important;
    animation: pathFlow 0.5s linear infinite, edgePulse 1.5s ease-in-out infinite !important;
  }
`;

function RectangleNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const bgColor = data.color || "#3b82f6";
  const isHighlighted = data.highlighted;
  const isSelected = data.selected;
  const { source, target } = getHandlePositions(data.direction);

  return (
    <>
      <Handle
        type="target"
        position={target}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
      <div
        className={`
          px-4 py-2 rounded-md border-2 text-white font-medium text-sm
          flex items-center justify-center text-center
          transition-all duration-200 cursor-pointer
          hover:scale-105 hover:shadow-lg
          ${isSelected ? "ring-2 ring-white ring-opacity-90 scale-105" : ""}
        `}
        style={{
          backgroundColor: bgColor,
          borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.3)",
          minWidth: 120,
          minHeight: 40,
          ...nodeAnimationStyle(data.index),
          ...(isHighlighted
            ? {
                animation: `nodeEnter 0.4s ease-out ${(data.index || 0) * 0.08}s both, glow 1.5s ease-in-out infinite, pulseScale 1.5s ease-in-out infinite`,
              }
            : {}),
        }}
        title={data.description}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={source}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
    </>
  );
}

function DiamondNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const bgColor = data.color || "#f59e0b";
  const isHighlighted = data.highlighted;
  const isSelected = data.selected;
  const { source, target } = getHandlePositions(data.direction);

  return (
    <>
      <Handle
        type="target"
        position={target}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
      <div
        className={`
          flex items-center justify-center
          transition-all duration-200 cursor-pointer
          hover:scale-105
        `}
        style={{
          width: 100,
          height: 100,
          ...nodeAnimationStyle(data.index),
          ...(isHighlighted
            ? {
                animation: `nodeEnter 0.4s ease-out ${(data.index || 0) * 0.08}s both, pulseScale 1.5s ease-in-out infinite`,
              }
            : {}),
        }}
        title={data.description}
      >
        <div
          className={`
            absolute flex items-center justify-center
            text-white font-medium text-xs text-center
            transition-shadow duration-200
            ${isSelected ? "ring-2 ring-white ring-opacity-90" : ""}
          `}
          style={{
            width: 70,
            height: 70,
            backgroundColor: bgColor,
            transform: isSelected
              ? "rotate(45deg) scale(1.05)"
              : "rotate(45deg)",
            borderRadius: 4,
            boxShadow: isHighlighted
              ? "0 0 15px rgba(250, 204, 21, 0.6), 0 0 30px rgba(250, 204, 21, 0.3)"
              : undefined,
          }}
        >
          <span style={{ transform: "rotate(-45deg)", padding: "0 4px" }}>
            {data.label}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={source}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
    </>
  );
}

function CircleNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const bgColor = data.color || "#10b981";
  const isHighlighted = data.highlighted;
  const isSelected = data.selected;
  const { source, target } = getHandlePositions(data.direction);

  return (
    <>
      <Handle
        type="target"
        position={target}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
      <div
        className={`
          rounded-full border-2 text-white font-medium text-xs
          flex items-center justify-center text-center p-2
          transition-all duration-200 cursor-pointer
          hover:scale-110 hover:shadow-lg
          ${isSelected ? "ring-2 ring-white ring-opacity-90 scale-110" : ""}
        `}
        style={{
          backgroundColor: bgColor,
          borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.3)",
          width: 70,
          height: 70,
          ...nodeAnimationStyle(data.index),
          ...(isHighlighted
            ? {
                animation: `nodeEnter 0.4s ease-out ${(data.index || 0) * 0.08}s both, glow 1.5s ease-in-out infinite, pulseScale 1.5s ease-in-out infinite`,
              }
            : {}),
        }}
        title={data.description}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={source}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
    </>
  );
}

function PillNode({ data }: NodeProps<Node<CustomNodeData>>) {
  const bgColor = data.color || "#8b5cf6";
  const isHighlighted = data.highlighted;
  const isSelected = data.selected;
  const { source, target } = getHandlePositions(data.direction);

  return (
    <>
      <Handle
        type="target"
        position={target}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
      <div
        className={`
          px-4 py-2 rounded-full border-2 text-white font-medium text-sm
          flex items-center justify-center text-center
          transition-all duration-200 cursor-pointer
          hover:scale-105 hover:shadow-lg
          ${isSelected ? "ring-2 ring-white ring-opacity-90 scale-105" : ""}
        `}
        style={{
          backgroundColor: bgColor,
          borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.3)",
          minWidth: 100,
          ...nodeAnimationStyle(data.index),
          ...(isHighlighted
            ? {
                animation: `nodeEnter 0.4s ease-out ${(data.index || 0) * 0.08}s both, glow 1.5s ease-in-out infinite, pulseScale 1.5s ease-in-out infinite`,
              }
            : {}),
        }}
        title={data.description}
      >
        {data.label}
      </div>
      <Handle
        type="source"
        position={source}
        className="!bg-transparent !border-0 !w-2 !h-2"
      />
    </>
  );
}

const nodeTypes = {
  rectangle: RectangleNode,
  diamond: DiamondNode,
  circle: CircleNode,
  pill: PillNode,
};

// ============================================
// Auto-Layout using Dagre
// ============================================

// Highlight color for paths - bright cyan that stands out
const HIGHLIGHT_COLOR = "#00e6e6";

function getLayoutedElements(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  direction: string,
  selectedNodeIds: string[],
  highlightedNodeIds: string[]
): { nodes: Node<CustomNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 70,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    const dims = NODE_DIMENSIONS[node.shape] || NODE_DIMENSIONS.rectangle;
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(g);

  // Build a set of highlighted edges (edges connecting consecutive highlighted nodes)
  const highlightedEdgeIds = new Set<string>();
  if (highlightedNodeIds.length > 1) {
    // Check each edge to see if it connects two consecutive nodes in the path
    for (let i = 0; i < highlightedNodeIds.length - 1; i++) {
      const sourceId = highlightedNodeIds[i];
      const targetId = highlightedNodeIds[i + 1];
      // Find edge connecting these nodes (in either direction)
      edges.forEach((edge) => {
        if (
          (edge.source === sourceId && edge.target === targetId) ||
          (edge.source === targetId && edge.target === sourceId)
        ) {
          highlightedEdgeIds.add(edge.id);
        }
      });
    }
  }

  // Convert to ReactFlow format
  const layoutedNodes: Node<CustomNodeData>[] = nodes.map((node, index) => {
    const nodeWithPosition = g.node(node.id);
    const dims = NODE_DIMENSIONS[node.shape] || NODE_DIMENSIONS.rectangle;

    return {
      id: node.id,
      type: node.shape,
      position: {
        x: nodeWithPosition.x - dims.width / 2,
        y: nodeWithPosition.y - dims.height / 2,
      },
      data: {
        label: node.label,
        shape: node.shape,
        color: node.color,
        description: node.description,
        selected: selectedNodeIds.includes(node.id),
        highlighted: highlightedNodeIds.includes(node.id),
        index,
        direction,
      },
    };
  });

  const layoutedEdges: Edge[] = edges.map((edge) => {
    const isHighlighted = highlightedEdgeIds.has(edge.id);
    const edgeColor = isHighlighted ? HIGHLIGHT_COLOR : edge.color || "#94a3b8";

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      type: "default",
      animated: isHighlighted,
      className: isHighlighted ? "highlighted-edge" : undefined,
      style: {
        stroke: edgeColor,
        strokeWidth: isHighlighted ? 4 : 2,
        strokeDasharray: isHighlighted
          ? "8 4"
          : edge.style === "dashed"
            ? "5,5"
            : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor,
        width: isHighlighted ? 24 : 20,
        height: isHighlighted ? 24 : 20,
      },
      labelStyle: {
        fill: isHighlighted ? HIGHLIGHT_COLOR : "#64748b",
        fontWeight: isHighlighted ? 600 : 500,
        fontSize: isHighlighted ? 13 : 12,
      },
      labelBgStyle: {
        fill: isHighlighted ? "#1a1a2e" : "#f8fafc",
        fillOpacity: 0.9,
      },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

// ============================================
// Inner Flow Component
// ============================================

interface FlowchartInnerProps {
  config: Config;
  state: State;
  onChange?: (state: State) => void;
  highlightedNodeIds: string[];
}

function FlowchartInner({
  config,
  state,
  onChange,
  highlightedNodeIds,
}: FlowchartInnerProps) {
  const { fitView } = useReactFlow();

  // Compute layout
  const { nodes, edges } = useMemo(
    () =>
      getLayoutedElements(
        state.nodes,
        state.edges,
        config.direction,
        state.selectedNodeIds,
        highlightedNodeIds
      ),
    [
      state.nodes,
      state.edges,
      config.direction,
      state.selectedNodeIds,
      highlightedNodeIds,
    ]
  );

  // Create a stable key for the current node set
  const nodesKey = useMemo(
    () =>
      state.nodes
        .map((n) => n.id)
        .sort()
        .join(","),
    [state.nodes]
  );

  // Fit view when nodes change (different set of nodes)
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
    return () => clearTimeout(timer);
  }, [nodesKey, fitView]);

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!config.allowNodeSelection || !onChange) return;

      const nodeId = node.id;
      let newSelectedIds: string[];

      if (config.allowMultiSelect) {
        // Toggle selection
        if (state.selectedNodeIds.includes(nodeId)) {
          newSelectedIds = state.selectedNodeIds.filter((id) => id !== nodeId);
        } else {
          newSelectedIds = [...state.selectedNodeIds, nodeId];
        }
      } else {
        // Single selection - toggle or replace
        if (state.selectedNodeIds.includes(nodeId)) {
          newSelectedIds = [];
        } else {
          newSelectedIds = [nodeId];
        }
      }

      onChange({
        ...state,
        selectedNodeIds: newSelectedIds,
      });
    },
    [config.allowNodeSelection, config.allowMultiSelect, onChange, state]
  );

  // Handle pane click to deselect
  const onPaneClick = useCallback(() => {
    if (onChange && state.selectedNodeIds.length > 0) {
      onChange({
        ...state,
        selectedNodeIds: [],
      });
    }
  }, [onChange, state]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={config.allowNodeSelection}
      panOnScroll
      zoomOnScroll
      minZoom={0.5}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e2e8f0" gap={20} size={1} />
    </ReactFlow>
  );
}

// ============================================
// Main Component
// ============================================

export function Flowchart({
  config,
  state,
  onChange,
  pendingAction,
  onActionComplete,
}: Props) {
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  // Process a single action
  const processAction = useCallback((action: FlowchartAction): number => {
    switch (action.action) {
      case "highlight_node": {
        const { nodeId, duration = ACTION_DEFAULTS.highlight_node.duration } =
          action.params;
        setHighlightedNodeIds((prev) =>
          prev.includes(nodeId) ? prev : [...prev, nodeId]
        );
        setTimeout(() => {
          setHighlightedNodeIds((prev) => prev.filter((id) => id !== nodeId));
        }, duration);
        return duration;
      }

      case "highlight_path": {
        const { nodeIds, duration = ACTION_DEFAULTS.highlight_path.duration } =
          action.params;
        setHighlightedNodeIds(nodeIds);
        setTimeout(() => {
          setHighlightedNodeIds([]);
        }, duration);
        return duration;
      }

      case "clear_highlights": {
        setHighlightedNodeIds([]);
        return 0;
      }

      default:
        return 0;
    }
  }, []);

  // Handle actions from PlaygroundAction
  useEffect(() => {
    if (!pendingAction) return;

    const actionItems = pendingAction.actions || [];
    let maxDuration = 0;

    for (const actionItem of actionItems) {
      // Cast to discriminated union for type narrowing
      const typedAction = actionItem as FlowchartAction;
      const duration = processAction(typedAction);
      maxDuration = Math.max(maxDuration, duration);
    }

    // Notify parent that action was handled after the longest duration
    if (maxDuration > 0) {
      setTimeout(() => {
        onActionComplete?.();
      }, maxDuration);
    } else {
      onActionComplete?.();
    }
  }, [pendingAction, processAction, onActionComplete]);

  // Empty state
  if (state.nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-2">🔀</div>
          <div>No flowchart to display</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-0" style={{ minHeight: 300 }}>
      <style>{glowAnimation}</style>
      <div className="absolute inset-0">
        <ReactFlowProvider>
          <FlowchartInner
            config={config}
            state={state}
            onChange={onChange}
            highlightedNodeIds={highlightedNodeIds}
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}

export default Flowchart;
