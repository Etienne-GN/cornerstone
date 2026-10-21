import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const IMPORT_RE =
  /^[ \t]*import\s+(?:[^'";]*?\sfrom\s+)?['"][^'"]+['"][ \t]*;?[ \t]*$/gm
const EXPORT_DECL_RE =
  /^export\s+(?:default\s+)?((?:async\s+)?(?:const|let|var|function\*?|class)\s+)([A-Za-z_$][\w$]*)/gm

// Evaluate a GJS ES module in a vm context. `fakes` become globals, imports
// are stripped, and the namespace of exported declarations is returned.
export function loadGjs(path, fakes = {}) {
  const names = []
  const source = readFileSync(path, 'utf8')
    .replace(IMPORT_RE, '')
    .replace(EXPORT_DECL_RE, (_, kind, name) => {
      names.push(name)
      return `${kind}${name}`
    })

  const context = vm.createContext({ ...fakes })
  return vm.runInContext(`${source}\n;({${names.join(',')}})`, context, {
    filename: path,
  })
}
