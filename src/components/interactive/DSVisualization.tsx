import { useState, useCallback, useRef, useEffect } from 'react';
import type { VisualizationProps } from '../../types/interactive';

/** Animation state machine: idle → playing → paused */
type AnimationState = 'idle' | 'playing' | 'paused';

/** A node in the visualization */
interface VisNode {
  id: string;
  value: number | string;
  x: number;
  y: number;
  highlighted: boolean;
}

/** An edge in the visualization */
interface VisEdge {
  from: string;
  to: string;
  highlighted: boolean;
}

/** Internal state for the visualization */
interface VisState {
  nodes: VisNode[];
  edges: VisEdge[];
  currentStep: number;
  totalSteps: number;
  traversalOrder: string[];
}

/**
 * Data Structure Visualization component.
 * Renders animated SVG visualizations for common data structures
 * with play, pause, step-forward, and reset controls.
 *
 * Supported types: bst, bfs, dfs, linked-list, heap, graph
 *
 * Validates: Requirement 4.6
 */
export function DSVisualization({ type, initialData, stepDurationMs }: VisualizationProps) {
  const clampedDuration = Math.max(500, Math.min(2000, stepDurationMs));

  const [animationState, setAnimationState] = useState<AnimationState>('idle');
  const [speed, setSpeed] = useState(clampedDuration);
  const [visState, setVisState] = useState<VisState>(() =>
    buildInitialState(type, initialData)
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Restart interval when speed changes during playback
  useEffect(() => {
    if (animationState === 'playing') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        advanceStep();
      }, speed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  const advanceStep = useCallback(() => {
    setVisState((prev) => {
      if (prev.currentStep >= prev.totalSteps - 1) {
        // Animation complete — stop
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setAnimationState('idle');
        return prev;
      }

      const nextStep = prev.currentStep + 1;
      return applyStep(prev, nextStep);
    });
  }, []);

  const handlePlay = useCallback(() => {
    if (animationState === 'playing') return;

    setAnimationState('playing');
    intervalRef.current = setInterval(() => {
      advanceStep();
    }, speed);
  }, [animationState, speed, advanceStep]);

  const handlePause = useCallback(() => {
    if (animationState !== 'playing') return;

    setAnimationState('paused');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [animationState]);

  const handleStepForward = useCallback(() => {
    if (animationState === 'playing') {
      // Pause first, then step
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setAnimationState('paused');
    }
    advanceStep();
  }, [animationState, advanceStep]);

  const handleReset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAnimationState('idle');
    setVisState(buildInitialState(type, initialData));
  }, [type, initialData]);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = Number(e.target.value);
    setSpeed(Math.max(500, Math.min(2000, newSpeed)));
  }, []);

  return (
    <div className="ds-visualization" data-type={type}>
      <div className="ds-visualization__header">
        <h4 className="ds-visualization__title">{getTitle(type)}</h4>
        <span className="ds-visualization__step-info">
          Step {visState.currentStep} / {visState.totalSteps - 1}
        </span>
      </div>

      <svg
        className="ds-visualization__svg"
        viewBox="0 0 600 400"
        width="100%"
        height="300"
        aria-label={`${getTitle(type)} visualization`}
        role="img"
      >
        {renderVisualization(type, visState)}
      </svg>

      <div className="ds-visualization__controls">
        <button
          type="button"
          className="ds-visualization__btn"
          onClick={handlePlay}
          disabled={animationState === 'playing' || visState.currentStep >= visState.totalSteps - 1}
          aria-label="Play animation"
        >
          ▶ Play
        </button>
        <button
          type="button"
          className="ds-visualization__btn"
          onClick={handlePause}
          disabled={animationState !== 'playing'}
          aria-label="Pause animation"
        >
          ⏸ Pause
        </button>
        <button
          type="button"
          className="ds-visualization__btn"
          onClick={handleStepForward}
          disabled={visState.currentStep >= visState.totalSteps - 1}
          aria-label="Step forward"
        >
          ⏭ Step
        </button>
        <button
          type="button"
          className="ds-visualization__btn"
          onClick={handleReset}
          aria-label="Reset animation"
        >
          ↺ Reset
        </button>
      </div>

      <div className="ds-visualization__speed">
        <label htmlFor={`speed-slider-${type}`}>
          Speed: {speed}ms
        </label>
        <input
          id={`speed-slider-${type}`}
          type="range"
          min={500}
          max={2000}
          step={100}
          value={speed}
          onChange={handleSpeedChange}
          aria-label="Animation step duration in milliseconds"
        />
      </div>
    </div>
  );
}

/** Get display title for visualization type */
function getTitle(type: VisualizationProps['type']): string {
  const titles: Record<VisualizationProps['type'], string> = {
    bst: 'Binary Search Tree',
    bfs: 'Breadth-First Search',
    dfs: 'Depth-First Search',
    'linked-list': 'Linked List',
    heap: 'Heap',
    graph: 'Graph',
  };
  return titles[type];
}

/** Build initial visualization state from data and type */
function buildInitialState(type: VisualizationProps['type'], initialData: unknown): VisState {
  switch (type) {
    case 'bst':
      return buildBSTState(initialData);
    case 'linked-list':
      return buildLinkedListState(initialData);
    case 'heap':
      return buildHeapState(initialData);
    case 'graph':
    case 'bfs':
    case 'dfs':
      return buildGraphState(type, initialData);
    default:
      return { nodes: [], edges: [], currentStep: 0, totalSteps: 1, traversalOrder: [] };
  }
}

/** Build BST visualization state */
function buildBSTState(data: unknown): VisState {
  const values = Array.isArray(data) ? (data as number[]) : [5, 3, 7, 1, 4, 6, 8];
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  // Build BST structure for positioning
  interface BSTNode {
    value: number;
    left: BSTNode | null;
    right: BSTNode | null;
  }

  let root: BSTNode | null = null;

  function insert(val: number): void {
    const newNode: BSTNode = { value: val, left: null, right: null };
    if (!root) {
      root = newNode;
      return;
    }
    let current: BSTNode = root;
    while (true) {
      if (val < current.value) {
        if (!current.left) { current.left = newNode; return; }
        current = current.left;
      } else {
        if (!current.right) { current.right = newNode; return; }
        current = current.right;
      }
    }
  }

  values.forEach(insert);

  // Position nodes in tree layout
  function positionNode(node: BSTNode | null, x: number, y: number, spread: number): void {
    if (!node) return;
    const id = `node-${node.value}`;
    nodes.push({ id, value: node.value, x, y, highlighted: false });

    if (node.left) {
      const childId = `node-${node.left.value}`;
      edges.push({ from: id, to: childId, highlighted: false });
      positionNode(node.left, x - spread, y + 70, spread * 0.6);
    }
    if (node.right) {
      const childId = `node-${node.right.value}`;
      edges.push({ from: id, to: childId, highlighted: false });
      positionNode(node.right, x + spread, y + 70, spread * 0.6);
    }
  }

  positionNode(root, 300, 50, 120);

  // Traversal order: in-order for BST insertion animation
  const traversalOrder = values.map((v) => `node-${v}`);

  return {
    nodes,
    edges,
    currentStep: 0,
    totalSteps: traversalOrder.length + 1,
    traversalOrder,
  };
}

/** Build linked list visualization state */
function buildLinkedListState(data: unknown): VisState {
  const values = Array.isArray(data) ? (data as (number | string)[]) : [1, 2, 3, 4, 5];
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  values.forEach((val, i) => {
    const id = `node-${i}`;
    nodes.push({
      id,
      value: val,
      x: 60 + i * 110,
      y: 200,
      highlighted: false,
    });

    if (i > 0) {
      edges.push({ from: `node-${i - 1}`, to: id, highlighted: false });
    }
  });

  const traversalOrder = nodes.map((n) => n.id);

  return {
    nodes,
    edges,
    currentStep: 0,
    totalSteps: traversalOrder.length + 1,
    traversalOrder,
  };
}

/** Build heap visualization state (array + tree view) */
function buildHeapState(data: unknown): VisState {
  const values = Array.isArray(data) ? (data as number[]) : [10, 8, 9, 4, 5, 6, 7];
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  // Position as binary tree
  values.forEach((val, i) => {
    const level = Math.floor(Math.log2(i + 1));
    const posInLevel = i - (Math.pow(2, level) - 1);
    const nodesInLevel = Math.pow(2, level);
    const spacing = 600 / (nodesInLevel + 1);

    const id = `node-${i}`;
    nodes.push({
      id,
      value: val,
      x: spacing * (posInLevel + 1),
      y: 50 + level * 80,
      highlighted: false,
    });

    if (i > 0) {
      const parentIdx = Math.floor((i - 1) / 2);
      edges.push({ from: `node-${parentIdx}`, to: id, highlighted: false });
    }
  });

  const traversalOrder = nodes.map((n) => n.id);

  return {
    nodes,
    edges,
    currentStep: 0,
    totalSteps: traversalOrder.length + 1,
    traversalOrder,
  };
}

/** Build graph visualization state (also used for BFS/DFS) */
function buildGraphState(type: 'graph' | 'bfs' | 'dfs', data: unknown): VisState {
  // Default graph data
  interface GraphData {
    nodes: (number | string)[];
    edges: [number, number][];
  }

  const defaultGraph: GraphData = {
    nodes: [0, 1, 2, 3, 4, 5],
    edges: [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [3, 5]],
  };

  const graphData = (data && typeof data === 'object' && 'nodes' in (data as object))
    ? data as GraphData
    : defaultGraph;

  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  // Position nodes in a circle
  const centerX = 300;
  const centerY = 200;
  const radius = 130;

  graphData.nodes.forEach((val, i) => {
    const angle = (2 * Math.PI * i) / graphData.nodes.length - Math.PI / 2;
    nodes.push({
      id: `node-${i}`,
      value: val,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      highlighted: false,
    });
  });

  graphData.edges.forEach(([from, to]) => {
    edges.push({ from: `node-${from}`, to: `node-${to}`, highlighted: false });
  });

  // Compute traversal order based on type
  let traversalOrder: string[];
  if (type === 'bfs') {
    traversalOrder = bfsTraversal(graphData);
  } else if (type === 'dfs') {
    traversalOrder = dfsTraversal(graphData);
  } else {
    traversalOrder = graphData.nodes.map((_, i) => `node-${i}`);
  }

  return {
    nodes,
    edges,
    currentStep: 0,
    totalSteps: traversalOrder.length + 1,
    traversalOrder,
  };
}

/** BFS traversal order */
function bfsTraversal(graph: { nodes: (number | string)[]; edges: [number, number][] }): string[] {
  const adj = buildAdjList(graph);
  const visited = new Set<number>();
  const order: string[] = [];
  const queue: number[] = [0];
  visited.add(0);

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(`node-${current}`);

    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return order;
}

/** DFS traversal order */
function dfsTraversal(graph: { nodes: (number | string)[]; edges: [number, number][] }): string[] {
  const adj = buildAdjList(graph);
  const visited = new Set<number>();
  const order: string[] = [];

  function dfs(node: number): void {
    visited.add(node);
    order.push(`node-${node}`);
    for (const neighbor of adj.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }
  }

  dfs(0);
  return order;
}

/** Build adjacency list from graph data */
function buildAdjList(graph: { nodes: (number | string)[]; edges: [number, number][] }): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  graph.nodes.forEach((_, i) => adj.set(i, []));
  graph.edges.forEach(([from, to]) => {
    adj.get(from)?.push(to);
    adj.get(to)?.push(from);
  });
  return adj;
}

/** Apply a step to the visualization state (highlight traversal nodes) */
function applyStep(state: VisState, step: number): VisState {
  const highlightedIds = new Set(state.traversalOrder.slice(0, step));

  return {
    ...state,
    currentStep: step,
    nodes: state.nodes.map((node) => ({
      ...node,
      highlighted: highlightedIds.has(node.id),
    })),
    edges: state.edges.map((edge) => ({
      ...edge,
      highlighted: highlightedIds.has(edge.from) && highlightedIds.has(edge.to),
    })),
  };
}

/** Render SVG elements based on visualization type */
function renderVisualization(type: VisualizationProps['type'], state: VisState): React.ReactNode {
  switch (type) {
    case 'linked-list':
      return renderLinkedList(state);
    case 'bst':
    case 'heap':
    case 'graph':
    case 'bfs':
    case 'dfs':
    default:
      return renderTreeOrGraph(state, type);
  }
}

/** Render tree/graph structures (BST, heap, graph, BFS, DFS) */
function renderTreeOrGraph(state: VisState, type: VisualizationProps['type']): React.ReactNode {
  const nodeRadius = type === 'heap' ? 22 : 24;

  return (
    <>
      {/* Edges */}
      {state.edges.map((edge, i) => {
        const fromNode = state.nodes.find((n) => n.id === edge.from);
        const toNode = state.nodes.find((n) => n.id === edge.to);
        if (!fromNode || !toNode) return null;

        return (
          <line
            key={`edge-${i}`}
            x1={fromNode.x}
            y1={fromNode.y}
            x2={toNode.x}
            y2={toNode.y}
            stroke={edge.highlighted ? '#4f46e5' : '#94a3b8'}
            strokeWidth={edge.highlighted ? 3 : 2}
            opacity={edge.highlighted ? 1 : 0.6}
          />
        );
      })}

      {/* Nodes */}
      {state.nodes.map((node) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r={nodeRadius}
            fill={node.highlighted ? '#4f46e5' : '#f1f5f9'}
            stroke={node.highlighted ? '#3730a3' : '#64748b'}
            strokeWidth={2}
          />
          <text
            x={node.x}
            y={node.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight="bold"
            fill={node.highlighted ? '#ffffff' : '#1e293b'}
          >
            {node.value}
          </text>
        </g>
      ))}
    </>
  );
}

/** Render linked list with rectangular nodes and arrows */
function renderLinkedList(state: VisState): React.ReactNode {
  const nodeWidth = 80;
  const nodeHeight = 40;

  return (
    <>
      {/* Arrows between nodes */}
      {state.edges.map((edge, i) => {
        const fromNode = state.nodes.find((n) => n.id === edge.from);
        const toNode = state.nodes.find((n) => n.id === edge.to);
        if (!fromNode || !toNode) return null;

        const startX = fromNode.x + nodeWidth / 2;
        const endX = toNode.x - nodeWidth / 2;
        const y = fromNode.y;

        return (
          <g key={`edge-${i}`}>
            <line
              x1={startX}
              y1={y}
              x2={endX - 6}
              y2={y}
              stroke={edge.highlighted ? '#4f46e5' : '#94a3b8'}
              strokeWidth={edge.highlighted ? 3 : 2}
            />
            {/* Arrowhead */}
            <polygon
              points={`${endX - 6},${y - 5} ${endX},${y} ${endX - 6},${y + 5}`}
              fill={edge.highlighted ? '#4f46e5' : '#94a3b8'}
            />
          </g>
        );
      })}

      {/* Rectangular nodes */}
      {state.nodes.map((node) => (
        <g key={node.id}>
          <rect
            x={node.x - nodeWidth / 2}
            y={node.y - nodeHeight / 2}
            width={nodeWidth}
            height={nodeHeight}
            rx={6}
            ry={6}
            fill={node.highlighted ? '#4f46e5' : '#f1f5f9'}
            stroke={node.highlighted ? '#3730a3' : '#64748b'}
            strokeWidth={2}
          />
          <text
            x={node.x}
            y={node.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight="bold"
            fill={node.highlighted ? '#ffffff' : '#1e293b'}
          >
            {node.value}
          </text>
        </g>
      ))}

      {/* NULL pointer at end */}
      {state.nodes.length > 0 && (
        <text
          x={state.nodes[state.nodes.length - 1].x + nodeWidth / 2 + 20}
          y={state.nodes[state.nodes.length - 1].y}
          textAnchor="start"
          dominantBaseline="central"
          fontSize={12}
          fill="#64748b"
          fontStyle="italic"
        >
          null
        </text>
      )}
    </>
  );
}

export default DSVisualization;
