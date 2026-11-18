require('esbuild').buildSync({
  entryPoints: ['src/immersive-scene.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome90'],
  outfile: 'app/immersive-scene.js',
  legalComments: 'linked'
});
require('node:fs').copyFileSync('node_modules/three/LICENSE', 'app/THREE-LICENSE.txt');
console.log('Offline immersive scene bundled.');
