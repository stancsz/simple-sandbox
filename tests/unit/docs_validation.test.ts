import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Documentation Updates Validation', () => {
  it('should verify ROADMAP.md has the correct Phase 38 status and format', () => {
    const roadmapPath = join(process.cwd(), 'ROADMAP.md');
    expect(existsSync(roadmapPath)).toBe(true);
    const content = readFileSync(roadmapPath, 'utf8');

    expect(content).toContain('**Last Updated**:');
    expect(content).toContain('- **Phase 38: Production Scalability & Beyond**: Completed ✅');
    expect(content).toMatch(/✅ Validated via `tests\/integration\/digital_biosphere_showcase\.test\.ts` on .+/);
  });

  it('should verify TECHNICAL_SPEC.md includes Digital Biosphere context', () => {
    const techSpecPath = join(process.cwd(), 'docs/TECHNICAL_SPEC.md');
    expect(existsSync(techSpecPath)).toBe(true);
    const content = readFileSync(techSpecPath, 'utf8');

    expect(content).toContain('**Digital Biosphere**');
    expect(content).toContain('**Hyper-Scaling Engine**');
    expect(content).toContain('**Multi-Region High Availability**');
    expect(content).toContain('## 20. Ecosystem Intelligence & Meta-Learning');
    expect(content).toContain('analyze_ecosystem_patterns');
    expect(content).toContain('apply_ecosystem_insights');
  });

  it('should verify FULL_SYSTEM_VALIDATION.md reflects Digital Biosphere Phase 38', () => {
    const valDocPath = join(process.cwd(), 'docs/FULL_SYSTEM_VALIDATION.md');
    expect(existsSync(valDocPath)).toBe(true);
    const content = readFileSync(valDocPath, 'utf8');

    expect(content).toContain('Digital Biosphere');
    expect(content).toContain('Phase 38');
    expect(content).toContain('hyper_scaling_engine');
    expect(content).toContain('tests/integration/digital_biosphere_showcase.test.ts');
  });

  it('should verify todo.md has Post-Phase 38 Maintenance section', () => {
    const todoPath = join(process.cwd(), 'docs/todo.md');
    expect(existsSync(todoPath)).toBe(true);
    const content = readFileSync(todoPath, 'utf8');

    expect(content).toContain('## Post-Phase 38: Maintenance & Enhancement (Planned)');
    expect(content).not.toContain('## Phase 23: Autonomous Agency Governance & Meta-Orchestration'); // ensure old sections are removed
  });
});
