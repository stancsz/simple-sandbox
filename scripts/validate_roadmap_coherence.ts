import * as fs from 'fs';
import * as path from 'path';

function validateRoadmapCoherence() {
  const roadmapPath = path.join(process.cwd(), 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    console.error('❌ ROADMAP.md not found.');
    process.exit(1);
  }

  const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');

  // Find all Phase headers and their completion statuses
  const phaseRegex = /- \*\*Phase (\d+):[^*]+\*\*: (Completed ✅|Planned)/g;
  let match;
  const phaseStatuses: { phaseNumber: number; status: string }[] = [];

  while ((match = phaseRegex.exec(roadmapContent)) !== null) {
    phaseStatuses.push({
      phaseNumber: parseInt(match[1], 10),
      status: match[2],
    });
  }

  console.log('--- Starting Roadmap Coherence Validation ---');
  let allTestsPassed = true;

  // Check logical coherence
  let highestCompletedPhase = 0;
  for (const phase of phaseStatuses) {
    if (phase.status === 'Completed ✅') {
      if (phase.phaseNumber > highestCompletedPhase) {
        highestCompletedPhase = phase.phaseNumber;
      }
    } else if (phase.status === 'Planned') {
      if (phase.phaseNumber < highestCompletedPhase) {
        console.error(`❌ LOGIC ERROR: Phase ${phase.phaseNumber} is marked as "Planned", but Phase ${highestCompletedPhase} is already "Completed ✅".`);
        allTestsPassed = false;
      }
    }
  }

  if (allTestsPassed) {
    console.log('✅ Chronological Logic Check: PASS');
  }

  // Find all Validation paths
  const validationRegex = /✅ Validated via `([^`]+)`/g;
  let validationMatch;
  let validationCount = 0;

  while ((validationMatch = validationRegex.exec(roadmapContent)) !== null) {
    const testFileRelativePath = validationMatch[1];
    validationCount++;

    const testFileFullPath = path.join(process.cwd(), testFileRelativePath);

    if (fs.existsSync(testFileFullPath)) {
      console.log(`✅ FOUND: ${testFileRelativePath}`);
    } else {
      console.error(`❌ MISSING: ${testFileRelativePath} referenced in ROADMAP.md does not exist.`);
      allTestsPassed = false;
    }
  }

  console.log('-----------------------------------');
  if (allTestsPassed && validationCount > 0) {
    console.log(`✅ SUCCESS: Roadmap validation passed. Checked ${validationCount} test references and chronological logic.`);
    process.exit(0);
  } else {
    console.error('❌ FAILED: Roadmap validation failed.');
    process.exit(1);
  }
}

validateRoadmapCoherence();
