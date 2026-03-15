import * as fs from 'fs';
import * as fsp from 'fs/promises';

const code = fs.readFileSync('src/mcp_servers/health_monitor/index.ts', 'utf-8');
const newCode = code.replace(/import \* as _fs from "fs\/promises";/, '');
fs.writeFileSync('src/mcp_servers/health_monitor/index.ts', newCode);
