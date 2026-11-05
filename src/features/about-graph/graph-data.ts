export const branches = [
  { id: 'music', label: '音乐', color: '#7062d9', angle: -3 * Math.PI / 4 },
  { id: 'coding', label: '编程', color: '#387ea3', angle: -Math.PI / 4 },
  { id: 'anime', label: '二次元', color: '#b76290', angle: 3 * Math.PI / 4 },
  { id: 'games', label: '游戏', color: '#a57b3e', angle: Math.PI / 4 },
] as const;

export type BranchId = (typeof branches)[number]['id'];
export type GraphNode = {
  id: string;
  label: string;
  parentId: string | null;
  branch: BranchId | null;
  appearance?: 'artwork' | 'detail' | 'concept';
  navigation?: boolean;
  links?: readonly { label: string; href: string }[];
};

export const coreNodes: readonly GraphNode[] = [
  { id: 'concept-existentialism', label: '存在主义', parentId: 'atomsh', branch: null, appearance: 'concept' },
  { id: 'concept-philosophy', label: '哲学', parentId: 'atomsh', branch: null, appearance: 'concept' },
];

export const graphNodes: readonly GraphNode[] = [
  { id: 'atomsh', label: 'AtomsH', parentId: null, branch: null,
    links: [{ label: 'GitHub ↗', href: 'https://github.com/AtomsH4' }, { label: 'Cnblogs ↗', href: 'https://www.cnblogs.com/atomsh' }] },
  { id: 'music', label: '音乐', parentId: 'atomsh', branch: 'music', links: [{ label: '音乐推荐 →', href: '/recommendations/' }] },
  { id: 'music-rnb', label: 'R&B', parentId: 'music', branch: 'music' },
  { id: 'music-rock', label: '摇滚', parentId: 'music', branch: 'music' },
  { id: 'music-pop', label: '流行', parentId: 'music', branch: 'music' },
  { id: 'coding', label: '编程', parentId: 'atomsh', branch: 'coding' },
  { id: 'coding-stack', label: '技术栈', parentId: 'coding', branch: 'coding' },
  { id: 'coding-projects', label: '项目', parentId: 'coding', branch: 'coding', navigation: true, links: [{ label: '查看项目博客', href: '/blog/' }] },
  { id: 'coding-algorithms', label: '算法', parentId: 'coding', branch: 'coding', navigation: true, links: [{ label: '查看算法笔记', href: '/notes/' }] },
  { id: 'coding-deep-learning', label: '深度学习', parentId: 'coding', branch: 'coding' },
  { id: 'coding-acm', label: 'ACM', parentId: 'coding', branch: 'coding', links: [{ label: '算法与题解 →', href: '/notes/' }] },
  { id: 'project-cherry', label: 'Cherry Studio', parentId: 'coding-projects', branch: 'coding', links: [{ label: '浏览项目 →', href: '/projects/' }, { label: 'GitHub ↗', href: 'https://github.com/CherryHQ/cherry-studio' }] },
  { id: 'stack-react', label: 'React', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'stack-python', label: 'Python', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'stack-electron', label: 'Electron', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'stack-nodejs', label: 'NodeJS', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'stack-mysql', label: 'MySQL', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'stack-cpp', label: 'C++', parentId: 'coding-stack', branch: 'coding', appearance: 'detail' },
  { id: 'acm-graph', label: '图论', parentId: 'coding-acm', branch: 'coding', appearance: 'detail', links: [{ label: '图论笔记 →', href: '/notes/acwing-maze-path/' }] },
  { id: 'acm-number-theory', label: '数论', parentId: 'coding-acm', branch: 'coding', appearance: 'detail' },
  { id: 'acm-data-structures', label: '数据结构', parentId: 'coding-acm', branch: 'coding', appearance: 'detail' },
  { id: 'acm-dp', label: '动态规划', parentId: 'coding-acm', branch: 'coding', appearance: 'detail', links: [{ label: '动态规划笔记 →', href: '/notes/acwing-mondrian/' }] },
  { id: 'anime', label: '二次元', parentId: 'atomsh', branch: 'anime' },
  { id: 'anime-k-on', label: 'K-ON!', parentId: 'anime', branch: 'anime', appearance: 'artwork' },
  { id: 'anime-eva', label: 'Eva', parentId: 'anime', branch: 'anime', appearance: 'artwork', links: [{ label: '查看推荐 →', href: '/recommendations/#neon-genesis-evangelion' }] },
  { id: 'anime-deep-sea', label: '深海', parentId: 'anime', branch: 'anime', appearance: 'artwork' },
  { id: 'games', label: '游戏', parentId: 'atomsh', branch: 'games' },
  { id: 'games-red-dead', label: '荒野大镖客2', parentId: 'games', branch: 'games', appearance: 'artwork' },
  { id: 'games-disco-elysium', label: '极乐迪斯科', parentId: 'games', branch: 'games', appearance: 'artwork' },
  ...coreNodes,
];

export const defaultExpandedIds: readonly string[] = [...branches.map(b => b.id), 'coding-projects'];
export type GraphRelation = { id: string; sourceId: string; targetId: string; label: string };
export const graphRelations: readonly GraphRelation[] = [
  { id: 'after-school', sourceId: 'anime-k-on', targetId: 'music', label: 'After-school band' },
  { id: 'existentialism-eva', sourceId: 'concept-existentialism', targetId: 'anime-eva', label: 'Self and existence' },
  { id: 'philosophy-existentialism', sourceId: 'concept-philosophy', targetId: 'concept-existentialism', label: 'Existence' },
  { id: 'philosophy-disco', sourceId: 'concept-philosophy', targetId: 'games-disco-elysium', label: 'Choice and reflection' },
  { id: 'algorithms-acm', sourceId: 'coding-algorithms', targetId: 'coding-acm', label: '算法与竞赛' },
];

export const getChildren = (id: string, nodes = graphNodes) => nodes.filter(n => n.parentId === id);

export function getNodePath(id: string, nodes = graphNodes): GraphNode[] {
  const path: GraphNode[] = [];
  const seen = new Set<string>();
  let current = nodes.find(n => n.id === id);
  if (!current) return path;
  while (current) {
    if (seen.has(current.id)) throw new Error('Graph contains a cycle');
    seen.add(current.id);
    path.unshift(current);
    if (!current.parentId) break;
    const parent = nodes.find(n => n.id === current!.parentId);
    if (!parent) throw new Error(`Missing parent for ${current.id}`);
    current = parent;
  }
  return path;
}

export function getVisibleNodes(compact: boolean, expanded: ReadonlySet<string>, focusedId: string | null, nodes = graphNodes) {
  if (compact) {
    const focus = focusedId && nodes.some(n => n.id === focusedId) ? focusedId : 'atomsh';
    const visibleIds = new Set([...getNodePath(focus, nodes), ...getChildren(focus, nodes)].map(n => n.id));
    return nodes.filter(n => visibleIds.has(n.id));
  }
  return nodes.filter(n => getNodePath(n.id, nodes).slice(0, -1).every(parent => parent.id === 'atomsh' || expanded.has(parent.id)));
}
