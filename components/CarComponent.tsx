import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Vehicle, VehicleType } from '../types';

interface VehicleComponentProps {
    vehicle: Vehicle;
}

const SirenIndicator: React.FC = () => (
    <motion.div
        className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
        style={{ transform: 'translate(-50%, -50%)' }}
        animate={{
            backgroundColor: ["rgba(239, 68, 68, 1)", "rgba(59, 130, 246, 1)"],
            boxShadow: ["0 0 6px 2px rgba(239, 68, 68, 0.7)", "0 0 6px 2px rgba(59, 130, 246, 0.7)"],
        }}
        transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
        }}
    />
);

const VehicleComponent: React.FC<VehicleComponentProps> = ({ vehicle }) => {
    const [isHovered, setIsHovered] = useState(false);

    const rotation = {
        'N': -90,
        'S': 90,
        'E': 0,
        'W': 180
    }[vehicle.direction];
    
    let baseBgStyle: string;
    let baseBorderStyle: string;
    let sizeStyle: string;
    let baseShadow: string;
    
    switch (vehicle.type) {
        case VehicleType.CAR:
            sizeStyle = 'w-6 h-3 rounded-sm';
            baseBgStyle = 'bg-indigo-500';
            baseBorderStyle = 'border-indigo-300';
            baseShadow = '0 0 5px #6366f1';
            break;
        case VehicleType.BIKE:
            sizeStyle = 'w-2 h-2 rounded-full';
            baseBgStyle = 'bg-green-400';
            baseBorderStyle = 'border-green-200';
            baseShadow = '0 0 5px #4ade80';
            break;
        case VehicleType.BUS:
            sizeStyle = 'w-10 h-4 rounded';
            baseBgStyle = 'bg-yellow-500';
            baseBorderStyle = 'border-yellow-300';
            baseShadow = '0 0 5px #eab308';
            break;
    }

    const isCollision = !!vehicle.collisionTimestamp;
    const isEmergency = vehicle.isEmergency && !isCollision;

    let finalStyle = `${sizeStyle} ${baseBgStyle} ${baseBorderStyle}`;
    let animationClass = '';
    let finalShadow = baseShadow;

    if (isCollision) {
        finalStyle = `${sizeStyle} bg-red-500 border-red-300`;
        animationClass = 'animate-pulse';
        finalShadow = '0 0 10px #ef4444';
    } else if (isEmergency) {
        finalShadow = '0 0 12px #f87171'; // Give it a red glow
    }


    return (
        <div 
            className={`absolute border ${finalStyle} ${animationClass} transition-all duration-100 ease-linear`}
            style={{ 
                left: `${vehicle.x}px`, 
                top: `${vehicle.y}px`,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                boxShadow: finalShadow,
                zIndex: isHovered ? 10 : 1,
             }}
             onMouseEnter={() => setIsHovered(true)}
             onMouseLeave={() => setIsHovered(false)}
        >
            {isEmergency && <SirenIndicator />}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        className="absolute bottom-full mb-2 px-2 py-0.5 bg-black/80 text-white text-xs rounded-md whitespace-nowrap"
                        style={{
                            left: '50%',
                            transform: `translateX(-50%) rotate(${-rotation}deg)`,
                            transformOrigin: 'bottom center',
                        }}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        transition={{ duration: 0.2 }}
                    >
                        ID: {vehicle.id}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VehicleComponent;