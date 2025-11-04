import { useState, useEffect, useRef, useCallback } from 'react';
import { Vehicle, Intersection, LightState, SimulationStats, Direction, LogEntry, WeatherCondition, VehicleType } from '../types';

const GRID_SIZE = 3;
const LANE_WIDTH = 50; // pixels
const INTERSECTION_SIZE = 100; // pixels
const CELL_SIZE = LANE_WIDTH * 2 + INTERSECTION_SIZE;

const TICKS_PER_SECOND = 10;
const INITIAL_LIGHT_DURATION = 2 * TICKS_PER_SECOND; // 2 seconds
const YELLOW_LIGHT_DURATION = 0.5 * TICKS_PER_SECOND; // 0.5 seconds

// Traffic Jam Detection Constants
const JAM_VEHICLE_THRESHOLD = 3; // Min vehicles to be considered a potential jam
const JAM_STOPPED_RATIO_THRESHOLD = 0.66; // Min ratio of stopped cars in the segment

// Collision Detection Constants
const COLLISION_FLASH_DURATION_TICKS = 1 * TICKS_PER_SECOND; // 1 second

// A* Pathfinding implementation
const findPath = (start: { gridX: number; gridY: number }, end: { gridX: number; gridY: number }): { gridX: number; gridY: number }[] => {
    const nodes = new Map<string, any>();
    const openSet = new Set<string>();
    const startKey = `${start.gridX},${start.gridY}`;
    const endKey = `${end.gridX},${end.gridY}`;

    nodes.set(startKey, {
        g: 0,
        h: Math.abs(start.gridX - end.gridX) + Math.abs(start.gridY - end.gridY),
        f: Math.abs(start.gridX - end.gridX) + Math.abs(start.gridY - end.gridY),
        parent: null,
    });
    openSet.add(startKey);

    while (openSet.size > 0) {
        let currentKey = openSet.values().next().value;
        for (const key of openSet) {
            if (nodes.get(key).f < nodes.get(currentKey).f) {
                currentKey = key;
            }
        }

        if (currentKey === endKey) {
            const path = [];
            let tempKey = currentKey;
            while (tempKey) {
                const [x, y] = tempKey.split(',').map(Number);
                path.unshift({ gridX: x, gridY: y });
                tempKey = nodes.get(tempKey).parent;
            }
            return path.slice(1);
        }

        openSet.delete(currentKey);
        const [currentX, currentY] = currentKey.split(',').map(Number);
        const currentNode = nodes.get(currentKey);

        const neighbors = [
            { gridX: currentX + 1, gridY: currentY },
            { gridX: currentX - 1, gridY: currentY },
            { gridX: currentX, gridY: currentY + 1 },
            { gridX: currentX, gridY: currentY - 1 },
        ].filter(n => n.gridX >= 0 && n.gridX < GRID_SIZE && n.gridY >= 0 && n.gridY < GRID_SIZE);

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.gridX},${neighbor.gridY}`;
            const gScore = currentNode.g + 1;
            const hScore = Math.abs(neighbor.gridX - end.gridX) + Math.abs(neighbor.gridY - end.gridY);
            const fScore = gScore + hScore;

            if (!nodes.has(neighborKey) || fScore < nodes.get(neighborKey).f) {
                nodes.set(neighborKey, { g: gScore, h: hScore, f: fScore, parent: currentKey });
                if (!openSet.has(neighborKey)) {
                    openSet.add(neighborKey);
                }
            }
        }
    }
    return []; // No path found
};


const useTrafficSimulation = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [weather, setWeather] = useState<WeatherCondition>('Clear');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [jammedSegments, setJammedSegments] = useState<string[]>([]);
  const [intersections, setIntersections] = useState<Intersection[]>(() =>
    Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
      id: i,
      lights: [
        { state: i % 2 === 0 ? LightState.GREEN : LightState.RED, timer: INITIAL_LIGHT_DURATION },
        { state: i % 2 === 0 ? LightState.GREEN : LightState.RED, timer: INITIAL_LIGHT_DURATION },
        { state: i % 2 === 0 ? LightState.RED : LightState.GREEN, timer: INITIAL_LIGHT_DURATION },
        { state: i % 2 === 0 ? LightState.RED : LightState.GREEN, timer: INITIAL_LIGHT_DURATION },
      ],
      manualOverride: false,
      emergencyOverrideFor: null,
    }))
  );
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<SimulationStats>({
    totalCars: 0,
    movingCars: 0,
    averageWaitTime: 0,
    emergencyActive: false,
    historicalWaitTime: [],
    trafficDensity: [],
    vehicleThroughput: 0,
    totalIdleTime: 0,
    sensorAccuracy: 100,
    vehicleCounts: { cars: 0, bikes: 0, buses: 0 },
  });

  const simulationTick = useRef(0);
  const vehicleIdCounter = useRef(0);
  const vehicleThroughput = useRef(0);
  const previousJams = useRef<string[]>([]);

  const addLog = useCallback((message: string, type: LogEntry['type']) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type }, ...prev].slice(0, 100));
  }, []);

  const handleSetWeather = useCallback((newWeather: WeatherCondition) => {
    setWeather(newWeather);
    addLog(`Weather changed to ${newWeather}.`, 'info');
  }, [addLog]);

  const updateLights = useCallback(() => {
    setIntersections(prev =>
      prev.map(intersection => {
        if (intersection.manualOverride) return intersection;

        if (intersection.emergencyOverrideFor) {
            const newLights = [...intersection.lights];
            const dir = intersection.emergencyOverrideFor;
            newLights[0].state = (dir === 'N' || dir === 'S') ? LightState.GREEN : LightState.RED;
            newLights[1].state = (dir === 'N' || dir === 'S') ? LightState.GREEN : LightState.RED;
            newLights[2].state = (dir === 'E' || dir === 'W') ? LightState.GREEN : LightState.RED;
            newLights[3].state = (dir === 'E' || dir === 'W') ? LightState.GREEN : LightState.RED;
            return {...intersection, lights: newLights as [any, any, any, any] };
        }

        const newLights = [...intersection.lights];
        let needsSwitch = false;
        
        newLights[0].timer--;
        if (newLights[0].timer <= 0) needsSwitch = true;
        
        for(let i=1; i<4; i++) {
          newLights[i].timer = newLights[0].timer;
        }

        if (needsSwitch) {
            const isNSGreen = newLights[0].state === LightState.GREEN;
            if (isNSGreen) {
                newLights[0].state = newLights[1].state = LightState.YELLOW;
                newLights[0].timer = newLights[1].timer = YELLOW_LIGHT_DURATION;
            } else {
                 newLights[2].state = newLights[3].state = LightState.YELLOW;
                 newLights[2].timer = newLights[3].timer = YELLOW_LIGHT_DURATION;
            }
        } else if (newLights[0].timer === INITIAL_LIGHT_DURATION - YELLOW_LIGHT_DURATION && newLights[0].state === LightState.YELLOW) {
            const wasNSGreen = newLights[2].state === LightState.RED; // Before yellow, one pair was green
            if(wasNSGreen){
                newLights[0].state = newLights[1].state = LightState.RED;
                newLights[2].state = newLights[3].state = LightState.GREEN;
            } else {
                newLights[0].state = newLights[1].state = LightState.GREEN;
                newLights[2].state = newLights[3].state = LightState.RED;
            }
            newLights.forEach(l => l.timer = INITIAL_LIGHT_DURATION);
        }

        return { ...intersection, lights: newLights as [any, any, any, any] };
      })
    );
  }, []);

  const spawnVehicle = useCallback(() => {
    if (vehicles.length > 50) return;
    const edge = Math.floor(Math.random() * 4);
    const position = Math.floor(Math.random() * GRID_SIZE);
    
    let x = 0, y = 0, direction: Direction = 'E';

    switch (edge) {
      case 0: // Top
        y = -20; x = position * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH / 2; direction = 'S';
        break;
      case 1: // Bottom
        y = GRID_SIZE * CELL_SIZE + 20; x = position * CELL_SIZE + INTERSECTION_SIZE / 2 - LANE_WIDTH / 2; direction = 'N';
        break;
      case 2: // Left
        x = -20; y = position * CELL_SIZE + INTERSECTION_SIZE / 2 - LANE_WIDTH / 2; direction = 'E';
        break;
      case 3: // Right
        x = GRID_SIZE * CELL_SIZE + 20; y = position * CELL_SIZE + INTERSECTION_SIZE / 2 + LANE_WIDTH / 2; direction = 'W';
        break;
    }

    const rand = Math.random();
    let type: VehicleType;
    let speed: number;

    if (rand < 0.7) {
        type = VehicleType.CAR;
        speed = 2 + Math.random() * 2; // 2-4
    } else if (rand < 0.9) {
        type = VehicleType.BIKE;
        speed = 3 + Math.random() * 2; // 3-5
    } else {
        type = VehicleType.BUS;
        speed = 1.5 + Math.random() * 1; // 1.5-2.5
    }
    
    const newVehicle: Vehicle = {
      id: vehicleIdCounter.current++,
      type, x, y, direction, speed,
      stopped: false,
      waitTime: 0,
      isEmergency: false,
    };
    setVehicles(prev => [...prev, newVehicle]);
  }, [vehicles.length]);

  const moveVehicles = useCallback((currentWeather: WeatherCondition) => {
    setVehicles(prevVehicles => {
      const getWeatherMultiplier = (vehicleType: VehicleType) => {
        switch (currentWeather) {
          case 'Rain':
            return vehicleType === VehicleType.BIKE ? 0.5 : 0.7;
          case 'Fog':
            return vehicleType === VehicleType.BIKE ? 0.3 : 0.4;
          case 'Clear':
          default:
            return 1.0;
        }
      };

      // 1. First pass: update positions and clear old collision flags
      let movedVehicles = prevVehicles.map(vehicle => {
        let newVehicle = { ...vehicle };

        // Clear old collision flag
        if (newVehicle.collisionTimestamp && simulationTick.current - newVehicle.collisionTimestamp > COLLISION_FLASH_DURATION_TICKS) {
            delete newVehicle.collisionTimestamp;
        }

        const gridX = Math.floor(newVehicle.x / CELL_SIZE);
        const gridY = Math.floor(newVehicle.y / CELL_SIZE);

        // Emergency vehicle routing
        if (newVehicle.isEmergency && newVehicle.path && newVehicle.path.length > 0) {
            const intersectionCenterX = gridX * CELL_SIZE + INTERSECTION_SIZE / 2;
            const intersectionCenterY = gridY * CELL_SIZE + INTERSECTION_SIZE / 2;
            const distToCenter = Math.hypot(newVehicle.x - intersectionCenterX, newVehicle.y - intersectionCenterY);

            if (distToCenter < 15) { // Close to center, decide next direction
                const currentPathNodeIndex = newVehicle.path.findIndex(p => p.gridX === gridX && p.gridY === gridY);
                if (currentPathNodeIndex !== -1 && currentPathNodeIndex + 1 < newVehicle.path.length) {
                    const nextNode = newVehicle.path[currentPathNodeIndex + 1];
                    const dx = nextNode.gridX - gridX;
                    const dy = nextNode.gridY - gridY;

                    if (dx > 0) newVehicle.direction = 'E';
                    else if (dx < 0) newVehicle.direction = 'W';
                    else if (dy > 0) newVehicle.direction = 'S';
                    else if (dy < 0) newVehicle.direction = 'N';
                } else if (newVehicle.path[0].gridX === newVehicle.destination?.gridX && newVehicle.path[0].gridY === newVehicle.destination?.gridY) {
                     // Reached destination
                }
            }
        }
        
        const isNearIntersection = (pos: number, dir: 'x' | 'y') => {
            const posInCell = pos % CELL_SIZE;
            if (dir === 'x') {
                return (newVehicle.direction === 'E' && posInCell > CELL_SIZE - INTERSECTION_SIZE - LANE_WIDTH-10 && posInCell < CELL_SIZE - INTERSECTION_SIZE - LANE_WIDTH) ||
                       (newVehicle.direction === 'W' && posInCell < INTERSECTION_SIZE + LANE_WIDTH && posInCell > INTERSECTION_SIZE + LANE_WIDTH-10);
            } else { // dir 'y'
                 return (newVehicle.direction === 'S' && posInCell > CELL_SIZE - INTERSECTION_SIZE - LANE_WIDTH-10 && posInCell < CELL_SIZE - INTERSECTION_SIZE - LANE_WIDTH) ||
                       (newVehicle.direction === 'N' && posInCell < INTERSECTION_SIZE + LANE_WIDTH && posInCell > INTERSECTION_SIZE + LANE_WIDTH-10);
            }
        };

        let stop = false;
        
        if (gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE) {
            if (isNearIntersection(newVehicle.x, 'x') || isNearIntersection(newVehicle.y, 'y')) {
                const intersection = intersections[gridY * GRID_SIZE + gridX];
                if(intersection){
                    const lightIndex = {'N': 0, 'S': 1, 'E': 2, 'W': 3}[newVehicle.direction];
                    const light = intersection.lights[lightIndex];
                    if (light.state === LightState.RED || light.state === LightState.YELLOW) {
                        stop = true;
                    }
                }
            }
        }
        
        if (!stop) {
            for (const otherVehicle of prevVehicles) {
                if (newVehicle.id === otherVehicle.id) continue;
                const dist = Math.hypot(newVehicle.x - otherVehicle.x, newVehicle.y - otherVehicle.y);
                const safetyDistance = newVehicle.type === VehicleType.BUS ? 30 : 20;
                if (dist < safetyDistance) {
                     if (newVehicle.direction === 'N' && newVehicle.y > otherVehicle.y) stop = true;
                     else if (newVehicle.direction === 'S' && newVehicle.y < otherVehicle.y) stop = true;
                     else if (newVehicle.direction === 'E' && newVehicle.x < otherVehicle.x) stop = true;
                     else if (newVehicle.direction === 'W' && newVehicle.x > otherVehicle.x) stop = true;
                     if(stop) break;
                }
            }
        }

        newVehicle.stopped = stop && !newVehicle.isEmergency;
        if(newVehicle.stopped) {
            newVehicle.waitTime += 1;
        } else {
            const weatherMultiplier = getWeatherMultiplier(newVehicle.type);
            const effectiveSpeed = newVehicle.speed * weatherMultiplier;
            switch (newVehicle.direction) {
                case 'N': newVehicle.y -= effectiveSpeed; break;
                case 'S': newVehicle.y += effectiveSpeed; break;
                case 'E': newVehicle.x += effectiveSpeed; break;
                case 'W': newVehicle.x -= effectiveSpeed; break;
            }
        }
        return newVehicle;
      });

      // 2. Second pass: detect collisions on the new positions
      const collidedThisTick = new Set<number>();
      for (let i = 0; i < movedVehicles.length; i++) {
        for (let j = i + 1; j < movedVehicles.length; j++) {
            const vehicleA = movedVehicles[i];
            const vehicleB = movedVehicles[j];

            if (collidedThisTick.has(vehicleA.id) || collidedThisTick.has(vehicleB.id)) {
                continue;
            }

            const dist = Math.hypot(vehicleA.x - vehicleB.x, vehicleB.y - vehicleA.y);
            const collisionThreshold = 15; // A bit more than half the length of a car

            if (dist < collisionThreshold) {
                // Collision detected!
                vehicleA.collisionTimestamp = simulationTick.current;
                vehicleB.collisionTimestamp = simulationTick.current;
                
                vehicleA.stopped = true;
                vehicleB.stopped = true;

                collidedThisTick.add(vehicleA.id);
                collidedThisTick.add(vehicleB.id);

                addLog(`Collision detected between vehicle #${vehicleA.id} and #${vehicleB.id}.`, 'warning');
            }
        }
      }

      const survivingVehicles = movedVehicles.filter(vehicle => vehicle.x > -50 && vehicle.x < GRID_SIZE * CELL_SIZE + 50 && vehicle.y > -50 && vehicle.y < GRID_SIZE * CELL_SIZE + 50);
      const exitedVehicleCount = movedVehicles.length - survivingVehicles.length;
      if (exitedVehicleCount > 0) {
        vehicleThroughput.current += exitedVehicleCount;
      }
      return survivingVehicles;
    });
  }, [intersections, addLog]);
  
  const detectJams = useCallback(() => {
    const newJammedSegments: string[] = [];

    // Check horizontal segments
    for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE - 1; j++) {
            const segmentId = `H-${i}-${j}`;
            const xMin = j * CELL_SIZE + INTERSECTION_SIZE;
            const xMax = (j + 1) * CELL_SIZE;
            const yMin = i * CELL_SIZE + INTERSECTION_SIZE / 2;
            const yMax = yMin + LANE_WIDTH * 2;

            const vehiclesInSegment = vehicles.filter(v => 
                v.x > xMin && v.x < xMax && v.y > yMin && v.y < yMax
            );

            if (vehiclesInSegment.length >= JAM_VEHICLE_THRESHOLD) {
                const stoppedCount = vehiclesInSegment.filter(v => v.stopped).length;
                if (stoppedCount / vehiclesInSegment.length >= JAM_STOPPED_RATIO_THRESHOLD) {
                    newJammedSegments.push(segmentId);
                }
            }
        }
    }

    // Check vertical segments
    for (let i = 0; i < GRID_SIZE - 1; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
            const segmentId = `V-${i}-${j}`;
            const xMin = j * CELL_SIZE + INTERSECTION_SIZE / 2;
            const xMax = xMin + LANE_WIDTH * 2;
            const yMin = i * CELL_SIZE + INTERSECTION_SIZE;
            const yMax = (i + 1) * CELL_SIZE;

            const vehiclesInSegment = vehicles.filter(v => 
                v.x > xMin && v.x < xMax && v.y > yMin && v.y < yMax
            );

            if (vehiclesInSegment.length >= JAM_VEHICLE_THRESHOLD) {
                const stoppedCount = vehiclesInSegment.filter(v => v.stopped).length;
                if (stoppedCount / vehiclesInSegment.length >= JAM_STOPPED_RATIO_THRESHOLD) {
                    newJammedSegments.push(segmentId);
                }
            }
        }
    }
    
    // Log new jams
    newJammedSegments.forEach(id => {
        if (!previousJams.current.includes(id)) {
            const readableId = id.replace('H', 'Horizontal').replace('V', 'Vertical');
            addLog(`High congestion detected in segment ${readableId}.`, 'warning');
        }
    });
    
    previousJams.current = newJammedSegments;
    setJammedSegments(newJammedSegments);

}, [vehicles, addLog]);

  const prioritizeEmergencyPath = useCallback(() => {
    const emergencyVehicle = vehicles.find(v => v.isEmergency);
    if (!emergencyVehicle || !emergencyVehicle.path) {
        setIntersections(prev => prev.map(i => i.emergencyOverrideFor ? { ...i, emergencyOverrideFor: null } : i));
        return;
    }

    const newOverrides = new Map<number, Direction>();
    const currentGridX = Math.floor(emergencyVehicle.x / CELL_SIZE);
    const currentGridY = Math.floor(emergencyVehicle.y / CELL_SIZE);

    const path = emergencyVehicle.path;
    const currentPathIndex = path.findIndex(p => p.gridX === currentGridX && p.gridY === currentGridY);
    
    // Prioritize next 2 intersections
    for (let i = currentPathIndex + 1; i < Math.min(path.length, currentPathIndex + 3); i++) {
        const intersectionNode = path[i];
        const intersectionId = intersectionNode.gridY * GRID_SIZE + intersectionNode.gridX;
        
        const prevNode = i > 0 ? path[i - 1] : { gridX: currentGridX, gridY: currentGridY };
        
        let approachDir: Direction = emergencyVehicle.direction;
        const dx = intersectionNode.gridX - prevNode.gridX;
        const dy = intersectionNode.gridY - prevNode.gridY;

        if (dx > 0) approachDir = 'E';
        else if (dx < 0) approachDir = 'W';
        else if (dy > 0) approachDir = 'S';
        else if (dy < 0) approachDir = 'N';

        newOverrides.set(intersectionId, approachDir);
    }

    setIntersections(prev => prev.map(i => ({
        ...i,
        emergencyOverrideFor: newOverrides.get(i.id) || null,
    })));

  }, [vehicles]);


  const updateStats = useCallback(() => {
      simulationTick.current++;
      const totalCars = vehicles.length;
      const movingCars = vehicles.filter(c => !c.stopped).length;
      const totalWaitTime = vehicles.reduce((acc, car) => acc + car.waitTime, 0);
      const totalIdleTime = vehicles.filter(c => c.stopped).reduce((acc, car) => acc + car.waitTime, 0);
      const averageWaitTime = totalCars > 0 ? totalWaitTime / totalCars / TICKS_PER_SECOND : 0;
      
      const vehicleCounts = {
        cars: vehicles.filter(v => v.type === VehicleType.CAR).length,
        bikes: vehicles.filter(v => v.type === VehicleType.BIKE).length,
        buses: vehicles.filter(v => v.type === VehicleType.BUS).length,
      };

      if(simulationTick.current % TICKS_PER_SECOND === 0) {
        setStats(prev => ({
          ...prev,
          historicalWaitTime: [...prev.historicalWaitTime, {time: simulationTick.current, wait: averageWaitTime}].slice(-50)
        }));
      }
      
      if(simulationTick.current % (TICKS_PER_SECOND / 2) === 0) { // Check for jams twice per second
        detectJams();
      }

      let sensorAccuracy = 100;
      let noiseFactor = 0;
      if (weather === 'Rain') {
          sensorAccuracy = 90;
          noiseFactor = 0.1;
      } else if (weather === 'Fog') {
          sensorAccuracy = 75;
          noiseFactor = 0.25;
      }

      const trafficDensity = Array.from({length: GRID_SIZE * GRID_SIZE}, (_, i) => {
        const intersectionX = (i % GRID_SIZE) * CELL_SIZE;
        const intersectionY = Math.floor(i / GRID_SIZE) * CELL_SIZE;
        let carsNear = vehicles.filter(c => Math.hypot(c.x - intersectionX, c.y - intersectionY) < CELL_SIZE).length;
        
        // Apply sensor noise
        if (noiseFactor > 0) {
            const noise = (Math.random() - 0.5) * 2 * noiseFactor * carsNear;
            carsNear = Math.max(0, Math.round(carsNear + noise));
        }

        return { name: `Int ${i+1}`, density: (carsNear / Math.max(1, vehicles.length)) * 100 };
      });

      setStats(prev => ({...prev, totalCars, movingCars, averageWaitTime, trafficDensity, vehicleThroughput: vehicleThroughput.current, totalIdleTime, vehicleCounts, sensorAccuracy}));
  }, [vehicles, weather, detectJams]);


  useEffect(() => {
    if (!isRunning) return;

    const TICK_INTERVAL_MS = 1000 / TICKS_PER_SECOND;
    const SPAWN_INTERVAL_S = 5;

    const interval = setInterval(() => {
      prioritizeEmergencyPath();
      updateLights();
      moveVehicles(weather);
      if (simulationTick.current % (SPAWN_INTERVAL_S * TICKS_PER_SECOND) === 0) {
        spawnVehicle();
      }
      updateStats();
    }, TICK_INTERVAL_MS / simulationSpeed);

    return () => clearInterval(interval);
  }, [isRunning, simulationSpeed, weather, updateLights, moveVehicles, spawnVehicle, updateStats, prioritizeEmergencyPath]);

  const handleToggleRun = () => {
    const newIsRunning = !isRunning;
    setIsRunning(newIsRunning);
    addLog(newIsRunning ? 'Simulation Started.' : 'Simulation Paused.', 'info');
  };
  
  const toggleEmergency = () => {
    const newEmergencyState = !stats.emergencyActive;
    setStats(prev => ({...prev, emergencyActive: newEmergencyState}));
    
    if (newEmergencyState) {
        addLog('Emergency Priority Activated!', 'emergency');
        setVehicles(prev => {
            if (prev.length > 0 && !prev.some(v => v.isEmergency)) {
                const newVehicles = [...prev];
                const randomIndex = Math.floor(Math.random() * newVehicles.length);
                const vehicle = newVehicles[randomIndex];
                
                const startGridX = Math.floor(vehicle.x / CELL_SIZE);
                const startGridY = Math.floor(vehicle.y / CELL_SIZE);

                // Choose a destination far away
                const destGridX = GRID_SIZE - 1 - startGridX;
                const destGridY = GRID_SIZE - 1 - startGridY;
                
                const path = findPath({ gridX: startGridX, gridY: startGridY }, { gridX: destGridX, gridY: destGridY });

                if (path.length > 0) {
                    vehicle.isEmergency = true;
                    vehicle.destination = { gridX: destGridX, gridY: destGridY };
                    vehicle.path = [{ gridX: startGridX, gridY: startGridY }, ...path];
                    addLog(`Route calculated for emergency vehicle #${vehicle.id}.`, 'emergency');
                } else {
                    addLog(`Could not calculate route for vehicle #${vehicle.id}.`, 'warning');
                }
                return newVehicles;
            }
            return prev;
        });
    } else {
        addLog('Emergency Priority Deactivated.', 'emergency');
        setVehicles(prev => prev.map(c => ({...c, isEmergency: false, path: undefined, destination: undefined })));
    }
  };

  const applyQuantumOptimization = () => {
    addLog('Quantum optimization triggered.', 'quantum');
  };

  const setLightStateManually = useCallback((intersectionId: number, direction: 'NS' | 'EW') => {
    addLog(`Manual override for Intersection ${intersectionId + 1}: ${direction} set to GREEN.`, 'warning');
    setIntersections(prev => 
        prev.map(int => {
            if (int.id === intersectionId) {
                const newLights = [...int.lights];
                if (direction === 'NS') {
                    newLights[0].state = LightState.GREEN;
                    newLights[1].state = LightState.GREEN;
                    newLights[2].state = LightState.RED;
                    newLights[3].state = LightState.RED;
                } else { // EW
                    newLights[0].state = LightState.RED;
                    newLights[1].state = LightState.RED;
                    newLights[2].state = LightState.GREEN;
                    newLights[3].state = LightState.GREEN;
                }
                newLights.forEach(l => l.timer = 999); // Prevent auto-switch
                return { ...int, lights: newLights as [any, any, any, any], manualOverride: true };
            }
            return int;
        })
    );
  }, [addLog]);

  const returnToAuto = useCallback((intersectionId: number) => {
    addLog(`Intersection ${intersectionId + 1} returned to automatic control.`, 'info');
    setIntersections(prev =>
        prev.map(int => {
            if (int.id === intersectionId) {
                const newLights = int.lights.map(l => ({ ...l, timer: INITIAL_LIGHT_DURATION }));
                return { ...int, manualOverride: false, lights: newLights as [any, any, any, any] };
            }
            return int;
        })
    );
  }, [addLog]);


  return { isRunning, setIsRunning: handleToggleRun, simulationSpeed, setSimulationSpeed, weather, setWeather: handleSetWeather, intersections, vehicles, stats, logs, toggleEmergency, applyQuantumOptimization, setLightStateManually, returnToAuto, jammedSegments };
};

export default useTrafficSimulation;
