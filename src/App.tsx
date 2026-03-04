/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  Environment, 
  ContactShadows, 
  PerspectiveCamera, 
  useGLTF, 
  useTexture,
  Float,
  Html,
  MeshReflectorMaterial
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Info, RotateCcw, ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FluidInversionCursor } from "@/src/components/fluid-inversion-cursor";

const RING_DATA: Record<string, { name: string, description: string }> = {
  '000': { name: "Aether Band", description: "A ring forged from the essence of the morning sky, capturing the ethereal beauty of the first light." },
  '001': { name: "Obsidian Void", description: "Carved from a single piece of volcanic glass, this band holds the silent power of the earth's core." },
  '002': { name: "Solar Flare", description: "Infused with the warmth of a thousand suns, radiating an eternal glow of vitality and strength." },
  '003': { name: "Lunar Crest", description: "Reflects the silver light of the waning moon, a delicate piece for those who find peace in the night." },
  '004': { name: "Verdant Heart", description: "Grown from the roots of the world tree, this ring pulses with the ancient rhythm of the forest." },
  '005': { name: "Azure Depths", description: "Forged in the crushing pressure of the deep ocean, capturing the mysterious blue of the abyss." },
  '006': { name: "Crimson Ember", description: "Still glowing with the heat of the forge, a symbol of passion and unyielding spirit." },
  '007': { name: "Stellar Dust", description: "Composed of fragments from a dying star, a reminder of our cosmic origin and infinite potential." },
  '008': { name: "Glacial Frost", description: "Cold to the touch and never melting, carved from the oldest ice in the northern wastes." },
  '009': { name: "Golden Dawn", description: "A symbol of eternal hope and new beginnings, shining with the promise of a brighter future." },
  '010': { name: "Iron Will", description: "Forged for those who never falter, a heavy band of resilience and unwavering determination." },
};

const RING_IDS = Object.keys(RING_DATA);
const BASE_URL = 'https://pub-a56d70d158b1414d83c3856ea210601c.r2.dev/Ring/';

function Ring({ id, position, rotation, scale = 1, onSelect, isSelected }: { 
  id: string, 
  position: [number, number, number], 
  rotation?: [number, number, number],
  scale?: number,
  onSelect: (id: string) => void,
  isSelected: boolean
}) {
  const glbUrl = `${BASE_URL}${id}.glb`;
  const textureUrl = `${BASE_URL}${id}.jpg`;
  
  const { scene } = useGLTF(glbUrl);
  const texture = useTexture(textureUrl);
  
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const ringRef = useRef<THREE.Group>(null);
  const [rotationY, setRotationY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastPointerX = useRef(0);

  useFrame((state, delta) => {
    if (ringRef.current) {
      if (!isSelected) {
        ringRef.current.rotation.y += 0.003;
      } else if (!isDragging) {
        // Subtle idle rotation even when selected but not dragged
        ringRef.current.rotation.y += 0.001;
      }
    }
  });

  useMemo(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshPhysicalMaterial({
          map: texture,
          metalness: 0.8,
          roughness: 0.2,
          envMapIntensity: 0.8,
          clearcoat: 0.3,
          clearcoatRoughness: 0.2,
          reflectivity: 0.5,
          transmission: 0,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene, texture]);

  return (
    <group 
      ref={ringRef} 
      name={id}
      position={position} 
      rotation={rotation} 
      scale={isSelected ? scale * 1.8 : scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerDown={(e) => {
        if (isSelected) {
          e.stopPropagation();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setIsDragging(true);
          lastPointerX.current = e.clientX;
        }
      }}
      onPointerUp={(e) => {
        if (isSelected) {
          setIsDragging(false);
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (isSelected && isDragging && ringRef.current) {
          const deltaX = e.clientX - lastPointerX.current;
          ringRef.current.rotation.y += deltaX * 0.01;
          lastPointerX.current = e.clientX;
        }
      }}
    >
      <primitive object={scene.clone()} />
      
      {/* Warm forge light for every ring to simulate fire reflections */}
      <pointLight 
        intensity={isSelected ? 4 : 1.5} 
        distance={3} 
        color={id === '002' ? '#ff8800' : id === '006' ? '#ff4400' : '#ffaa44'} 
      />
      
      {/* Secondary rim light - changed to warm gold to avoid white washing */}
      <pointLight 
        position={[1, 1, 1]}
        intensity={isSelected ? 1 : 0.3}
        distance={2}
        color="#ffcc88"
      />

      {isSelected && (
        <Html distanceFactor={10} position={[0, 1.8, 0]} center>
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="bg-black/90 text-white px-6 py-3 rounded-2xl backdrop-blur-xl border border-white/10 shadow-2xl text-center min-w-[200px]">
              <h3 className="text-lg font-bold tracking-tight uppercase mb-1">{RING_DATA[id].name}</h3>
              <p className="text-[10px] text-white/50 uppercase tracking-widest leading-relaxed max-w-[180px] mx-auto">
                {RING_DATA[id].description}
              </p>
            </div>
          </motion.div>
        </Html>
      )}
    </group>
  );
}

function LavaIsland() {
  const { scene } = useGLTF('https://pub-a56d70d158b1414d83c3856ea210601c.r2.dev/Ring/LavaIsland.glb');
  return <primitive object={scene} position={[0, -1, 0]} scale={2.5} />;
}

function Scene({ selectedId, setSelectedId }: { selectedId: string | null, setSelectedId: (id: string | null) => void }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const ringsGroupRef = useRef<THREE.Group>(null);
  
  const isInteracting = useRef(false);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  
  // Adjusted for new scale
  const pedestalY = 0.8;
  const ringSpacing = 2.5;

  useFrame((state, delta) => {
    if (ringsGroupRef.current) {
      const targetX = selectedId ? -RING_IDS.indexOf(selectedId) * ringSpacing : 0;
      ringsGroupRef.current.position.x = THREE.MathUtils.lerp(ringsGroupRef.current.position.x, targetX, 0.1);
    }

    if (selectedId && ringsGroupRef.current) {
      const isMobile = state.size.width < 768;
      
      if (!isInteracting.current) {
        const targetCamPos = new THREE.Vector3(0, isMobile ? 1.5 : 1.2, isMobile ? 4 : 3);
        camera.position.lerp(targetCamPos, 0.05);
        
        if (controlsRef.current) {
          const lookTarget = new THREE.Vector3(0, pedestalY, 0);
          controlsRef.current.target.lerp(lookTarget, 0.1);
          controlsRef.current.update();
        }
      }

      if (spotLightRef.current) {
        spotLightRef.current.position.set(0, 3, 1);
        spotLightRef.current.target.position.set(0, pedestalY, 0);
      }
    } else {
      camera.position.lerp(new THREE.Vector3(0, 2, 6), 0.03);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(new THREE.Vector3(0, pedestalY, 0), 0.03);
        controlsRef.current.update();
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 2, 6]} fov={45} />
      <fog attach="fog" args={['#000000', 1, 15]} />
      <OrbitControls 
        ref={controlsRef}
        makeDefault 
        enablePan={false} 
        enableRotate={false}
        minDistance={0.5} 
        maxDistance={15}
        onStart={() => { isInteracting.current = true; }}
        onEnd={() => { isInteracting.current = false; }}
      />
      
      <Environment preset="sunset" />
      <ambientLight intensity={0.1} />
      
      <group>
        <pointLight position={[-5, 3, -5]} intensity={20} color="#ff4400" distance={20} />
        <pointLight position={[5, 1, 3]} intensity={15} color="#ff8800" distance={15} />
        <pointLight position={[0, -1, 5]} intensity={10} color="#ffaa44" distance={10} />
      </group>

      <directionalLight 
        position={[2, 5, 2]} 
        intensity={0.5} 
        castShadow 
      />
      
      <LavaIsland />

      <spotLight 
        ref={spotLightRef}
        angle={0.2} 
        penumbra={1} 
        intensity={selectedId ? 10 : 3} 
        castShadow 
        color="#ffffff"
      />

      <EffectComposer>
        <Bloom luminanceThreshold={1} mipmapBlur intensity={0.2} radius={0.4} />
        <Vignette eskil={false} offset={0.1} darkness={1.5} />
        <Noise opacity={0.02} />
      </EffectComposer>
      
      <group ref={ringsGroupRef}>
        {RING_IDS.map((id, index) => {
          const x = index * ringSpacing;
          const isSelected = selectedId === id;
          
          return (
            <Float 
              key={id} 
              speed={isSelected ? 0 : 2} 
              rotationIntensity={isSelected ? 0 : 0.5} 
              floatIntensity={isSelected ? 0 : 0.5}
              enabled={!isSelected}
            >
              <Ring 
                id={id} 
                position={[x, pedestalY + 0.2, 0]} 
                rotation={[0, 0, 0]}
                scale={isSelected ? 0.35 : 0.2}
                onSelect={setSelectedId}
                isSelected={isSelected}
              />
            </Float>
          );
        })}
      </group>
    </>
  );
}

export default function App() {
  const [view, setView] = useState<'intro' | 'gallery'>('intro');
  const [showButton, setShowButton] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (view === 'gallery' && !selectedId) {
      setSelectedId(RING_IDS[0]);
    }
  }, [view, selectedId]);

  const handleNext = () => {
    if (!selectedId) return;
    const currentIndex = RING_IDS.indexOf(selectedId);
    const nextIndex = (currentIndex + 1) % RING_IDS.length;
    setSelectedId(RING_IDS[nextIndex]);
  };

  const handlePrev = () => {
    if (!selectedId) return;
    const currentIndex = RING_IDS.indexOf(selectedId);
    const prevIndex = (currentIndex - 1 + RING_IDS.length) % RING_IDS.length;
    setSelectedId(RING_IDS[prevIndex]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  useEffect(() => {
    if (view === 'intro' && videoRef.current) {
      const video = videoRef.current;
      const handleEnded = () => {
        setShowButton(true);
      };
      video.addEventListener('ended', handleEnded);
      // If it loops, 'ended' might not fire how we want if we want it to play "one time" then show button
      // Let's use a timeout or check time
      const checkTime = () => {
        if (video.currentTime > video.duration - 0.5) {
          setShowButton(true);
          video.removeEventListener('timeupdate', checkTime);
        }
      };
      video.addEventListener('timeupdate', checkTime);

      return () => {
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('timeupdate', checkTime);
      };
    }
  }, [view]);

  return (
    <div className="relative w-full h-screen bg-[#050505] overflow-hidden font-sans text-white">
      <AnimatePresence mode="wait">
        {view === 'intro' ? (
          <motion.div 
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative w-full h-full"
          >
            <FluidInversionCursor className="w-full h-full">
              <div className="absolute inset-0 z-0 overflow-hidden">
                <video 
                  ref={videoRef}
                  src="https://pub-a56d70d158b1414d83c3856ea210601c.r2.dev/Ring/rings.mp4"
                  autoPlay 
                  muted 
                  loop 
                  playsInline
                  className="w-full h-full object-cover scale-105"
                />
                {/* Vignette */}
                <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,rgba(0,0,0,0.8)_100%)] pointer-events-none" />
              </div>

              <AnimatePresence>
                {showButton && (
                  <motion.button
                    key="enter-button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    onClick={() => setView('gallery')}
                    className="absolute z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-10 py-4 bg-white text-black font-bold rounded-full uppercase text-xs tracking-[0.3em] hover:bg-white/90 transition-all flex items-center gap-3 group"
                  >
                    Enter Forge
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </motion.button>
                )}
              </AnimatePresence>
            </FluidInversionCursor>
          </motion.div>
        ) : (
          <motion.div 
            key="gallery"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative w-full h-full"
          >
            {/* Header */}
            <header className="absolute top-0 left-0 w-full p-8 z-10 flex justify-end items-start pointer-events-none">
                <div className="flex gap-4 pointer-events-auto">
                  <button 
                    onClick={() => setSelectedId(null)}
                    className="p-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md group"
                    title="Reset View"
                  >
                    <RotateCcw size={18} className="group-hover:rotate-[-45deg] transition-transform" />
                  </button>
                </div>
              </header>

              {/* Main Scene */}
              <div className="w-full h-full">
                <Canvas shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}>
                  <Suspense fallback={null}>
                    <Scene selectedId={selectedId} setSelectedId={setSelectedId} />
                  </Suspense>
                </Canvas>
              </div>

              {/* Loading Overlay */}
              <Suspense fallback={
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#050505] z-50">
                  <Loader2 className="animate-spin mb-4 text-white/40" size={40} />
                  <p className="text-xs uppercase tracking-widest text-white/40">Loading Assets...</p>
                </div>
              }>
                {/* Empty suspense to trigger the fallback above */}
              </Suspense>

              {/* UI Controls / Info */}
              <AnimatePresence>
                {selectedId && (
                  <>
                    {/* Navigation Arrows */}
                    <div className="absolute inset-x-0 top-[30%] md:top-1/2 -translate-y-1/2 flex justify-between px-4 md:px-12 pointer-events-none z-30">
                      <motion.button
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        onClick={handlePrev}
                        className="p-3 md:p-4 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 transition-all pointer-events-auto group shadow-2xl"
                      >
                        <ChevronLeft size={24} className="md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
                      </motion.button>
                      <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        onClick={handleNext}
                        className="p-3 md:p-4 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 hover:bg-white/20 transition-all pointer-events-auto group shadow-2xl"
                      >
                        <ChevronRight size={24} className="md:w-8 md:h-8 group-hover:scale-110 transition-transform" />
                      </motion.button>
                    </div>

                    {/* Minimal Edge UI */}
                    <div className="absolute inset-0 pointer-events-none z-20">
                      {/* Top Left: Name */}
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="absolute top-12 left-12"
                      >
                        <h2 className="text-4xl font-light tracking-tighter opacity-80 uppercase">
                          {RING_DATA[selectedId].name}
                        </h2>
                        <p className="text-[9px] text-white/30 uppercase tracking-[0.4em] mt-1">
                          Artifact {selectedId}
                        </p>
                      </motion.div>

                      {/* Top Right: Exit */}
                      <motion.button
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        onClick={() => setSelectedId(null)}
                        className="absolute top-12 right-12 p-4 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all pointer-events-auto active:scale-90"
                      >
                        <X size={20} />
                      </motion.button>

                      {/* Bottom Center: Action */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6"
                      >
                        <p className="text-[9px] text-white/20 uppercase tracking-widest max-w-[200px] leading-relaxed">
                          {RING_DATA[selectedId].description.split('.')[0]}
                        </p>
                      </motion.div>
                    </div>
                </>
              )}
              </AnimatePresence>

              {/* Footer / Instructions */}
              <footer className="absolute bottom-8 left-8 z-10 pointer-events-none hidden md:block">
                <div className="flex items-center gap-3 text-white/30">
                  <Info size={14} />
                  <p className="text-[10px] uppercase tracking-widest">
                    Click a ring to inspect • Arrows to cycle • Drag to rotate • Right-click to pan • Scroll to zoom
                  </p>
                </div>
              </footer>

              {/* Background Atmosphere */}
              <div className="absolute inset-0 bg-radial from-white/[0.03] to-transparent pointer-events-none" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
