import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

import { useRecommendationTexture } from '../create-cover-texture';
import type { RecommendationModelProps } from '../model-registry';

export const DiscModel = ({ item, active, onSelect }: RecommendationModelProps) => {
  const texture = useRecommendationTexture(item);
  const silver = active ? '#e4e8eb' : '#c7ccd1';

  return (
    <group onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <group position={[1.08, 0.06, 0]} rotation={[0, 0, -0.14]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[1.66, 1.66, 0.065, 96, 1, true]} />
          <meshPhysicalMaterial color={silver} metalness={0.95} roughness={0.16} />
        </mesh>
        <mesh position={[0, 0, 0.034]} castShadow>
          <ringGeometry args={[0.22, 1.66, 96]} />
          <meshPhysicalMaterial color={silver} metalness={0.92} roughness={0.19}
            iridescence={0.8} iridescenceThicknessRange={[160, 420]} envMapIntensity={1.35} />
        </mesh>
        <mesh position={[0, 0, 0.036]}>
          <ringGeometry args={[0.45, 1.47, 96]} />
          <meshPhysicalMaterial key={texture?.uuid ?? 'pending'} map={texture ?? undefined}
            color="#ffffff" metalness={0} roughness={0.48} clearcoat={0.4} clearcoatRoughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.039]}>
          <ringGeometry args={[0.22, 0.43, 64]} />
          <meshPhysicalMaterial color="#e8eef0" metalness={0} roughness={0.15}
            clearcoat={1} transparent opacity={0.62} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, 0.041]}>
          <ringGeometry args={[0.38, 0.395, 64]} />
          <meshStandardMaterial color="#a4afb4" metalness={0.75} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 0.038]}>
          <ringGeometry args={[1.59, 1.6, 96]} />
          <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, -0.034]} rotation={[0, Math.PI, 0]} castShadow>
          <ringGeometry args={[0.22, 1.66, 96]} />
          <meshPhysicalMaterial color={silver} metalness={0.94} roughness={0.2} iridescence={0.75} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.065, 48, 1, true]} />
          <meshStandardMaterial color="#a0a9ae" metalness={0.6} roughness={0.25} side={THREE.BackSide} />
        </mesh>
      </group>
      <RoundedBox args={[3.4, 3.4, 0.14]} radius={0.035} smoothness={2}
        position={[-0.65, 0, 0.13]} castShadow receiveShadow>
        <meshStandardMaterial color="#d9d0bf" roughness={0.88} />
      </RoundedBox>
      <mesh position={[-0.65, 0, 0.202]} castShadow receiveShadow>
        <planeGeometry args={[3.34, 3.34]} />
        <meshStandardMaterial key={texture?.uuid ?? 'pending'} map={texture ?? undefined}
          color="#ffffff" metalness={0} roughness={0.66} />
      </mesh>
      <mesh position={[-2.31, 0, 0.205]}>
        <planeGeometry args={[0.022, 3.31]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.23} />
      </mesh>
    </group>
  );
};
