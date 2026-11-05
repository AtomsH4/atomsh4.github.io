import type { GraphNode } from './graph-data';

export type NodeImage = { src: string; alt: string; fallback?: string; sourceUrl?: string; credit?: string };
type Presentation = { image?: NodeImage };
const photo = (name: string, alt: string): NodeImage => ({ src: `/media/about-graph/${name}.jpg`, alt });
const presentations: Record<string, Presentation> = {
  'anime-k-on': { image: photo('k-on', 'K-ON! 角色合影') },
  'anime-eva': { image: photo('eva', 'Eva 海边角色群像') },
  'anime-deep-sea': { image: {
    src: '/media/about-graph/deep-sea-ocean.jpg',
    alt: '《深海》海上落日、彩色海浪与航行的船',
    sourceUrl: 'https://2023.slashfilmfestival.com/en/films-2023/deep-sea/',
    credit: 'Deep Sea / SLASH Filmfestival 2023',
  } },
  'games-red-dead': { image: photo('red-dead-redemption-2', '荒野大镖客2 亚瑟·摩根宣传图') },
  'games-disco-elysium': { image: photo('disco-elysium', '极乐迪斯科城市与骑马雕像画面') },
};

export const getNodePresentation = (node: GraphNode): Presentation => presentations[node.id] ?? {};

export const canPreviewNode = (id: string) => !!presentations[id]?.image;
