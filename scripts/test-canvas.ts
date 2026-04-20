// Test if canvas package works
async function main() {
  try {
    const canvas = await import('canvas');
    const cv = canvas.createCanvas(100, 100);
    console.log('canvas package works:', !!cv, 'type:', typeof cv);
  } catch (e: any) {
    console.log('canvas package FAILED:', e.message);
  }
  
  try {
    const napiCanvas = await import('@napi-rs/canvas');
    const cv = napiCanvas.createCanvas(100, 100);
    console.log('@napi-rs/canvas works:', !!cv);
  } catch (e: any) {
    console.log('@napi-rs/canvas FAILED:', e.message);
  }
}
main();
