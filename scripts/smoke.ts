import { generateSnippet, getModelInfo } from '../src/lib/llm.js';
import {
  backspace,
  createTypingState,
  isComplete,
  progress,
  typeChar,
} from '../src/typing/state.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('ASSERT FAIL:', msg);
    process.exit(1);
  }
}

function testTyping() {
  let s = createTypingState('abc');
  s = typeChar(s, 'a');
  s = typeChar(s, 'X');
  s = typeChar(s, 'c');
  assert(s.cursor === 3, 'cursor at end');
  assert(s.marks[0] === 'correct', 'mark0 correct');
  assert(s.marks[1] === 'incorrect', 'mark1 incorrect');
  assert(s.marks[2] === 'correct', 'mark2 correct');
  assert(!isComplete(s), 'not complete with mistake');

  s = backspace(s);
  s = backspace(s);
  s = typeChar(s, 'b');
  s = typeChar(s, 'c');
  assert(isComplete(s), 'complete after fix');
  assert(progress(s).mistakes === 0, 'no mistakes after fix');

  // Newline handling
  let nl = createTypingState('a\nb');
  nl = typeChar(nl, 'a');
  nl = typeChar(nl, '\n');
  nl = typeChar(nl, 'b');
  assert(isComplete(nl), 'newline target completes');
  console.log('typing tests passed');
}

async function testLLM() {
  const info = getModelInfo();
  console.log('LM Studio:', info);
  const out = await generateSnippet({ prompt: 'Pythonでフィボナッチ数列を再帰で実装してください' });
  console.log('--- generated ---');
  console.log(out);
  console.log('--- end ---');
  assert(out.length > 0, 'snippet not empty');
  assert(!out.includes('```'), 'no fences');
  assert(!out.includes('\t'), 'no tabs');
}

(async () => {
  testTyping();
  await testLLM();
  console.log('smoke ok');
})();
