// lib/markov/beauty-model.test.ts
/**
 * Complete test suite for Alkami Beauty-Tech Markov Model
 * Run: npx tsx lib/markov/beauty-model.test.ts
 */
 
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
 
import { 
  classifyBeautyEvent, 
  isReturnCustomer, 
  isValidBeautyTransition 
} from './classify.beauty';
import { classifyRiskSegment } from './risk-segment';
import { BeautyState } from './type.beauty';
 
// ════════════════════════════════════════════════════════════════════
// TEST 1: EVENT CLASSIFICATION
// ════════════════════════════════════════════════════════════════════
 
function testEventClassification() {
  console.log('\n═══ TEST 1: EVENT CLASSIFICATION ═══\n');
  
  const tests = [
    {
      event: 'session_start',
      is_return: false,
      total_visits: 0,
      expected: 'B',
      description: 'New visitor landing on site'
    },
    {
      event: 'barber_profile_view',
      is_return: false,
      total_visits: 0,
      expected: 'V',
      description: 'Looking at specific barber'
    },
    {
      event: 'booking_created',
      is_return: false,
      total_visits: 0,
      expected: 'A',
      description: 'First-time booking'
    },
    {
      event: 'booking_created',
      is_return: true,
      total_visits: 1,
      expected: 'R',
      description: 'Return customer booking (override to R)'
    },
    {
      event: 'appointment_completed',
      is_return: false,
      total_visits: 0,
      expected: 'C',
      description: 'First appointment done'
    },
    {
      event: 'appointment_completed',
      is_return: true,
      total_visits: 1,
      expected: 'R',
      description: '2nd appointment done (override to R)'
    },
    {
      event: 'churn_classified',
      is_return: false,
      total_visits: 1,
      expected: 'X',
      description: 'Customer lapsed'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = classifyBeautyEvent(
      test.event,
      test.is_return,
      test.total_visits
    );
    
    const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
    if (result === test.expected) passed++;
    else failed++;
    
    console.log(`${status} - ${test.description}`);
    console.log(`  Event: ${test.event} → State: ${result} (expected: ${test.expected})\n`);
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}
 
// ════════════════════════════════════════════════════════════════════
// TEST 2: RETURN CUSTOMER DETECTION
// ════════════════════════════════════════════════════════════════════
 
function testReturnCustomerDetection() {
  console.log('\n═══ TEST 2: RETURN CUSTOMER DETECTION ═══\n');
  
  const tests = [
    {
      completed_appts: 0,
      has_membership: false,
      has_loyalty: false,
      expected: false,
      description: 'Brand new customer'
    },
    {
      completed_appts: 1,
      has_membership: false,
      has_loyalty: false,
      expected: true,
      description: 'One completed appointment'
    },
    {
      completed_appts: 0,
      has_membership: true,
      has_loyalty: false,
      expected: true,
      description: 'Active membership'
    },
    {
      completed_appts: 0,
      has_membership: false,
      has_loyalty: true,
      expected: true,
      description: 'Claimed loyalty reward'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = isReturnCustomer(
      test.completed_appts,
      test.has_membership,
      test.has_loyalty
    );
    
    const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
    if (result === test.expected) passed++;
    else failed++;
    
    console.log(`${status} - ${test.description}`);
    console.log(`  Result: ${result} (expected: ${test.expected})\n`);
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}
 
// ════════════════════════════════════════════════════════════════════
// TEST 3: TRANSITION VALIDATION
// ════════════════════════════════════════════════════════════════════
 
function testTransitionValidation() {
  console.log('\n═══ TEST 3: TRANSITION VALIDATION ═══\n');
  
  const tests = [
    { from: 'B', to: 'V', expected: true, description: 'Browse → Viewing (valid)' },
    { from: 'B', to: 'A', expected: true, description: 'Browse → Appointment (valid)' },
    { from: 'B', to: 'R', expected: false, description: 'Browse → Return (INVALID)' },
    { from: 'V', to: 'A', expected: true, description: 'Viewing → Appointment (valid)' },
    { from: 'V', to: 'R', expected: false, description: 'Viewing → Return (INVALID)' },
    { from: 'A', to: 'C', expected: true, description: 'Appointment → Completed (valid)' },
    { from: 'A', to: 'A', expected: false, description: 'Appointment → Appointment (INVALID)' },
    { from: 'C', to: 'R', expected: true, description: 'Completed → Return (valid)' },
    { from: 'X', to: 'B', expected: false, description: 'Churn → Browse (INVALID - absorbing)' },
    { from: 'X', to: 'X', expected: true, description: 'Churn → Churn (valid - absorbing)' }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = isValidBeautyTransition(
      test.from as BeautyState,
      test.to as BeautyState
    );
    
    const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
    if (result === test.expected) passed++;
    else failed++;
    
    console.log(`${status} - ${test.description}`);
    console.log(`  ${test.from} → ${test.to}: ${result} (expected: ${test.expected})\n`);
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}
 
// ════════════════════════════════════════════════════════════════════
// TEST 4: RISK SEGMENT CLASSIFICATION
// ════════════════════════════════════════════════════════════════════
 
function testRiskSegmentation() {
  console.log('\n═══ TEST 4: RISK SEGMENT CLASSIFICATION ═══\n');
  
  const tests = [
    {
      state: 'B' as BeautyState,
      churn_5: 0.68,
      loyalty: 0.24,
      gap_ratio: 1.8,
      days_since: 50,
      expected: 'at_risk',
      description: 'High churn, low loyalty, overdue'
    },
    {
      state: 'V' as BeautyState,
      churn_5: 0.42,
      loyalty: 0.50,
      gap_ratio: 1.2,
      days_since: 35,
      expected: 'on_the_fence',
      description: 'Moderate risk, recoverable'
    },
    {
      state: 'R' as BeautyState,
      churn_5: 0.14,
      loyalty: 0.85,
      gap_ratio: 0.9,
      days_since: 25,
      expected: 'loyal',
      description: 'Low risk, high loyalty, on schedule'
    },
    {
      state: 'X' as BeautyState,
      churn_5: 1.00,
      loyalty: 0.00,
      gap_ratio: 3.5,
      days_since: 100,
      expected: 'churned',
      description: 'Already in churn state'
    },
    {
      state: 'C' as BeautyState,
      churn_5: 0.35,
      loyalty: 0.74,
      gap_ratio: 0.5,
      days_since: 14,
      expected: 'loyal',
      description: 'First-time customer, recent visit'
    },
    {
      state: 'A' as BeautyState,
      churn_5: 0.18,
      loyalty: 0.70,
      gap_ratio: 0.3,
      days_since: 7,
      expected: 'loyal',
      description: 'Appointment booked - no intervention needed'
    },
    {
      state: 'B' as BeautyState,
      churn_5: 0.55,
      loyalty: 0.30,
      gap_ratio: 2.6,
      days_since: 75,
      expected: 'churned',
      description: 'Gap ratio > 2.5 triggers churn'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = classifyRiskSegment(
      test.state,
      test.churn_5,
      test.loyalty,
      test.gap_ratio,
      test.days_since
    );
    
    const status = result.segment === test.expected ? '✅ PASS' : '❌ FAIL';
    if (result.segment === test.expected) passed++;
    else failed++;
    
    console.log(`${status} - ${test.description}`);
    console.log(`  State: ${test.state}, Churn: ${test.churn_5}, Loyalty: ${test.loyalty}, Gap: ${test.gap_ratio}`);
    console.log(`  Segment: ${result.segment} (expected: ${test.expected})`);
    console.log(`  Priority: ${result.intervention_priority}`);
    console.log(`  Action: ${result.recommended_action.substring(0, 80)}...\n`);
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}
 
// ════════════════════════════════════════════════════════════════════
// TEST 5: BARBERSHOP-SPECIFIC SCENARIOS
// ════════════════════════════════════════════════════════════════════
 
function testBarbershopScenarios() {
  console.log('\n═══ TEST 5: BARBERSHOP-SPECIFIC SCENARIOS ═══\n');
  
  const scenarios = [
    {
      name: 'New customer books first haircut',
      events: ['session_start', 'barber_profile_view', 'booking_created'],
      is_return: false,
      total_visits: 0,
      expected_final_state: 'A'
    },
    {
      name: 'First haircut completed',
      events: ['appointment_completed'],
      is_return: false,
      total_visits: 0,
      expected_final_state: 'C'
    },
    {
      name: 'Customer rebooks at chair',
      events: ['rebook_at_chair'],
      is_return: true,
      total_visits: 1,
      expected_final_state: 'R'
    },
    {
      name: 'Returning customer books 2nd haircut',
      events: ['booking_created'],
      is_return: true,
      total_visits: 1,
      expected_final_state: 'R'
    },
    {
      name: '2nd haircut completed',
      events: ['appointment_completed'],
      is_return: true,
      total_visits: 1,
      expected_final_state: 'R'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    const final_event = scenario.events[scenario.events.length - 1];
    const result = classifyBeautyEvent(
      final_event,
      scenario.is_return,
      scenario.total_visits
    );
    
    const status = result === scenario.expected_final_state ? '✅ PASS' : '❌ FAIL';
    if (result === scenario.expected_final_state) passed++;
    else failed++;
    
    console.log(`${status} - ${scenario.name}`);
    console.log(`  Events: ${scenario.events.join(' → ')}`);
    console.log(`  Final State: ${result} (expected: ${scenario.expected_final_state})\n`);
  }
  
  console.log(`Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}
 
// ════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ════════════════════════════════════════════════════════════════════
 
async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  ALKAMI BEAUTY-TECH MARKOV MODEL - TEST SUITE            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  const results = {
    'Event Classification': testEventClassification(),
    'Return Customer Detection': testReturnCustomerDetection(),
    'Transition Validation': testTransitionValidation(),
    'Risk Segmentation': testRiskSegmentation(),
    'Barbershop Scenarios': testBarbershopScenarios()
  };
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  FINAL RESULTS                                            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  let all_passed = true;
  for (const [name, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${name}`);
    if (!passed) all_passed = false;
  }
  
  console.log('\n' + '═'.repeat(60));
  
  if (all_passed) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('✅ Markov model is configured correctly for Alkami');
    console.log('✅ Ready to deploy to production\n');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('⚠️  Review failed tests above');
    console.log('⚠️  Fix issues before deploying\n');
  }
  
  console.log('═'.repeat(60) + '\n');
}
 
// Run tests
runAllTests().catch(console.error);