import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve('dist')
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir).filter((file) => file.endsWith('.d.ts'))

  for (const file of files) {
    const filePath = path.join(distDir, file)
    const content = fs.readFileSync(filePath, 'utf-8')
    const updated = content
      .replace(/(from\s+['"])(\.\.?\/[^'"]+?)(?<!\.[a-zA-Z0-9]+)(['"])/g, '$1$2.js$3')
      .replace(/(import\s*\(\s*['"])(\.\.?\/[^'"]+?)(?<!\.[a-zA-Z0-9]+)(['"]\s*\))/g, '$1$2.js$3')

    if (updated !== content) {
      fs.writeFileSync(filePath, updated, 'utf-8')
      console.log(`[fix-dts] Added .js extensions to ${file}`)
    }
  }
}
