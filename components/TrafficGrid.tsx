import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Intersection, Vehicle, WeatherCondition } from '../types';
import IntersectionComponent from './IntersectionComponent';
import VehicleComponent from './CarComponent';
import DensityOverlay from './DensityOverlay';
import BuildingComponent from './BuildingComponent';
import WeatherOverlay from './WeatherOverlay';

interface TrafficGridProps {
  intersections: Intersection[];
  vehicles: Vehicle[];
  onIntersectionClick: (intersection: Intersection) => void;
  onCameraClick: (intersection: Intersection) => void;
  trafficDensity: { name: string; density: number }[];
  showDensityMap: boolean;
  weather: WeatherCondition;
  jammedSegments: string[];
}

const GRID_SIZE = 3;
const LANE_WIDTH = 50;
const INTERSECTION_SIZE = 100;
const CELL_SIZE = LANE_WIDTH * 2 + INTERSECTION_SIZE;

const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: {
            delayChildren: 0.3,
            staggerChildren: 0.2
        }
    }
};

const StreetLabel: React.FC<{ text: string; position: 'top' | 'left'; index: number }> = ({ text, position, index }) => {
    const style: React.CSSProperties = {
        position: 'absolute',
        color: 'rgba(255, 255, 255, 0.4)',
        fontSize: '10px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        userSelect: 'none',
    };
    if (position === 'top') {
        style.left = `${index * CELL_SIZE + INTERSECTION_SIZE / 2}px`;
        style.top = `-20px`;
        style.width = `${LANE_WIDTH * 2}px`;
        style.textAlign = 'center';
    } else {
        style.top = `${index * CELL_SIZE + INTERSECTION_SIZE / 2}px`;
        style.left = `-45px`;
        style.width = `${LANE_WIDTH * 2}px`;
        style.textAlign = 'center';
        style.transform = 'translateY(-50%) rotate(-90deg)';
    }
    return <div style={style}>{text}</div>;
};

const LaneArrow: React.FC<{ x: number, y: number, rotation: number, delay: number }> = ({ x, y, rotation, delay }) => (
    <motion.div
        className="absolute text-white/20 pointer-events-none"
        style={{
            left: `${x}px`,
            top: `${y}px`,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay, duration: 0.5 }}
    >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l8 16H4z" />
        </svg>
    </motion.div>
);

const JamIndicator: React.FC<{ x: number; y: number; width: number; height: number; }> = ({ x, y, width, height }) => {
    return (
        <motion.div
            className="absolute bg-red-600 rounded-md pointer-events-none"
            style={{ left: x, top: y, width, height }}
            initial={{ opacity: 0 }}
            animate={{
                opacity: [0.4, 0.7, 0.4],
                transition: {
                    duration: 2.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                }
            }}
            exit={{ opacity: 0 }}
        />
    );
};


const TrafficGrid: React.FC<TrafficGridProps> = ({ intersections, vehicles, onIntersectionClick, onCameraClick, trafficDensity, showDensityMap, weather, jammedSegments }) => {
    const buildingSize = LANE_WIDTH * 2;

    return (
        <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="relative bg-black/30 backdrop-blur-sm p-4 pl-12 pt-8 rounded-xl shadow-lg border border-white/10 flex-grow w-full h-full overflow-hidden"
        >
            <div className="absolute inset-0 bg-grid-gray-700/20 [background-size:20px_20px]"></div>
            <div className="relative w-full h-full" style={{minWidth: `${GRID_SIZE * CELL_SIZE}px`, minHeight: `${GRID_SIZE * CELL_SIZE}px`}}>
                {/* Street Labels */}
                {Array.from({ length: GRID_SIZE }).map((_, i) => (
                    <React.Fragment key={`label-${i}`}>
                        <StreetLabel text={`${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : 'rd'} Ave`} position="top" index={i} />
                        <StreetLabel text={`${String.fromCharCode(65 + i)} St`} position="left" index={i} />
                    </React.Fragment>
                ))}

                {/* Buildings */}
                {Array.from({ length: GRID_SIZE -1 }).map((_, row) =>
                    Array.from({ length: GRID_SIZE - 1 }).map((_, col) => (
                        <BuildingComponent
                            key={`building-${row}-${col}`}
                            x={col * CELL_SIZE + INTERSECTION_SIZE}
                            y={row * CELL_SIZE + INTERSECTION_SIZE}
                            size={buildingSize}
                            delay={0.5 + (row * (GRID_SIZE-1) + col) * 0.05}
                        />
                    ))
                )}


                {/* Roads */}
                {Array.from({ length: GRID_SIZE }).map((_, i) => (
                    <React.Fragment key={`road-${i}`}>
                        {/* Vertical Road */}
                        <div 
                            className="absolute bg-gray-700"
                            style={{ 
                                left: `${i * CELL_SIZE + INTERSECTION_SIZE/2}px`, 
                                top: 0, 
                                width: `${LANE_WIDTH * 2}px`, 
                                height: '100%' 
                            }}
                        />
                         {/* Horizontal Road */}
                        <div 
                            className="absolute bg-gray-700"
                            style={{ 
                                top: `${i * CELL_SIZE + INTERSECTION_SIZE/2}px`, 
                                left: 0, 
                                height: `${LANE_WIDTH * 2}px`, 
                                width: '100%' 
                            }}
                        />
                    </React.Fragment>
                ))}

                {/* Jam Indicators */}
                <AnimatePresence>
                {jammedSegments.map(segmentId => {
                    const parts = segmentId.split('-');
                    const type = parts[0];
                    const row = parseInt(parts[1], 10);
                    const col = parseInt(parts[2], 10);
                    
                    let x, y, width, height;

                    if (type === 'H') { // Horizontal segment
                        x = col * CELL_SIZE + INTERSECTION_SIZE;
                        y = row * CELL_SIZE + INTERSECTION_SIZE / 2;
                        width = buildingSize;
                        height = LANE_WIDTH * 2;
                    } else { // Vertical segment
                        x = col * CELL_SIZE + INTERSECTION_SIZE / 2;
                        y = row * CELL_SIZE + INTERSECTION_SIZE;
                        width = LANE_WIDTH * 2;
                        height = buildingSize;
                    }

                    return <JamIndicator key={segmentId} x={x} y={y} width={width} height={height} />;
                })}
                </AnimatePresence>

                {/* Lane Direction Indicators */}
                {Array.from({ length: GRID_SIZE }).map((_, row) =>
                    Array.from({ length: GRID_SIZE }).map((_, col) => {
                        const baseDelay = 1.0;
                        const stagger = 0.02;
                        const delay = baseDelay + (row * GRID_SIZE + col) * stagger;
                        
                        // Horizontal arrows
                        const x_h = col * CELL_SIZE + INTERSECTION_SIZE + LANE_WIDTH;
                        const y_e = row * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH / 2; // Eastbound
                        const y_w = row * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH * 1.5; // Westbound

                        // Vertical arrows
                        const y_v = row * CELL_SIZE + INTERSECTION_SIZE + LANE_WIDTH;
                        const x_s = col * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH / 2; // Southbound
                        const x_n = col * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH * 1.5; // Northbound
                        
                        return (
                            <React.Fragment key={`arrows-${row}-${col}`}>
                                {/* Eastbound Arrow (points right) */}
                                <LaneArrow x={x_h} y={y_e} rotation={90} delay={delay} />
                                {/* Westbound Arrow (points left) */}
                                <LaneArrow x={x_h} y={y_w} rotation={-90} delay={delay} />
                                {/* Southbound Arrow (points down) */}
                                <LaneArrow x={x_s} y={y_v} rotation={180} delay={delay} />
                                {/* Northbound Arrow (points up) */}
                                <LaneArrow x={x_n} y={y_v} rotation={0} delay={delay} />
                            </React.Fragment>
                        );
                    })
                )}

                {showDensityMap && <DensityOverlay trafficDensity={trafficDensity} />}

                {intersections.map((intersection, i) => {
                    const x = i % GRID_SIZE;
                    const y = Math.floor(i / GRID_SIZE);
                    return (
                        <IntersectionComponent 
                            key={intersection.id} 
                            intersection={intersection}
                            x={x * CELL_SIZE}
                            y={y * CELL_SIZE}
                            onClick={() => onIntersectionClick(intersection)}
                            onCameraClick={() => onCameraClick(intersection)}
                        />
                    );
                })}

                {vehicles.map(vehicle => (
                    <VehicleComponent key={vehicle.id} vehicle={vehicle} />
                ))}

                <WeatherOverlay weather={weather} />
            </div>
        </motion.div>
    );
};

export default TrafficGrid;
