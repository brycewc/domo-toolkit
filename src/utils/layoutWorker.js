import dagre from '@dagrejs/dagre';

self.onmessage = ({ data: { edges, nodes, options } }) => {
  const g = new dagre.graphlib.Graph();
  g.setGraph(options);
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    g.setNode(node.id, { height: node.height, width: node.width });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions = {};
  for (const node of nodes) {
    const info = g.node(node.id);
    if (info) {
      positions[node.id] = {
        height: info.height,
        x: info.x - node.width / 2,
        y: info.y - info.height / 2
      };
    }
  }

  self.postMessage({ positions });
};
