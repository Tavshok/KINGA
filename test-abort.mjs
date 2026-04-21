// Test if AbortController actually aborts a fetch in Node.js 22
const controller = new AbortController();
const start = Date.now();
setTimeout(() => {
  console.log('Aborting after 200ms...');
  controller.abort();
}, 200);

try {
  const resp = await fetch('https://httpbin.org/delay/10', { signal: controller.signal });
  console.log('fetch completed (unexpected):', resp.status);
} catch (e) {
  console.log('fetch aborted after', Date.now()-start, 'ms');
  console.log('Error name:', e.name);
  console.log('Error message:', e.message);
}
