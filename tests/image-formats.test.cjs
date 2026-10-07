const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function filesIn(directory){
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

function loadFunction(html, name, context){
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(html);
  assert(match, name);
  vm.runInContext(html.slice(match.index, html.indexOf('\n}', match.index) + 2), context);
}

for(const root of ['zadania', 'img']){
  for(const file of filesIn(root).filter(file => file.endsWith('.png'))){
    assert(!fs.existsSync(file.slice(0, -4) + '.webp'), `Duplicate image formats: ${file}`);
  }
}

const folderFormats = new Map();
for(const file of filesIn('zadania')){
  const format = path.extname(file);
  if(!['.png', '.webp'].includes(format)) continue;
  const folder = path.dirname(file);
  if(!folderFormats.has(folder)) folderFormats.set(folder, new Set());
  folderFormats.get(folder).add(format);
  assert.equal(folderFormats.get(folder).size, 1, `Mixed task image formats: ${folder}`);
}

const html = fs.readFileSync('zadania.html', 'utf8');
const imageContext = vm.createContext({});
for(const name of ['isProtectedCoursePath', 'optimizedImageCandidate', 'imageCandidates']){
  loadFunction(html, name, imageContext);
}
const match = html.match(/const TASK_SOURCES = (\[[\s\S]*?\n\]);/);
assert(match, 'Task sources');
const sources = vm.runInNewContext(match[1]);
let checked = 0;

for(const source of sources){
  const tasks = JSON.parse(fs.readFileSync(source.path, 'utf8'));
  for(const task of tasks){
    const references = [task.file, task.contextFile].filter(Boolean);
    for(const name of ['solutions', 'gradingCriteriaFiles']){
      for(const entry of task[name] || []) references.push(typeof entry === 'string' ? entry : entry.file);
    }
    for(const reference of references.filter(Boolean)){
      const file = path.join(path.dirname(source.path), reference);
      assert(imageContext.imageCandidates(file).some(candidate => fs.existsSync(candidate)), file);
      checked++;
    }
  }
}
assert(checked > 1000, 'Check images across all course and exam sources');

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const calls = [];
const adminContext = vm.createContext({
  isProtectedCoursePath: file => file.startsWith('zadania/kurs/'),
  courseAssetApiPath: file => '/api/course-assets/' + file.slice('zadania/kurs/'.length),
  window: {apiFetchBlob: async file => {calls.push(file); return 'protected PNG';}},
  fetch: async file => {calls.push(file); return {ok: file.endsWith('.webp'), blob: async () => 'exam WebP'};}
});
loadFunction(adminHtml, 'fetchImageBlob', adminContext);

(async () => {
  assert.equal(await adminContext.fetchImageBlob('zadania/eo/2022/maj/task.png'), 'exam WebP');
  assert.deepEqual(calls.splice(0), ['zadania/eo/2022/maj/task.webp']);
  assert.equal(await adminContext.fetchImageBlob('zadania/kurs/eo/lekcja_1/1.png'), 'protected PNG');
  assert.deepEqual(calls.splice(0), ['/api/course-assets/eo/lekcja_1/1.png']);
  adminContext.fetch = async file => {
    calls.push(file);
    return {ok: file.endsWith('.png'), blob: async () => 'PNG without a WebP counterpart'};
  };
  assert.equal(await adminContext.fetchImageBlob('zadania/eo/legacy/task.png'), 'PNG without a WebP counterpart');
  assert.deepEqual(calls, ['zadania/eo/legacy/task.webp', 'zadania/eo/legacy/task.png']);
  console.log(`PASS: one image format per file, ${checked} references resolve, public WebP and canonical course images preserved`);
})().catch(error => {console.error(error);process.exitCode = 1;});
