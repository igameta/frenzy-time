import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const destination = resolve(root, 'dist');
// このスクリプトが生成する dist の内容だけを置換する。
if (relative(root, destination) !== 'dist') throw new Error('Invalid output path');
await mkdir(destination, { recursive: true });
if ((await lstat(destination)).isSymbolicLink()) throw new Error('dist must not be a symbolic link');
for (const item of await readdir(destination)) {
  const target = resolve(destination, item);
  if (relative(destination, target).startsWith('..')) throw new Error('Invalid cleanup path');
  await rm(target, { recursive: true, force: true });
}
for (const entry of ['index.html', 'live.html', 'styles.css', 'config.js', 'src', 'data', 'assets']) {
  await cp(resolve(root, entry), resolve(destination, entry), { recursive: true });
}
console.log('静的サイトを dist/ に出力しました。');
