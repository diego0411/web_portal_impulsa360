import dotenv from 'dotenv'
import { createAdminApiApp, resolvePort } from './app.js'

dotenv.config()

const app = createAdminApiApp()
const port = resolvePort(process.env.ADMIN_API_PORT)

app.listen(port, () => {
  console.log(`Admin API escuchando en http://localhost:${port}`)
})
