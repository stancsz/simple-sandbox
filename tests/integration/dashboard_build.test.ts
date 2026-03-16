import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

describe('Dashboard Build', () => {
    it('should build successfully', async () => {
        const dashboardPath = join(process.cwd(), 'scripts', 'dashboard');

        try {
            const { stdout, stderr } = await execAsync('npm run build', { cwd: dashboardPath });
            console.log(stdout);
            expect(stderr).not.toContain('ERR!');
        } catch (error) {
            console.error(error);
            throw error;
        }
    }, 60000); // Allow up to 60s for the build
});
