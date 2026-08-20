import assert from 'node:assert';
import {
  calculatePosition,
  isAtBoundary,
  clampPosition,
  calculateMeetingPoint,
  getGroupConfig,
  fitLinearRegression,
  calculatePercentError,
  VELOCITY_RED,
  VELOCITY_BLUE,
  TRACK_MAX,
  TRACK_MIN
} from '../src/constantVelocityPhysics.js';

console.log('Running constantVelocityPhysics.js unit tests (Revised with Error Analysis)...\n');

// 1. Test calculatePosition
console.log('Test 1: calculatePosition');
assert.strictEqual(calculatePosition(0, 0, 15), 0);
assert.strictEqual(calculatePosition(2, 60, 15), 90);
assert.strictEqual(calculatePosition(10, 210, -5), 160);
assert.strictEqual(calculatePosition(-5, 100, 15), 100, 'Negative time should return initial position');
console.log('✓ calculatePosition passed');

// 2. Test isAtBoundary
console.log('\nTest 2: isAtBoundary');
assert.strictEqual(isAtBoundary(240, 15), true, 'Should be at boundary at TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(241, 15), true, 'Should be at boundary past TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(239, 15), false, 'Should not be at boundary before TRACK_MAX going forward');
assert.strictEqual(isAtBoundary(0, -15), true, 'Should be at boundary at TRACK_MIN going backward');
assert.strictEqual(isAtBoundary(-1, -15), true, 'Should be at boundary past TRACK_MIN going backward');
assert.strictEqual(isAtBoundary(1, -15), false, 'Should not be at boundary before TRACK_MIN going backward');
console.log('✓ isAtBoundary passed');

// 3. Test clampPosition
console.log('\nTest 3: clampPosition');
assert.strictEqual(clampPosition(-10), 0);
assert.strictEqual(clampPosition(250), 240);
assert.strictEqual(clampPosition(120), 120);
console.log('✓ clampPosition passed');

// 4. Test calculateMeetingPoint
console.log('\nTest 4: calculateMeetingPoint');
const meet1 = calculateMeetingPoint(0, 15, 210, -5);
assert.ok(meet1, 'Cars should meet');
assert.strictEqual(meet1.time, 10.5);
assert.strictEqual(meet1.position, 157.5);

const meet2 = calculateMeetingPoint(0, 5, 210, -5);
assert.ok(meet2);
assert.strictEqual(meet2.time, 21.0);
assert.strictEqual(meet2.position, 105.0);

const meet3 = calculateMeetingPoint(0, 10, 100, 10);
assert.strictEqual(meet3, null, 'Parallel cars should never meet');
console.log('✓ calculateMeetingPoint passed');

// 5. Test fitLinearRegression with scatter
console.log('\nTest 5: fitLinearRegression (with scatter / uncertainty)');
// Perfect line: x = 15 * t + 60
const points = [
  { t: 0.0, x: 60.0 },
  { t: 2.0, x: 90.0 },
  { t: 4.0, x: 120.0 }
];
const fit = fitLinearRegression(points);
assert.ok(fit);
assert.strictEqual(Math.round(fit.slope * 100) / 100, 15.0);
assert.strictEqual(Math.round(fit.intercept * 100) / 100, 60.0);
assert.strictEqual(fit.r2, 1.0);

// Line with human timing reaction noise: x ≈ 15 * t + 0
const noisyPoints = [
  { t: 0.08, x: 0.0 },
  { t: 2.15, x: 30.0 },
  { t: 3.95, x: 60.0 },
  { t: 6.10, x: 90.0 }
];
const noisyFit = fitLinearRegression(noisyPoints);
assert.ok(noisyFit);
assert.ok(noisyFit.slope > 14.0 && noisyFit.slope < 16.0, 'Slope should be close to 15 despite noise');
assert.ok(noisyFit.r2 > 0.99, 'R2 should be very high for constant velocity data');
console.log('✓ fitLinearRegression with uncertainty passed');

// 6. Test calculatePercentError
console.log('\nTest 6: calculatePercentError');
assert.strictEqual(calculatePercentError(14.7, 15.0).toFixed(2), '2.00');
assert.strictEqual(calculatePercentError(15.0, 15.0), 0);
console.log('✓ calculatePercentError passed');

// 7. Test getGroupConfig
console.log('\nTest 7: getGroupConfig');
const config1 = getGroupConfig(1);
assert.ok(config1);
assert.strictEqual(config1.group, 1);
assert.strictEqual(config1.trial1.color, 'red');
assert.strictEqual(config1.trial1.x0, 0);
assert.strictEqual(config1.trial1.v, VELOCITY_RED);
assert.strictEqual(config1.trial2.color, 'blue');
assert.strictEqual(config1.trial2.x0, 210);
assert.strictEqual(config1.trial2.v, -VELOCITY_BLUE);
console.log('✓ getGroupConfig passed');

console.log('\nAll tests completed successfully!');
