/**
 * constantVelocityPhysics.js
 * 
 * Pure functions for constant velocity physics simulations.
 * No DOM references are allowed in this file so that it remains testable in isolation.
 */

// Constants
export const TRACK_MIN = 0.0;     // cm
export const TRACK_MAX = 240.0;   // cm

export const VELOCITY_RED = 30.0;  // cm/s (Fast Car - responsive and fast)
export const VELOCITY_BLUE = 10.0; // cm/s (Slow Car)

/**
 * Calculates position given time, initial position, and velocity.
 * Formula: x(t) = x0 + v * t
 * 
 * @param {number} t - Time in seconds
 * @param {number} x0 - Initial position in cm
 * @param {number} v - Constant velocity in cm/s
 * @returns {number} Current position in cm
 */
export function calculatePosition(t, x0, v) {
  if (t < 0) return x0;
  return x0 + v * t;
}

/**
 * Checks if a car has reached or exceeded the track boundaries.
 * 
 * @param {number} x - Current position in cm
 * @param {number} v - Current velocity in cm/s
 * @returns {boolean} True if a boundary is reached
 */
export function isAtBoundary(x, v) {
  if (v > 0 && x >= TRACK_MAX) {
    return true;
  }
  if (v < 0 && x <= TRACK_MIN) {
    return true;
  }
  return false;
}

/**
 * Clamps position to track boundaries.
 * 
 * @param {number} x - Position in cm
 * @returns {number} Clamped position in cm
 */
export function clampPosition(x) {
  return Math.max(TRACK_MIN, Math.min(TRACK_MAX, x));
}

/**
 * Calculates the meeting point (time and position) of two moving cars analytically.
 * Formula: 
 * x1(t) = x0_1 + v1 * t
 * x2(t) = x0_2 + v2 * t
 * x1(t) = x2(t) => t = (x0_2 - x0_1) / (v1 - v2)
 * 
 * @param {number} x0_1 - Initial position of Car 1
 * @param {number} v1 - Velocity of Car 1
 * @param {number} x0_2 - Initial position of Car 2
 * @param {number} v2 - Velocity of Car 2
 * @returns {object|null} { time: number, position: number } or null if they don't meet
 */
export function calculateMeetingPoint(x0_1, v1, x0_2, v2) {
  const relativeVelocity = v1 - v2;
  if (Math.abs(relativeVelocity) < 1e-5) {
    return null; // Parallel paths, will never meet
  }
  
  const time = (x0_2 - x0_1) / relativeVelocity;
  
  // They only meet in the future (t >= 0)
  if (time < 0) {
    return null;
  }
  
  const position = x0_1 + v1 * time;
  
  // Make sure meeting position is within the track limits
  if (position < TRACK_MIN || position > TRACK_MAX) {
    return null;
  }
  
  return { time, position };
}

/**
 * Retrieves configuration details for the 6 standard lab groups.
 * 
 * @param {number} groupNum - Group number (1 to 6)
 * @returns {object|null} Config containing trial configurations or null
 */
export function getGroupConfig(groupNum) {
  const num = parseInt(groupNum, 10);
  if (isNaN(num) || num < 1 || num > 6) {
    return null;
  }
  
  // Trial configs map: 
  // Car colors: 'red' | 'blue'
  // v: positive for forward, negative for backward.
  switch (num) {
    case 1:
      return {
        group: 1,
        trial1: { color: 'red', x0: 0.0, v: VELOCITY_RED },
        trial2: { color: 'blue', x0: 210.0, v: -VELOCITY_BLUE }
      };
    case 2:
      return {
        group: 2,
        trial1: { color: 'blue', x0: 0.0, v: VELOCITY_BLUE },
        trial2: { color: 'blue', x0: 210.0, v: -VELOCITY_BLUE }
      };
    case 3:
      return {
        group: 3,
        trial1: { color: 'red', x0: 60.0, v: VELOCITY_RED },
        trial2: { color: 'blue', x0: 150.0, v: -VELOCITY_BLUE }
      };
    case 4:
      return {
        group: 4,
        trial1: { color: 'red', x0: 60.0, v: VELOCITY_RED },
        trial2: { color: 'red', x0: 150.0, v: -VELOCITY_RED }
      };
    case 5:
      return {
        group: 5,
        trial1: { color: 'blue', x0: 0.0, v: VELOCITY_BLUE },
        trial2: { color: 'red', x0: 210.0, v: -VELOCITY_RED }
      };
    case 6:
      return {
        group: 6,
        trial1: { color: 'blue', x0: 60.0, v: VELOCITY_BLUE },
        trial2: { color: 'red', x0: 210.0, v: -VELOCITY_RED }
      };
    default:
      return null;
  }
}

/**
 * Fits a line x = v * t + x0 to a set of data points (t, x) using linear regression.
 * 
 * @param {Array} points - Array of { t, x } points
 * @returns {object|null} { slope: number, intercept: number, r2: number } or null
 */
export function fitLinearRegression(points) {
  const validPoints = points.filter(p => p !== null && p !== undefined && !isNaN(p.t) && !isNaN(p.x));
  if (validPoints.length < 2) return null;
  
  let sumT = 0;
  let sumX = 0;
  let sumTX = 0;
  let sumTT = 0;
  let sumXX = 0;
  const n = validPoints.length;
  
  for (const p of validPoints) {
    sumT += p.t;
    sumX += p.x;
    sumTX += p.t * p.x;
    sumTT += p.t * p.t;
    sumXX += p.x * p.x;
  }
  
  const denominator = (n * sumTT - sumT * sumT);
  if (Math.abs(denominator) < 1e-6) return null; 
  
  const slope = (n * sumTX - sumT * sumX) / denominator;
  const intercept = (sumX - slope * sumT) / n;
  
  // Calculate R^2 (coefficient of determination)
  const meanX = sumX / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of validPoints) {
    const predictedX = slope * p.t + intercept;
    ssTot += (p.x - meanX) * (p.x - meanX);
    ssRes += (p.x - predictedX) * (p.x - predictedX);
  }
  
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - (ssRes / ssTot));
  
  return { slope, intercept, r2 };
}

/**
 * Calculates percent error between experimental value and theoretical value.
 * 
 * @param {number} exp - Experimental value
 * @param {number} theo - Theoretical value
 * @returns {number} Percent error (%)
 */
export function calculatePercentError(exp, theo) {
  if (Math.abs(theo) < 1e-5) return 0;
  return Math.abs((exp - theo) / theo) * 100;
}
