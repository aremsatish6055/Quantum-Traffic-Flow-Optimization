import React, { useState } from 'react';
import useTrafficSimulation from '../hooks/useTrafficSimulation';
import TrafficGrid from './TrafficGrid';
import ControlPanel from './ControlPanel';
import StatsPanel from './StatsPanel';
import QuantumOptimizerPanel from './QuantumOptimizerPanel';
import Header from './Header';
import { Intersection } from '../types';
import ManualOverridePanel from './ManualOverridePanel';
import LogPanel from './LogPanel';
import AdvancedSettingsPanel from './AdvancedSettingsPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from './icons/Icons';

// --- Start of inlined CameraFeedModal ---
interface CameraFeedModalProps {
    intersection: Intersection;
    onClose: () => void;
}

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

const modalVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 50 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } },
    exit: { opacity: 0, scale: 0.9, y: 50, transition: { duration: 0.2 } },
};

const CameraFeedModal: React.FC<CameraFeedModalProps> = ({ intersection, onClose }) => {
    // Fetch a new random, relevant image from Unsplash each time the modal opens.
    const imageUrl = `https://source.unsplash.com/random/800x600/?traffic,car,bike,street,night&sig=${intersection.id}_${new Date().getTime()}`;

    return (
        <motion.div
            key="backdrop"
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
            <motion.div
                key="modal"
                variants={modalVariants}
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className="relative bg-gray-900/80 border border-white/20 rounded-xl shadow-2xl w-full max-w-4xl"
            >
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-xl font-bold text-indigo-300">
                        Intersection {intersection.id + 1} - Live Feed
                    </h2>
                    <motion.button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                        whileHover={{ scale: 1.2, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                    >
                        <XIcon />
                    </motion.button>
                </div>
                <div className="p-4 bg-black">
                    <div className="w-full aspect-[16/9] relative overflow-hidden rounded-md bg-gray-900">
                        <img
                            src={imageUrl}
                            alt={`Simulated camera feed for intersection ${intersection.id + 1}`}
                            className="w-full h-full object-cover"
                            style={{ filter: 'brightness(0.7) contrast(1.2) saturate(0.8)' }}
                        />
                        <div className="absolute top-2 left-2 bg-red-600/80 text-white text-xs font-mono px-2 py-0.5 rounded flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
                            <span>REC</span>
                        </div>
                        <div className="absolute bottom-2 right-2 text-white/50 text-xs font-mono">
                            CAM-0{intersection.id + 1}
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
// --- End of inlined CameraFeedModal ---


const Dashboard: React.FC = () => {
    const { 
        isRunning, 
        setIsRunning,
        simulationSpeed,
        setSimulationSpeed,
        weather,
        setWeather,
        intersections, 
        vehicles, 
        stats,
        logs, 
        toggleEmergency, 
        applyQuantumOptimization,
        setLightStateManually,
        returnToAuto,
        jammedSegments
    } = useTrafficSimulation();

    const [selectedIntersection, setSelectedIntersection] = useState<Intersection | null>(null);
    const [cameraIntersection, setCameraIntersection] = useState<Intersection | null>(null);
    const [showDensityMap, setShowDensityMap] = useState(true);

    const handleIntersectionClick = (intersection: Intersection) => {
        setSelectedIntersection(intersection);
    };

    const handleCameraClick = (intersection: Intersection) => {
        setCameraIntersection(intersection);
    };

    return (
        <div className="flex flex-col h-screen p-4 gap-4">
            <Header />
            <div className="grid grid-cols-1 lg:grid-cols-4 grid-rows-3 lg:grid-rows-1 gap-4 flex-grow min-h-0">
                <div className="lg:col-span-3 lg:row-span-1 row-span-2 flex flex-col gap-4">
                   <TrafficGrid 
                        intersections={intersections} 
                        vehicles={vehicles} 
                        onIntersectionClick={handleIntersectionClick}
                        onCameraClick={handleCameraClick}
                        trafficDensity={stats.trafficDensity}
                        showDensityMap={showDensityMap}
                        weather={weather}
                        jammedSegments={jammedSegments}
                    />
                </div>
                <div className="lg:col-span-1 lg:row-span-1 row-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
                    <ControlPanel 
                        isRunning={isRunning} 
                        onToggleRun={setIsRunning}
                        emergencyActive={stats.emergencyActive}
                        onToggleEmergency={toggleEmergency}
                        simulationSpeed={simulationSpeed}
                        onSetSpeed={setSimulationSpeed}
                        showDensityMap={showDensityMap}
                        onToggleDensityMap={() => setShowDensityMap(prev => !prev)}
                    />
                    {selectedIntersection && (
                        <ManualOverridePanel
                            intersection={selectedIntersection}
                            onOverride={setLightStateManually}
                            onReturnToAuto={returnToAuto}
                            onClose={() => setSelectedIntersection(null)}
                        />
                    )}
                    <AdvancedSettingsPanel
                        currentWeather={weather}
                        onSetWeather={setWeather}
                    />
                    <StatsPanel stats={stats} />
                    <QuantumOptimizerPanel stats={stats} onOptimize={applyQuantumOptimization}/>
                    <LogPanel logs={logs} />
                </div>
            </div>
            <AnimatePresence>
                {cameraIntersection && (
                    <CameraFeedModal
                        intersection={cameraIntersection}
                        onClose={() => setCameraIntersection(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Dashboard;