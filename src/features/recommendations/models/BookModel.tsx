import { RoundedBox } from '@react-three/drei';

import { BOOK_COVER_ASPECT } from '../cover-artwork';
import { useRecommendationTexture } from '../create-cover-texture';
import type { RecommendationModelProps } from '../model-registry';
import { useBookTextures } from './book-textures';

export const BookModel = ({ item, onSelect }: RecommendationModelProps) => {
  const texture = useRecommendationTexture(item, BOOK_COVER_ASPECT);
  const { pages, spine, color, thickness } = useBookTextures(item, texture);
  const boardZ = thickness / 2 + 0.045;

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <mesh position={[0.025, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.96, 3.98, thickness]} />
        <meshStandardMaterial map={pages} roughness={0.94} />
      </mesh>
      {[-1, 1].map((side) => (
        <RoundedBox key={side} args={[3.12, 4.12, 0.075]} radius={0.025}
          smoothness={2} position={[0, 0, side * boardZ]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.64} />
        </RoundedBox>
      ))}
      <RoundedBox args={[0.15, 4.12, thickness + 0.15]} radius={0.035}
        smoothness={2} position={[-1.49, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.72} />
      </RoundedBox>
      <mesh position={[-1.568, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[thickness + 0.1, 4.06]} />
        <meshStandardMaterial map={spine} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, boardZ + 0.039]} castShadow receiveShadow>
        <planeGeometry args={[3.08, 4.08]} />
        <meshStandardMaterial key={texture?.uuid ?? 'pending'} map={texture ?? undefined}
          color="#ffffff" metalness={0} roughness={0.63} />
      </mesh>
      <mesh position={[-1.37, 0, boardZ + 0.041]}>
        <planeGeometry args={[0.022, 4]} />
        <meshStandardMaterial color={color} transparent opacity={0.32} roughness={0.9} />
      </mesh>
    </group>
  );
};
