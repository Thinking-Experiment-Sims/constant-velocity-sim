import assert from 'node:assert';
import {
  calculatePosition,
  isAtBoundary,
  calculateMeetingPoint,
  calculateTripDuration,
  calculatePiecewisePosition,
  calculateAverageVelocityMetrics,
  calculateWalkerRoundTrip,
  calculateRoundTripMetrics,
  calculateRelayPosition,
  calculateRelayMetrics,
  calculateRequiredSegmentSpeed,
  RELAY_CONFIG,
  ROUND_TRIP_CONFIG
} from '../src/constantVelocityPhysics.js';

console.log('Running constantVelocityPhysics.js unit tests (All Activities)...\n');

// 1. Test calculatePosition
console.log('Test 1: calculatePosition');
assert.strictEqual(calculatePosition(0, 0, 30), 0);
assert.strictEqual(calculatePosition(2, 60, 30), 120);
assert.strictEqual(calculatePosition(10, 210, -10), 110);
assert.strictEqual(calculatePosition(-5, 100, 30), 100);
console.log('✓ calculatePosition passed');

// 2. Test isAtBoundary
console.log('\nTest 2: isAtBoundary');
assert.strictEqual(isAtBoundary(240, 30), true);
assert.strictEqual(isAtBoundary(0, -30), true);
assert.strictEqual(isAtBoundary(100, 30), false);
console.log('✓ isAtBoundary passed');

// 3. Test calculateMeetingPoint
console.log('\nTest 3: calculateMeetingPoint');
const meet1 = calculateMeetingPoint(0, 30, 210, -10);
assert.ok(meet1);
assert.strictEqual(meet1.time, 5.25);
assert.strictEqual(meet1.position, 157.5);
console.log('✓ calculateMeetingPoint passed');

// 4. Test Arduino Trips Piecewise Motion
console.log('\nTest 4: calculatePiecewisePosition');
const posAtFinish = calculatePiecewisePosition(12.0, { x0: 0, xTape: 100, xf: 0, v1: 15, v2: -30 });
assert.strictEqual(posAtFinish.isFinished, true);
assert.strictEqual(posAtFinish.x, 0.0);
console.log('✓ Piecewise motion passed');

// 5. Test calculateWalkerRoundTrip & calculateRoundTripMetrics (Part 1 & 2)
console.log('\nTest 5: Walker Round Trip');
// 10m turnaround: fast out (4 m/s => 2.5s), slow back (-2 m/s => 5.0s) -> total 7.5s
const rtWalk = calculateWalkerRoundTrip(2.0, 10.0, 4.0, -2.0);
assert.strictEqual(rtWalk.segment, 1);
assert.strictEqual(rtWalk.x, 8.0);

const rtWalkRet = calculateWalkerRoundTrip(4.5, 10.0, 4.0, -2.0);
assert.strictEqual(rtWalkRet.segment, 2);
// at t=4.5: dt = 4.5 - 2.5 = 2.0s -> x = 10 - 2.0 * 2 = 6.0m
assert.strictEqual(rtWalkRet.x, 6.0);

const rtMetrics = calculateRoundTripMetrics(10.0, 2.5, 7.5);
assert.strictEqual(rtMetrics.total.dx, 0.0, 'Total displacement is 0');
assert.strictEqual(rtMetrics.total.distance, 20.0, 'Total distance is 20m');
assert.strictEqual(rtMetrics.total.averageVelocity, 0.0, 'Average velocity is 0 m/s');
assert.strictEqual(Math.round(rtMetrics.total.averageSpeed * 100) / 100, 2.67, 'Average speed is 2.67 m/s');
assert.strictEqual(rtMetrics.total.arithmeticMeanVelocity, 1.0, '(4 + (-2))/2 = 1.0 m/s, not average velocity');
console.log('✓ Walker Round Trip passed');

// 6. Test 3-Person Relay (Part 3 & 4)
console.log('\nTest 6: 3-Person Relay');
// S1: 0->8m at 4 m/s (2s), S2: 8->12m at 2 m/s (2s -> cumulative 4s), S3: 12->16m at 1 m/s (4s -> cumulative 8s)
const relayPos1 = calculateRelayPosition(1.0, RELAY_CONFIG);
assert.strictEqual(relayPos1.activeStudent, 1);
assert.strictEqual(relayPos1.x, 4.0);

const relayPos2 = calculateRelayPosition(3.0, RELAY_CONFIG);
assert.strictEqual(relayPos2.activeStudent, 2);
assert.strictEqual(relayPos2.x, 10.0);

const relayPos3 = calculateRelayPosition(6.0, RELAY_CONFIG);
assert.strictEqual(relayPos3.activeStudent, 3);
assert.strictEqual(relayPos3.x, 14.0);

const relayMetrics = calculateRelayMetrics(2.0, 4.0, 8.0, RELAY_CONFIG);
assert.strictEqual(relayMetrics.student1.v, 4.0);
assert.strictEqual(relayMetrics.student2.v, 2.0);
assert.strictEqual(relayMetrics.student3.v, 1.0);
assert.strictEqual(relayMetrics.total.averageVelocity, 2.0, '16m / 8s = 2.0 m/s');
assert.strictEqual(relayMetrics.total.averageSpeed, 2.0, 'Unidirectional motion');
console.log('✓ 3-Person Relay passed');

// 7. Test Part 5 Challenge (Question 11)
console.log('\nTest 7: Challenge 11 (Target Average Velocity)');
// Target = 6 m/s for 16m -> total time allowed = 16 / 6 = 2.6667s.
// S1 (0->8m at 4 m/s => 2.0s), S2 (8->12m at 2 m/s => 2.0s) -> total used = 4.0s > 2.6667s => Impossible!
const challImp = calculateRequiredSegmentSpeed(6.0, 4.0, 2.0, RELAY_CONFIG);
assert.strictEqual(challImp.possible, false, 'Should be impossible since first two runners used 4.0s > 2.67s');

// If S1 was 8 m/s (1.0s) and S2 was 8 m/s (0.5s) -> time used = 1.5s -> remaining time for 16/6=2.67s is 1.167s -> v3 = 4/1.167 = 3.43 m/s
const challPoss = calculateRequiredSegmentSpeed(6.0, 8.0, 8.0, RELAY_CONFIG);
assert.strictEqual(challPoss.possible, true);
assert.strictEqual(Math.round(challPoss.v3Required * 100) / 100, 3.43);
console.log('✓ Challenge 11 passed');

console.log('\nAll tests completed successfully!');
