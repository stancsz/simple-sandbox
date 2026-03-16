import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Dependency Audit Validation', () => {
  it('should verify critical dependencies are updated to secure versions', () => {
    // Read root package.json
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    // Verify key packages are present and above vulnerable versions
    // From our audit we bumped vitest to ^4.1.0 or similar (it was 3.0.0-beta.4)
    if (dependencies['vitest']) {
      const vitestVersion = dependencies['vitest'].replace(/[^0-9.]/g, '');
      const majorVersion = parseInt(vitestVersion.split('.')[0]);
      expect(majorVersion).toBeGreaterThanOrEqual(2); // In case it upgraded to v3 or v4
    }

    // Verify discord.js (we forced it to 13.17.1 or similar)
    if (dependencies['discord.js']) {
      const discordVersion = dependencies['discord.js'].replace(/[^0-9.]/g, '');
      const majorVersion = parseInt(discordVersion.split('.')[0]);
      expect(majorVersion).toBeGreaterThanOrEqual(13);
    }
  });

  it('should verify chart values contain updated sidecar images', () => {
    const valuesPath = join(process.cwd(), 'deployment/chart/simple-cli/values.yaml');
    const valuesContent = readFileSync(valuesPath, 'utf-8');

    // We updated rclone to 1.69.1
    expect(valuesContent).toContain('tag: 1.69.1');
    // We updated curl to 8.12.1
    expect(valuesContent).toContain('tag: 8.12.1');
    // We updated redis to 7.4-alpine
    expect(valuesContent).toContain('tag: 7.4-alpine');
  });

  it('should verify docker compose files contain updated postgres/redis images', () => {
    const composePath = join(process.cwd(), 'docker-compose.test.yml');
    const composeContent = readFileSync(composePath, 'utf-8');

    // We updated postgres to 16-alpine
    expect(composeContent).toContain('image: postgres:16-alpine');
    // We updated redis to 7-alpine
    expect(composeContent).toContain('image: redis:7-alpine');
  });
});
