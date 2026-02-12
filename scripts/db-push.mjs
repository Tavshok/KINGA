import { spawn } from 'child_process';
import { createInterface } from 'readline';

function runCommand(cmd, args, autoRespond = false) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: '/home/ubuntu/kinga-replit',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });
    
    let output = '';
    
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      
      // Auto-answer "create column" / "create table" prompts
      if (autoRespond && (text.includes('created or renamed') || text.includes('create column') || text.includes('create table'))) {
        setTimeout(() => {
          proc.stdin.write('\n');
        }, 100);
      }
    });
    
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
      
      if (autoRespond && (text.includes('created or renamed') || text.includes('create column') || text.includes('create table'))) {
        setTimeout(() => {
          proc.stdin.write('\n');
        }, 100);
      }
    });
    
    proc.on('close', (code) => {
      resolve({ code, output });
    });
    
    proc.on('error', reject);
    
    // Safety timeout
    setTimeout(() => {
      proc.kill();
      resolve({ code: -1, output });
    }, 120000);
  });
}

console.log('=== Running drizzle-kit generate ===');
const genResult = await runCommand('npx', ['drizzle-kit', 'generate'], true);
console.log(`\n=== Generate exit code: ${genResult.code} ===\n`);

console.log('=== Running drizzle-kit migrate ===');
const migResult = await runCommand('npx', ['drizzle-kit', 'migrate'], false);
console.log(`\n=== Migrate exit code: ${migResult.code} ===`);
