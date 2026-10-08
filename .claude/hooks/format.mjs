import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const file = input.tool_input?.file_path
  if (file && /\.(ts|tsx|js|jsx|json|css|md)$/.test(file) && !file.includes('node_modules')) {
    execFileSync('npx', ['prettier', '--write', file, '--log-level', 'silent'], {
      stdio: 'ignore',
      shell: true
    })
  }
} catch {
  // formatting is best-effort; never block an edit
}
