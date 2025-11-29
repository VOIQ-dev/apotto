'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, N8AO, TiltShift2, Bloom } from '@react-three/postprocessing';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';

function Particles({ count = 200, mouse }: { count?: number; mouse: React.MutableRefObject<[number, number]> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const light = useRef<THREE.PointLight>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // Initial positions and velocities
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame(() => {
    if (!mesh.current) return;

    // Run through particles and update positions
    particles.forEach((particle, i) => {
      let { t } = particle;
      const { factor, speed, xFactor, yFactor, zFactor } = particle;
      
      // Time evolution
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);

      // Mouse influence smoothing (Antigravity effect)
      // Move particles slightly away from mouse or towards it based on z-depth
      particle.mx += (mouse.current[0] * 1000 - particle.mx) * 0.01;
      particle.my += (mouse.current[1] * 1000 - 100 - particle.my) * 0.01;

      dummy.position.set(
        (particle.mx / 10) * a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
        (particle.my / 10) * b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
        (particle.my / 10) * b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
      );
      
      // Scale based on z-position for depth effect
      const scale = Math.max(0.2, (s * 1.5) + 1);
      dummy.scale.set(scale, scale, scale);
      
      // Rotation
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

    return (
    <>
      <pointLight ref={light} distance={40} intensity={5} color="#10b981" />
      <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
        <dodecahedronGeometry args={[0.2, 0]} />
        <meshPhongMaterial color="#34d399" emissive="#064e3b" specular="#10b981" shininess={50} />
      </instancedMesh>
    </>
    );
}

function Scene() {
  const mouse = useRef<[number, number]>([0, 0]);

  // Track mouse position normalized (-1 to 1)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current = [
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      ];
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

  return (
    <>
      {/* Lighting setup for dramatic effect */}
      <ambientLight intensity={0.4} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
      
      {/* Environment map for reflections */}
      <Environment preset="city" />
      
      {/* Floating Particles System */}
      <Float speed={2} rotationIntensity={1} floatIntensity={1} floatingRange={[-2, 2]}>
        <Particles count={200} mouse={mouse} />
        <Particles count={150} mouse={mouse} /> {/* Layer 2 for depth */}
      </Float>

      {/* Post Processing Effects */}
      <EffectComposer enableNormalPass={false}>
        <N8AO distanceFalloff={1} aoRadius={2} intensity={2} />
        <Bloom luminanceThreshold={0.5} mipmapBlur intensity={0.8} radius={0.4} />
        <TiltShift2 blur={0.15} />
      </EffectComposer>
      
      {/* Background Gradients/Lights */}
      <Lightformer
        form="rect"
        intensity={1}
        position={[10, 5, -10]}
        scale={[10, 50, 1]}
        color="#10b981"
        onUpdate={(self) => self.lookAt(0, 0, 0)}
      />
    </>
  );
}

export function Background3D() {
    return (
    <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none bg-[#f8fafc]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 20], fov: 35, near: 1, far: 100 }}
        gl={{ antialias: false, alpha: true, stencil: false }}
      >
        <Scene />
      </Canvas>
      
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/10 to-white pointer-events-none" />
    </div>
    );
}
